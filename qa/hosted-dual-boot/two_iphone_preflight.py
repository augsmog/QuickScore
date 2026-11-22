#!/usr/bin/env python3
"""Owned two-device capacity preflight; no app, backend, downloads, or global changes."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import platform
import pwd
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid

XCODE = "/Applications/Xcode_26.4.1.app/Contents/Developer"
XCODE_ID = ("Xcode 26.4.1", "Build version 17E202")
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-4"
RUNTIME_VERSION = "26.4.1"
RUNTIME_BUILD = "23E254a"
DEVICE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"
PREFIX = "snapscore-pair-"
RECEIPT = "ownership.json"
GIB = 1 << 30
UUID_RE = re.compile(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}")
TOKEN_RE = re.compile(r"[0-9a-f]{32}")
ROLES = ("host", "guest")


class GateError(RuntimeError):
    pass


def job_context():
    expected = {"GITHUB_ACTIONS": "true", "RUNNER_OS": "macOS",
                "RUNNER_ARCH": "ARM64", "RUNNER_ENVIRONMENT": "github-hosted"}
    if (platform.system() != "Darwin" or platform.machine() != "arm64"
            or any(os.environ.get(k) != v for k, v in expected.items())):
        raise GateError("expected a standard GitHub-hosted macOS arm64 job; no simulator commands ran")
    fields = [os.environ.get(k, "") for k in ("GITHUB_REPOSITORY", "GITHUB_RUN_ID",
              "GITHUB_RUN_ATTEMPT", "GITHUB_JOB", "RUNNER_NAME", "RUNNER_TEMP")]
    if not all(fields) or not Path(fields[-1]).is_absolute():
        raise GateError("missing same-job runner identity or absolute RUNNER_TEMP")
    tmp = Path(fields[-1]).resolve(strict=True)
    if not tmp.is_dir():
        raise GateError("RUNNER_TEMP is not a directory")
    marker = hashlib.sha256(json.dumps([*fields, str(tmp)]).encode()).hexdigest()
    return tmp, marker


def command(*args, timeout=15):
    # Process-local tool selection, no xcode-select or other settings changes.
    # Do not forward ambient Xcode/CoreSimulator overrides, tokens, or credentials.
    inherited = ("USER", "LOGNAME", "TMPDIR", "__CF_USER_TEXT_ENCODING")
    env = {key: os.environ[key] for key in inherited if key in os.environ}
    env.update({"HOME": str(device_home().parents[3]), "DEVELOPER_DIR": XCODE, "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                "LC_ALL": "C"})
    label = " ".join(args[:2])
    try:
        result = subprocess.run(
            ["/usr/bin/xcrun", *args], env=env, timeout=timeout, stdin=subprocess.DEVNULL,
            capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    except subprocess.TimeoutExpired as exc:
        raise GateError(f"{label} exceeded its deadline") from exc
    except OSError as exc:
        raise GateError(f"{label} could not start ({type(exc).__name__})") from exc
    if result.returncode:
        # Suppress raw CoreSimulator output: it can contain unrelated host paths and IDs.
        raise GateError(f"{label} exited {result.returncode}")
    return result.stdout.strip()


def inventory():
    try:
        doc = json.loads(command("simctl", "list", "-j"))
        grouped = doc["devices"]
        rows = []
        for runtime, devices in grouped.items():
            if not isinstance(devices, list) or any(not isinstance(row, dict) for row in devices):
                raise TypeError("malformed device rows")
            rows.extend((runtime, row) for row in devices)
        return doc, rows
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise GateError("unsupported simctl JSON inventory") from exc


def validate_catalog():
    if tuple(command("xcodebuild", "-version").splitlines()) != XCODE_ID:
        raise GateError("expected Xcode 26.4.1 (17E202)")
    doc, rows = inventory()
    runtimes = [r for r in doc.get("runtimes", []) if r.get("identifier") == RUNTIME]
    if (len(runtimes) != 1 or runtimes[0].get("isAvailable") is not True
            or runtimes[0].get("version") != RUNTIME_VERSION
            or runtimes[0].get("buildversion") != RUNTIME_BUILD):
        raise GateError("expected installed, available iOS 26.4 runtime version 26.4.1 (23E254a)")
    if sum(d.get("identifier") == DEVICE for d in doc.get("devicetypes", [])) != 1:
        raise GateError("exact iPhone 16 Pro device type unavailable")
    supported = runtimes[0].get("supportedDeviceTypes")
    if supported and not any(d.get("identifier") == DEVICE for d in supported):
        raise GateError("installed runtime does not advertise support for iPhone 16 Pro")
    return rows


def device_home():
    # Default device set by design, so subsequent explicit-UDID tools can find our pair.
    return Path(pwd.getpwuid(os.getuid()).pw_dir) / "Library/Developer/CoreSimulator/Devices"


def free_space(tmp, minimum, phase):
    root = device_home()
    while not root.exists():
        root = root.parent
    temp_free, sim_free = (shutil.disk_usage(p).free for p in (tmp, root))
    if min(temp_free, sim_free) < minimum:
        raise GateError(f"{phase} disk floor not met: runner_temp={temp_free}, "
                        f"simulator_volume={sim_free}, required_each={minimum} bytes")
    return {"runner_temp_free_bytes": temp_free, "simulator_volume_free_bytes": sim_free}


def name_for(token, role):
    return f"{PREFIX}{token}-{role}"


def write_receipt(path, record):
    fd, spool = tempfile.mkstemp(prefix=".writing-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(record, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(spool, path)
    finally:
        if os.path.exists(spool):
            os.unlink(spool)


def read_receipt(path, tmp, marker):
    if (path.name != RECEIPT or path.is_symlink() or path.parent.is_symlink()
            or path.parent.resolve().parent != tmp):
        raise GateError("receipt must be in its private directory directly under this RUNNER_TEMP")
    if (path.parent.stat().st_mode & 0o777) != 0o700 or path.parent.stat().st_uid != os.getuid():
        raise GateError("invalid receipt directory owner or mode")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK),
                   encoding="utf-8") as stream:
        metadata = os.fstat(stream.fileno())
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid()
                or metadata.st_mode & 0o777 != 0o600 or metadata.st_size > 4096):
            raise GateError("invalid ownership receipt file")
        data = json.load(stream)
    if not isinstance(data, dict):
        raise GateError("invalid ownership receipt JSON")
    token, records = data.get("token"), data.get("records")
    if (data.get("schema") != 1 or data.get("job_marker") != marker
            or not isinstance(token, str) or not TOKEN_RE.fullmatch(token)
            or path.parent.name != PREFIX + token or not isinstance(records, dict)
            or not set(records) <= set(ROLES) or any(
                i is not None and (not isinstance(i, str) or not UUID_RE.fullmatch(i))
                for i in records.values())):
        raise GateError("ownership receipt doesn't match this job or has invalid records")
    known = [i for i in records.values() if i is not None]
    if len(known) != len(set(known)):
        raise GateError("duplicate UUID in ownership receipt")
    return data


def lookup(rows, token, role, uid):
    """Reject identity drift before invoking any mutating command."""
    name = name_for(token, role)
    candidates = [(rt, row) for rt, row in rows
                  if row.get("name") == name or (uid is not None and row.get("udid") == uid)]
    if not candidates:
        return None
    if len(candidates) == 1:
        rt, row = candidates[0]
        actual = row.get("udid")
        if (rt == RUNTIME and row.get("deviceTypeIdentifier") == DEVICE
                and row.get("name") == name and isinstance(actual, str)
                and UUID_RE.fullmatch(actual) and (uid is None or actual == uid)):
            return row
    raise GateError(f"{role} simulator ownership/identity drift; no mutation for this role")


def cleanup(path, data):
    """Best-effort for each owned role; never use a broad simctl selector."""
    token = data["token"]
    failures = []
    for role, uid in list(data["records"].items()):
        try:
            # Re-read per mutation and revalidate UUID + nonce-name + runtime + type.
            _, rows = inventory()
            row = lookup(rows, token, role, uid)
            if row:
                confirmed = row["udid"]
                if uid is None:
                    # Recover a possibly interrupted create only by the exact planned nonce-name.
                    data["records"][role] = confirmed
                    write_receipt(path, data)
                if row.get("state") != "Shutdown":
                    try:
                        command("simctl", "shutdown", confirmed, timeout=15)
                    except GateError:
                        # If it completed but the client lost the reply, inventory decides.
                        pass
                _, rows = inventory()
                row = lookup(rows, token, role, confirmed)
                if row:
                    if row.get("state") != "Shutdown":
                        raise GateError(f"{role} still not shutdown; refusing to delete it")
                    command("simctl", "delete", confirmed, timeout=15)
                    _, rows = inventory()
                    if lookup(rows, token, role, confirmed) is not None:
                        raise GateError(f"{role} deletion not verified")
            elif uid is None:
                # A cancelled/timed-out create may still be finishing within CoreSimulator.
                # Preserve the journal to permit later exact-name recovery; never claim clean.
                raise GateError(f"{role} interrupted create is not yet observable; ownership receipt retained")
            del data["records"][role]
            write_receipt(path, data)
        except (GateError, OSError) as exc:
            failures.append(str(exc))
    if failures:
        raise GateError("; ".join(failures))
    path.unlink()
    # Never recursively delete: this directory contains only our receipt.
    path.parent.rmdir()


def boot_pair(records, budget):
    deadline = time.monotonic() + budget

    def boot(item):
        role, uid = item
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise GateError(f"{role} missed dual-boot deadline")
        started = time.monotonic()
        try:
            # -b requests boot if necessary and blocks until readiness.
            command("simctl", "bootstatus", uid, "-b", timeout=remaining)
        except GateError as exc:
            raise GateError(f"{role}: {exc}") from exc
        if time.monotonic() > deadline:
            raise GateError(f"{role} missed dual-boot deadline")
        return role, round(time.monotonic() - started, 3)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(boot, item) for item in records.items()]
        timings, failures = {}, []
        for future in futures:
            try:
                role, elapsed = future.result()
                timings[role] = elapsed
            except GateError as exc:
                failures.append(str(exc))
        if failures:
            raise GateError("; ".join(failures))
    return timings


def preflight(tmp, marker, minimum, budget, keep):
    before = free_space(tmp, minimum, "before create")
    initial = validate_catalog()
    existing_ids = {r.get("udid") for _, r in initial}
    existing_names = {r.get("name") for _, r in initial}
    token = uuid.uuid4().hex
    if any(name_for(token, role) in existing_names for role in ROLES):
        raise GateError("nonce-name collision before create")
    directory = tmp / (PREFIX + token)
    directory.mkdir(mode=0o700)
    receipt = directory / RECEIPT
    data = {"schema": 1, "job_marker": marker, "token": token, "records": {}}
    write_receipt(receipt, data)
    keep_owned = False
    success = False
    try:
        for role in ROLES:
            data["records"][role] = None
            write_receipt(receipt, data)  # journal the operation before calling simctl
            uid = command("simctl", "create", name_for(token, role), DEVICE, RUNTIME)
            if (not UUID_RE.fullmatch(uid) or uid in existing_ids
                    or uid in data["records"].values()):
                raise GateError(f"{role} did not return a fresh UUID")
            data["records"][role] = uid
            write_receipt(receipt, data)
            _, rows = inventory()
            row = lookup(rows, token, role, uid)
            if not row or row.get("state") != "Shutdown" or row.get("isAvailable") is not True:
                raise GateError(f"{role} newly created device is unavailable or not Shutdown")
        _, rows = inventory()
        for role, uid in data["records"].items():
            row = lookup(rows, token, role, uid)
            if not row or row.get("state") != "Shutdown" or row.get("isAvailable") is not True:
                raise GateError(f"{role} not available and Shutdown before dual boot")
        timings = boot_pair(data["records"], budget)
        _, rows = inventory()
        for role, uid in data["records"].items():
            row = lookup(rows, token, role, uid)
            if not row or row.get("state") != "Booted" or row.get("isAvailable") is not True:
                raise GateError(f"{role} not available and Booted in the same inventory snapshot")
        during = free_space(tmp, minimum, "while both booted")
        result = {
            "status": "PASS", "scope": "dual-simulator-only",
            "xcode": {"version": "26.4.1", "build": "17E202"},
            "runtime": {"identifier": RUNTIME, "version": RUNTIME_VERSION, "build": RUNTIME_BUILD},
            "device_type": DEVICE, "boot_deadline_s": budget, "disk_floor_bytes": minimum,
            "free_disk_before": before, "free_disk_both_booted": during,
            "devices": {role: {"name": name_for(token, role), "udid": uid,
                               "state_at_probe": "Booted", "boot_wait_s": timings[role]}
                        for role, uid in data["records"].items()},
            "disposition": "retained-for-same-job" if keep else "deleted-and-verified",
        }
        if keep:
            result["cleanup_receipt"] = str(receipt)
        success = True
        keep_owned = keep
        return result
    finally:
        if not keep_owned:
            try:
                cleanup(receipt, data)
            except (GateError, OSError) as exc:
                # Report cleanup failure, but preserve a primary preflight error and its cause.
                print(f"cleanup incomplete: {exc}; same-job receipt: {receipt}", file=sys.stderr)
                if success:
                    raise


def interrupted(signum, _frame):
    raise GateError(f"interrupted (signal {signum})")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    probe = sub.add_parser("probe")
    probe.add_argument("--min-free-gib", required=True, type=int)
    probe.add_argument("--boot-timeout", default=180, type=int)
    probe.add_argument("--keep", action="store_true")
    clean = sub.add_parser("cleanup")
    clean.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "probe" and (not 1 <= args.min_free_gib <= 64 or
                                   not 1 <= args.boot_timeout <= 300):
        parser.error("min-free-gib must be 1–64 and boot-timeout 1–300 seconds")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        tmp, marker = job_context()
        if args.action == "probe":
            result = preflight(tmp, marker, args.min_free_gib * GIB, args.boot_timeout, args.keep)
        else:
            data = read_receipt(args.receipt, tmp, marker)
            cleanup(args.receipt, data)
            result = {"status": "PASS", "scope": "owned-simulators-cleaned"}
        print(json.dumps(result, sort_keys=True))
        return 0
    except (GateError, OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
        print(json.dumps({"status": "FAIL", "reason": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
