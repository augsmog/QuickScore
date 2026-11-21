#!/usr/bin/env bash
# Mac mini runner + local-agent simulator/disk guard (AUG-1484).
# Augie t1585u (Nov 21 2026): runner hygiene needs no approval. Augie 9:19 AM ET Nov 21, after a reboot showed
# a dozen phone emulators open: "There needs to be better hygiene." The Mac must stay healthy unattended.
#
# Modes:
#   pre    GitHub runner job-started hook: shut down stray sims/emulators, clean if disk is low, REFUSE the job
#          (exit 1) below the disk floor.
#   post   GitHub runner job-completed hook (runs even when a job is cancelled or times out): shut down every
#          sim/emulator, delete job-created sims (dl-*, e2e-*), clear runner temp.
#   sweep  launchd every 30 min (covers agents that boot sims outside Actions: Claude/Codex/Dot on the Mac):
#          when no Actions job is running, shut down sims/emulators up longer than SWEEP_MAX_AGE_MIN, delete
#          unavailable sims, clean if disk is low, prune duplicate runtimes once a day.
#   clean  developer-cache cleanup only (DerivedData, CoreSimulator/Xcode caches, runner temp, old diag logs,
#          unavailable sims, older duplicate runtimes).
# Never touches user files, the newest runtime per version, or the runner install. Processes are stopped by exact PID.
set -uo pipefail
MODE="${1:-sweep}"
MIN_FREE_GB="${MIN_FREE_GB:-25}"
SWEEP_MAX_AGE_MIN="${SWEEP_MAX_AGE_MIN:-90}"
RUNNER_ROOT="${RUNNER_ROOT:-$HOME/actions-runner-quickscore}"
STATE="${AOS_MAC_HYGIENE_HOME:-$HOME/aos-mac-hygiene}"
LOG="$STATE/guard.log"
mkdir -p "$STATE"
log() { echo "$(date '+%Y-%m-%dT%H:%M:%S%z') [$MODE] $*" | tee -a "$LOG"; }
free_gb() { df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2{print $4}'; }
etime_min() { ps -o etime= -p "$1" 2>/dev/null | awk '{n=split($1,a,"[-:]"); if(n==4)m=a[1]*1440+a[2]*60+a[3]; else if(n==3)m=a[1]*60+a[2]; else m=a[1]; print m+0}'; }
job_running() { pgrep -f "$RUNNER_ROOT/bin/Runner.Worker" >/dev/null 2>&1; }

shutdown_sims() {  # $1 = max age in minutes (0 = all)
  local max="${1:-0}" n=0
  if [ "$max" = 0 ]; then
    n=$(xcrun simctl list devices booted 2>/dev/null | grep -c "(Booted)")
    xcrun simctl shutdown all >/dev/null 2>&1 || true
  else
    # launchd_sim is the per-device simulator process; its age is the device's uptime.
    while read -r pid; do
      [ -z "$pid" ] && continue
      local age; age=$(etime_min "$pid")
      [ "${age:-0}" -lt "$max" ] && continue
      local udid; udid=$(ps -o command= -p "$pid" | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -1)
      [ -n "$udid" ] && xcrun simctl shutdown "$udid" >/dev/null 2>&1 && n=$((n+1))
    done < <(pgrep -x launchd_sim)
  fi
  # Android emulators (qemu) started by any agent: stop by exact PID.
  while read -r pid; do
    [ -z "$pid" ] && continue
    local age; age=$(etime_min "$pid")
    if [ "$max" = 0 ] || [ "${age:-0}" -ge "$max" ]; then kill "$pid" 2>/dev/null && n=$((n+1)); fi
  done < <(pgrep -f 'qemu-system-(aarch64|x86_64)' ; pgrep -x emulator)
  log "stopped $n simulator/emulator instance(s) (max_age_min=$max)"
}

delete_job_sims() {
  xcrun simctl list devices -j 2>/dev/null | /usr/bin/python3 -c '
import json,sys
d=json.load(sys.stdin)["devices"]
for rt,devs in d.items():
    for x in devs:
        if x["name"].startswith(("dl-","e2e-")) and x["state"]=="Shutdown": print(x["udid"])' |
  while read -r u; do xcrun simctl delete "$u" >/dev/null 2>&1 || true; done
}

dedupe_runtimes() {
  xcrun simctl runtime list -j 2>/dev/null | /usr/bin/python3 -c '
import json,sys
d=json.load(sys.stdin); rts=list(d.values()) if isinstance(d,dict) else d; g={}
for r in rts: g.setdefault((r.get("platformIdentifier"),r.get("version")),[]).append(r)
for rs in g.values():
    rs.sort(key=lambda r:(r.get("lastUsedAt") or "", r.get("build") or ""), reverse=True)
    for r in rs[1:]:
        if r.get("deletable",True) and r.get("state")!="Unusable-InUse": print(r["identifier"])' |
  while read -r rid; do [ -n "$rid" ] && { xcrun simctl runtime delete "$rid" >/dev/null 2>&1 && log "deleted duplicate runtime $rid" || log "could not delete runtime $rid"; }; done
}

clean() {
  local b; b=$(free_gb)
  xcrun simctl delete unavailable >/dev/null 2>&1 || true
  delete_job_sims
  dedupe_runtimes
  rm -rf "$HOME/Library/Developer/Xcode/DerivedData/"* "$HOME/Library/Developer/CoreSimulator/Caches/"* \
         "$HOME/Library/Caches/com.apple.dt.Xcode/"* "$HOME/.expo/cache" 2>/dev/null || true
  [ -d "$RUNNER_ROOT/_work/_temp" ] && find "$RUNNER_ROOT/_work/_temp" -mindepth 1 -maxdepth 1 -mmin +30 -exec rm -rf {} + 2>/dev/null
  [ -d "$RUNNER_ROOT/_diag" ] && find "$RUNNER_ROOT/_diag" -type f -mtime +7 -delete 2>/dev/null
  log "clean: free ${b} GB -> $(free_gb) GB"
}

floor_check() {
  local f; f=$(free_gb)
  if [ -n "$f" ] && [ "$f" -lt "$MIN_FREE_GB" ]; then
    log "ERROR free ${f} GB < floor ${MIN_FREE_GB} GB"
    echo "::error::Mac runner has ${f} GB free (< ${MIN_FREE_GB} GB floor). Refusing to start; developer caches were already cleared, so the rest is outside the safe-to-delete set."
    return 1
  fi
  return 0
}

case "$MODE" in
  pre)   shutdown_sims 0; f=$(free_gb); [ "${f:-0}" -lt "$MIN_FREE_GB" ] && clean; floor_check ;;
  post)  shutdown_sims 0; delete_job_sims
         [ -d "$RUNNER_ROOT/_work/_temp" ] && find "$RUNNER_ROOT/_work/_temp" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null
         log "post: free $(free_gb) GB"; exit 0 ;;
  sweep) if job_running; then log "Actions job running; sweep skipped"; exit 0; fi
         shutdown_sims "$SWEEP_MAX_AGE_MIN"; xcrun simctl delete unavailable >/dev/null 2>&1 || true
         stamp="$STATE/dedupe.stamp"
         if [ ! -f "$stamp" ] || [ -n "$(find "$stamp" -mmin +1440 2>/dev/null)" ]; then dedupe_runtimes; touch "$stamp"; fi
         f=$(free_gb); [ "${f:-0}" -lt "$MIN_FREE_GB" ] && clean
         # one-shot runner restart after hooks were (re)installed, only while idle
         if [ -f "$STATE/restart-runner.pending" ] && ! job_running; then
           (cd "$RUNNER_ROOT" && ./svc.sh stop >/dev/null 2>&1; ./svc.sh start >/dev/null 2>&1) && rm -f "$STATE/restart-runner.pending" && log "runner service restarted to load hooks"
         fi
         [ -f "$LOG" ] && tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
         exit 0 ;;
  clean) clean; floor_check ;;
  *) echo "usage: sim-guard.sh pre|post|sweep|clean"; exit 2 ;;
esac
