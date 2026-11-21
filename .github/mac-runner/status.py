#!/usr/bin/env python3
"""Mac runner status board (AUG-1484): one GitHub issue, edited in place, readable by any system without AugieOS.

  status.py publish   (on the Mac, from the hygiene job) writes heartbeat/cleanup/capabilities/alerts into the issue
  status.py watch     (GitHub-hosted) marks the board OFFLINE when the heartbeat is older than STALE_HOURS

State is carried by labels on that issue so anything can query it: mac-runner-ok, mac-runner-alert,
mac-runner-offline. Edits and label changes don't email anyone, by design (no paging).
Never fails the job: problems are written to the board, not to a red run.
"""
import json, os, re, sys, time, urllib.request

REPO = os.environ.get("GITHUB_REPOSITORY", "augsmog/QuickScore")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
TITLE = "Mac runner status (johns-mac-mini-ios-sim)"
STALE_H = float(os.environ.get("STALE_HOURS", "3"))
STATE = os.path.expanduser(os.environ.get("AOS_MAC_HYGIENE_HOME", "~/aos-mac-hygiene"))
LABELS = {"mac-runner-ok": "0e8a16", "mac-runner-alert": "d93f0b", "mac-runner-offline": "b60205",
          "mac-runner-status": "5319e7"}


def api(method, path, body=None):
    req = urllib.request.Request(f"https://api.github.com{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        if e.code in (404, 422) and method == "POST" and "/labels" in path:
            return None
        raise


def board():
    for name, color in LABELS.items():
        api("POST", f"/repos/{REPO}/labels", {"name": name, "color": color})
    found = api("GET", f"/repos/{REPO}/issues?state=all&labels=mac-runner-status&per_page=5") or []
    if found:
        iss = found[0]
        if iss["state"] != "open":
            api("PATCH", f"/repos/{REPO}/issues/{iss['number']}", {"state": "open"})
        return iss
    return api("POST", f"/repos/{REPO}/issues", {"title": TITLE, "labels": ["mac-runner-status"],
                                                  "body": "Mac runner status board (AUG-1484). Edited in place by automation."})


def load(name):
    try:
        with open(os.path.join(STATE, name)) as f:
            return json.loads(f.read().strip().splitlines()[-1])
    except Exception:
        return None


def set_labels(iss, on):
    keep = [l["name"] for l in iss.get("labels", []) if not l["name"].startswith("mac-runner-")]
    api("PUT", f"/repos/{REPO}/issues/{iss['number']}/labels", {"labels": keep + ["mac-runner-status"] + sorted(on)})


def publish():
    # PUBLIC repo: publish only operational numbers. Host/security posture (FileVault, auto-login, sudo, pmset,
    # hostname, uptime) stays in ~/aos-mac-hygiene/capabilities.json on the Mac and goes to private Linear, never here.
    iss = board()
    hb, cl, alert = load("heartbeat.json") or {}, load("last-cleanup.json"), load("alert-disk.json")
    epoch = int(time.time())
    alerts = []
    if alert:
        alerts.append(f"Disk: {alert['free_gb']} GB free after full escalating cleanup (floor {alert['floor_gb']} GB). Jobs still run.")
    if hb.get("runner_service") not in ("running", None):
        alerts.append(f"Runner service was {hb.get('runner_service')}; watchdog restarting it.")
    on = {"mac-runner-alert"} if alerts else {"mac-runner-ok"}
    pub = {k: hb.get(k) for k in ("at", "free_gb", "floor_gb", "runner_service", "job_running")}
    clean = {k: (cl or {}).get(k) for k in ("at", "before_gb", "after_gb", "levels")}
    body = "\n".join([
        f"<!-- hb:{epoch} -->",
        "Automation-maintained status board for the Mac self-hosted runner (AUG-1484). Edited in place; no pings.",
        f"Last heartbeat: **{time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(epoch))}** (hygiene job, hourly).",
        "", "## Alerts", *(f"- {a}" for a in alerts or ["none"]),
        "", "## Status", "```json", json.dumps(pub, indent=1), "```",
        "## Last cleanup", "```json", json.dumps(clean, indent=1), "```",
    ])
    api("PATCH", f"/repos/{REPO}/issues/{iss['number']}", {"body": body})
    set_labels(iss, on)
    print(f"status board #{iss['number']} updated: labels={sorted(on)} alerts={len(alerts)}")
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        open(summ, "a").write(f"Status board #{iss['number']}: {sorted(on)}; cleanup {json.dumps(clean)}\n")


def watch():
    iss = board()
    body = iss.get("body") or ""
    m = re.search(r"<!-- hb:(\d+) -->", body)
    age_h = (time.time() - int(m.group(1))) / 3600 if m else 1e9
    names = {l["name"] for l in iss.get("labels", [])}
    on = {n for n in names if n.startswith("mac-runner-") and n != "mac-runner-status"}
    banner = "**OFFLINE:** no heartbeat from the Mac for"
    body = re.sub(r"^\*\*OFFLINE:\*\*.*\n", "", body, flags=re.M)
    if age_h > STALE_H:
        on = (on - {"mac-runner-ok"}) | {"mac-runner-offline"}
        hrs = "never" if age_h > 1e8 else f"{age_h:.1f} h"
        body = re.sub(r"(<!-- hb:\d+ -->\n)?", lambda mm: (mm.group(0) or "") + f"{banner} {hrs} (checked {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}). "
                      "Runner or Mac is down, asleep or waiting at the login screen.\n", body, count=1)
    else:
        on.discard("mac-runner-offline")
        if "mac-runner-alert" not in on:
            on.add("mac-runner-ok")
    api("PATCH", f"/repos/{REPO}/issues/{iss['number']}", {"body": body})
    set_labels(iss, on)
    print(f"watch: heartbeat age {age_h:.1f} h, labels {sorted(on)}")


if __name__ == "__main__":
    try:
        {"publish": publish, "watch": watch}[sys.argv[1]]()
    except Exception as e:  # never red: a failed scheduled run would email whoever last edited the cron
        print(f"::warning::mac runner status {sys.argv[1:]} failed: {e}")
