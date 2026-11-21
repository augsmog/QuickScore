#!/usr/bin/env bash
# Mac mini runner + local-agent guard (AUG-1484). Owner direction, Nov 21 2026:
#   t1585u  runner hygiene needs no approval.
#   t1589u  "Jobs not starting isn't the answer, alerting and freeing up disc space so they can run is"; keep the
#           Mac up without bothering Augie. t1590u: "you" means the system, always.
# So: low disk NEVER refuses a job. Below the floor an escalating cleanup runs, space is recorded before/after, the
# job runs anyway, and an alert is raised (status file -> GitHub status issue) only if cleanup could not get back
# above the floor. Nothing here pages anyone.
#
# Modes:
#   pre       runner job-started hook (every job): stop sims/emulators, escalate cleanup if below floor, exit 0.
#   post      runner job-completed hook (also on cancel/timeout): stop all sims, delete job sims, clear temp, exit 0.
#   sweep     launchd every 30 min: stop sims/emulators up > SWEEP_MAX_AGE_MIN (agents outside Actions), daily
#             duplicate-runtime prune, proactive cleanup below PROACTIVE_GB. Skips while an Actions job runs.
#   hygiene   scheduled hygiene workflow: same as sweep, run inside the job.
#   watchdog  launchd every 2 min: keep the runner service and the remote-access app running, write heartbeat.
#   clean     escalate all levels to TARGET_FREE_GB now.
# Escalation levels (stop as soon as free >= target):
#   1 sims: stop, delete unavailable, delete job sims (dl-*, e2e-*)
#   2 caches: DerivedData, CoreSimulator/Xcode/expo/metro/npm/CocoaPods/Gradle caches, iOS DeviceSupport,
#     runner _temp (>30 min) and _diag logs (>7 d)
#   3 runner _work checkouts untouched for 2 days (a fresh checkout recreates them)
#   4 duplicate runtimes (same major.minor, keep most recently used)
#   5 older runtimes no workflow uses (keeps the newest per platform and keep-runtimes.txt versions)
# Never touches user documents, the runner install, or a runtime a workflow uses. Processes are stopped by exact PID.
set -uo pipefail
MODE="${1:-sweep}"
MIN_FREE_GB="${MIN_FREE_GB:-25}"        # floor: below this, cleanup escalates and an alert is raised if it can't recover
TARGET_FREE_GB="${TARGET_FREE_GB:-40}"  # escalation stops once this much is free
PROACTIVE_GB="${PROACTIVE_GB:-60}"      # sweep/hygiene start cleaning here, well before the floor
SWEEP_MAX_AGE_MIN="${SWEEP_MAX_AGE_MIN:-90}"
RUNNER_ROOT="${RUNNER_ROOT:-$HOME/actions-runner-quickscore}"
STATE="${AOS_MAC_HYGIENE_HOME:-$HOME/aos-mac-hygiene}"
LOG="$STATE/guard.log"
mkdir -p "$STATE"
[ -f "$STATE/keepup.conf" ] && . "$STATE/keepup.conf"   # optional local overrides (KEEP_APPS, thresholds)
KEEP_APPS="${KEEP_APPS:-Cursor}"
log() { echo "$(date '+%Y-%m-%dT%H:%M:%S%z') [$MODE] $*" | tee -a "$LOG"; }
free_gb() { df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2{print $4}'; }
etime_min() { ps -o etime= -p "$1" 2>/dev/null | awk '{n=split($1,a,"[-:]"); if(n==4)m=a[1]*1440+a[2]*60+a[3]; else if(n==3)m=a[1]*60+a[2]; else m=a[1]; print m+0}'; }
job_running() { pgrep -f "$RUNNER_ROOT/bin/Runner.Worker" >/dev/null 2>&1; }
now() { date '+%Y-%m-%dT%H:%M:%S%z'; }

shutdown_sims() {  # $1 = max age in minutes (0 = all)
  local max="${1:-0}" n=0 pid age udid
  if [ "$max" = 0 ]; then
    n=$(xcrun simctl list devices booted 2>/dev/null | grep -c "(Booted)")
    xcrun simctl shutdown all >/dev/null 2>&1 || true
  else
    while read -r pid; do   # launchd_sim = one per booted device; its age is the device's uptime
      [ -z "$pid" ] && continue
      age=$(etime_min "$pid"); [ "${age:-0}" -lt "$max" ] && continue
      udid=$(ps -o command= -p "$pid" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -1)
      [ -n "$udid" ] && xcrun simctl shutdown "$udid" >/dev/null 2>&1 && n=$((n+1))
    done < <(pgrep -x launchd_sim)
  fi
  while read -r pid; do    # Android emulators from any agent, by exact PID
    [ -z "$pid" ] && continue
    age=$(etime_min "$pid")
    if [ "$max" = 0 ] || [ "${age:-0}" -ge "$max" ]; then kill "$pid" 2>/dev/null && n=$((n+1)); fi
  done < <(pgrep -f 'qemu-system-(aarch64|x86_64)'; pgrep -x emulator)
  log "stopped $n simulator/emulator instance(s) (max_age_min=$max)"
}

delete_job_sims() {
  xcrun simctl list devices -j 2>/dev/null | /usr/bin/python3 -c '
import json,sys
for devs in json.load(sys.stdin)["devices"].values():
    for x in devs:
        if x["name"].startswith(("dl-","e2e-")) and x["state"]=="Shutdown": print(x["udid"])' 2>/dev/null |
  while read -r u; do xcrun simctl delete "$u" >/dev/null 2>&1 || true; done
}

prune_runtimes() {  # $1 = dupes | unused
  local keep="${STATE}/keep-runtimes.txt"
  xcrun simctl runtime list -j 2>/dev/null | KEEP="$keep" PRUNE="$1" /usr/bin/python3 -c '
import json,os,sys
d=json.load(sys.stdin); rts=list(d.values()) if isinstance(d,dict) else d
mm=lambda r: ".".join(str(r.get("version","")).split(".")[:2])
plat=lambda r: r.get("platformIdentifier","")
key=lambda r: tuple(int(p) if p.isdigit() else 0 for p in str(r.get("version","0")).split("."))
keep=set()
try: keep={l.strip() for l in open(os.environ["KEEP"]) if l.strip() and not l.startswith("#")}
except OSError: pass
ok=lambda r: r.get("deletable",True) and r.get("state")!="Unusable-InUse"
out=[]
if os.environ["PRUNE"]=="dupes":
    g={}
    for r in rts: g.setdefault((plat(r),mm(r)),[]).append(r)
    for rs in g.values():
        rs.sort(key=lambda r:(r.get("lastUsedAt") or "", r.get("build") or ""), reverse=True)
        out += [r for r in rs[1:] if ok(r)]
else:
    newest={}
    for r in rts:
        p=plat(r)
        if p not in newest or key(r)>key(newest[p]): newest[p]=r
    for r in rts:
        name=("iOS " if "iphone" in plat(r).lower() else plat(r).split(".")[-1]+" ")+mm(r)
        if r is newest[plat(r)] or mm(r) in keep or name in keep or not ok(r): continue
        out.append(r)
for r in out: print(r["identifier"])' 2>/dev/null |
  while read -r rid; do [ -n "$rid" ] && { xcrun simctl runtime delete "$rid" >/dev/null 2>&1 && log "deleted runtime $rid ($1)" || log "could not delete runtime $rid"; }; done
}

level() {
  case "$1" in
    1) xcrun simctl delete unavailable >/dev/null 2>&1 || true; delete_job_sims ;;
    2) rm -rf "$HOME/Library/Developer/Xcode/DerivedData/"* "$HOME/Library/Developer/CoreSimulator/Caches/"* \
              "$HOME/Library/Caches/com.apple.dt.Xcode/"* "$HOME/Library/Developer/Xcode/iOS DeviceSupport/"* \
              "$HOME/.expo/cache" "$HOME/.npm/_cacache" "$HOME/Library/Caches/CocoaPods" "$HOME/.gradle/caches" \
              "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/haste-map-* 2>/dev/null || true
       [ -d "$RUNNER_ROOT/_work/_temp" ] && find "$RUNNER_ROOT/_work/_temp" -mindepth 1 -maxdepth 1 -mmin +30 -exec rm -rf {} + 2>/dev/null
       [ -d "$RUNNER_ROOT/_diag" ] && find "$RUNNER_ROOT/_diag" -type f -mtime +7 -delete 2>/dev/null ;;
    3) [ -d "$RUNNER_ROOT/_work" ] && find "$RUNNER_ROOT/_work" -mindepth 1 -maxdepth 1 -type d \
              ! -name _temp ! -name _actions ! -name _tool ! -name _PipelineMapping -mtime +2 -exec rm -rf {} + 2>/dev/null ;;
    4) prune_runtimes dupes ;;
    5) prune_runtimes unused ;;
  esac
}

escalate() {  # $1 = target GB, $2 = highest level allowed
  local target="$1" maxl="$2" b f l ran=0
  b=$(free_gb)
  for l in 1 2 3 4 5; do
    [ "$l" -gt "$maxl" ] && break
    f=$(free_gb); [ -n "$f" ] && [ "$f" -ge "$target" ] && break
    level "$l"; ran=$l
  done
  f=$(free_gb)
  log "cleanup: free ${b} GB -> ${f} GB (levels 1-${ran}, target ${target} GB, floor ${MIN_FREE_GB} GB)"
  printf '{"at":"%s","mode":"%s","before_gb":%s,"after_gb":%s,"levels":%s}\n' "$(now)" "$MODE" "${b:-0}" "${f:-0}" "$ran" > "$STATE/last-cleanup.json"
  if [ -n "$f" ] && [ "$f" -lt "$MIN_FREE_GB" ]; then
    printf '{"at":"%s","kind":"disk-below-floor","free_gb":%s,"floor_gb":%s,"detail":"escalating cleanup (levels 1-5) could not reach the floor; the rest is outside the safe-to-delete set"}\n' "$(now)" "$f" "$MIN_FREE_GB" > "$STATE/alert-disk.json"
    log "ALERT free ${f} GB still below floor ${MIN_FREE_GB} GB after cleanup (job is NOT refused)"
    echo "::warning::Mac runner has ${f} GB free after full cleanup (floor ${MIN_FREE_GB} GB). Job continues; alert recorded."
  else
    rm -f "$STATE/alert-disk.json"
  fi
}

maybe_clean() {  # proactive: before the floor is reached
  local f; f=$(free_gb)
  if [ "${f:-0}" -lt "$MIN_FREE_GB" ]; then escalate "$TARGET_FREE_GB" 5
  elif [ "${f:-0}" -lt "$PROACTIVE_GB" ]; then escalate "$PROACTIVE_GB" 4
  fi
}

runner_label() { [ -f "$RUNNER_ROOT/.service" ] && basename "$(cat "$RUNNER_ROOT/.service")" .plist; }

restart_runner_if_pending() {
  if [ -f "$STATE/restart-runner.pending" ] && ! job_running; then
    (cd "$RUNNER_ROOT" && ./svc.sh stop >/dev/null 2>&1; ./svc.sh start >/dev/null 2>&1) \
      && rm -f "$STATE/restart-runner.pending" && log "runner service restarted to load hooks"
  fi
}

throttled() {  # $1 name, $2 minutes: true if allowed now (and stamps)
  local s="$STATE/.throttle-$1"
  if [ -f "$s" ] && [ -z "$(find "$s" -mmin +"$2" 2>/dev/null)" ]; then return 1; fi
  touch "$s"; return 0
}

watchdog() {
  local uid label plist st runner_state=unknown apps_json="" app
  uid=$(id -u); label=$(runner_label); plist="$(cat "$RUNNER_ROOT/.service" 2>/dev/null)"
  if [ -n "$label" ]; then
    st=$(launchctl print "gui/$uid/$label" 2>/dev/null | awk -F'= ' '/^\tstate =/{print $2; exit}')
    if [ -z "$st" ]; then
      runner_state=not-loaded
      if throttled runner-bootstrap 5; then launchctl bootstrap "gui/$uid" "$plist" 2>/dev/null && log "runner service was not loaded; bootstrapped"; fi
    elif [ "$st" != running ]; then
      runner_state="$st"
      if throttled runner-kick 5; then launchctl kickstart "gui/$uid/$label" 2>/dev/null && log "runner service state=$st; kickstarted"; fi
    else runner_state=running; fi
  fi
  for app in $KEEP_APPS; do
    local up=false
    if [ -d "/Applications/$app.app" ]; then
      if pgrep -f "/Applications/$app.app/Contents/MacOS/" >/dev/null 2>&1; then up=true
      elif throttled "app-$app" 10; then open -g -j -a "/Applications/$app.app" 2>/dev/null && log "$app was not running; relaunched"; fi
    else up=absent; fi
    apps_json="$apps_json\"$app\":\"$up\","
  done
  restart_runner_if_pending
  heartbeat "$runner_state" "{${apps_json%,}}"
}

heartbeat() {  # $1 runner state, $2 apps json
  local caps="$STATE/capabilities.json"
  if [ ! -f "$caps" ] || [ -n "$(find "$caps" -mmin +360 2>/dev/null)" ]; then capabilities > "$caps.tmp" && mv "$caps.tmp" "$caps"; fi
  printf '{"at":"%s","epoch":%s,"host":"%s","uptime":"%s","free_gb":%s,"floor_gb":%s,"runner_service":"%s","apps":%s,"job_running":%s,"booted_sims":%s}\n' \
    "$(now)" "$(date +%s)" "$(scutil --get LocalHostName 2>/dev/null || hostname)" "$(uptime | sed 's/.*up \([^,]*\).*/\1/')" \
    "$(free_gb)" "$MIN_FREE_GB" "$1" "${2:-null}" "$(job_running && echo true || echo false)" \
    "$(xcrun simctl list devices booted 2>/dev/null | grep -c '(Booted)')" > "$STATE/heartbeat.json.tmp" && mv "$STATE/heartbeat.json.tmp" "$STATE/heartbeat.json"
}

capabilities() {  # what decides whether the Mac comes back by itself after a reboot / power cut
  local fv al sl ar sudo_ok
  fv=$(fdesetup status 2>/dev/null | head -1)
  al=$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || echo "")
  sl=$(pmset -g 2>/dev/null | awk '$1=="sleep"{print $2; exit}')
  ar=$(pmset -g 2>/dev/null | awk '$1=="autorestart"{print $2; exit}')
  sudo -n true 2>/dev/null && sudo_ok=true || sudo_ok=false
  printf '{"at":"%s","filevault":"%s","auto_login_user":"%s","pmset_sleep":"%s","pmset_autorestart":"%s","passwordless_sudo":%s,"user":"%s"}\n' \
    "$(now)" "$fv" "$al" "${sl:-?}" "${ar:-?}" "$sudo_ok" "$(id -un)"
}

case "$MODE" in
  pre)      if [ "${GITHUB_WORKFLOW:-}" = "mac-runner-hygiene" ]; then shutdown_sims "$SWEEP_MAX_AGE_MIN"; else shutdown_sims 0; fi
            f=$(free_gb); [ "${f:-0}" -lt "$MIN_FREE_GB" ] && escalate "$TARGET_FREE_GB" 5
            exit 0 ;;   # never refuse a job
  post)     shutdown_sims 0; delete_job_sims
            [ -d "$RUNNER_ROOT/_work/_temp" ] && find "$RUNNER_ROOT/_work/_temp" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null
            log "post: free $(free_gb) GB"; exit 0 ;;
  sweep|hygiene)
            if [ "$MODE" = sweep ] && job_running; then log "Actions job running; sweep skipped"; exit 0; fi
            shutdown_sims "$SWEEP_MAX_AGE_MIN"; level 1
            stamp="$STATE/dedupe.stamp"
            if [ ! -f "$stamp" ] || [ -n "$(find "$stamp" -mmin +1440 2>/dev/null)" ]; then prune_runtimes dupes; touch "$stamp"; fi
            maybe_clean
            [ "$MODE" = sweep ] && restart_runner_if_pending
            [ -f "$LOG" ] && tail -n 3000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
            log "$MODE: free $(free_gb) GB"; exit 0 ;;
  watchdog) watchdog; exit 0 ;;
  clean)    escalate "$TARGET_FREE_GB" 5; exit 0 ;;
  *) echo "usage: sim-guard.sh pre|post|sweep|hygiene|watchdog|clean"; exit 2 ;;
esac
