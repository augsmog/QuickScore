#!/usr/bin/env bash
# Installs/refreshes the Mac keep-up + hygiene guard (AUG-1484). Idempotent; needs no password and no new secrets.
#  - sim-guard.sh as the GitHub runner job-started/job-completed hooks (every job; never refuses a job)
#  - launchd agents (user session):
#      com.augieos.mac-awake      /usr/bin/caffeinate -dimsu, KeepAlive (no idle/system/disk/display sleep)
#      com.augieos.mac-watchdog   every 2 min: runner service + remote-access app (KEEP_APPS) kept running, heartbeat
#      com.augieos.mac-sim-guard  every 30 min: stale sims/emulators stopped, proactive disk cleanup
#  - the runner's own launchd plist gets RunAtLoad + KeepAlive (restart on crash); runner restart only while idle
#  - pmset sleep 0 / autorestart 1 (power-failure restart) when passwordless sudo exists; otherwise recorded locally in
#    capabilities.json as an owner-only item (never prompts, never pages)
set -uo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${AOS_MAC_HYGIENE_HOME:-$HOME/aos-mac-hygiene}"
RUNNER_ROOT="${RUNNER_ROOT:-$HOME/actions-runner-quickscore}"
UIDN=$(id -u); LA="$HOME/Library/LaunchAgents"
PATHV=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin
mkdir -p "$HOME_DIR" "$LA"
install -m 0755 "$SRC/sim-guard.sh" "$HOME_DIR/sim-guard.sh"
install -m 0644 "$SRC/keep-runtimes.txt" "$HOME_DIR/keep-runtimes.txt"
printf '#!/bin/bash\n/bin/bash "%s/sim-guard.sh" pre || true\nexit 0\n' "$HOME_DIR" > "$HOME_DIR/hook-job-started.sh"
printf '#!/bin/bash\n/bin/bash "%s/sim-guard.sh" post || true\nexit 0\n' "$HOME_DIR" > "$HOME_DIR/hook-job-completed.sh"
chmod 0755 "$HOME_DIR"/hook-*.sh

restart=0
ENVF="$RUNNER_ROOT/.env"; touch "$ENVF"
for kv in "ACTIONS_RUNNER_HOOK_JOB_STARTED=$HOME_DIR/hook-job-started.sh" "ACTIONS_RUNNER_HOOK_JOB_COMPLETED=$HOME_DIR/hook-job-completed.sh"; do
  k="${kv%%=*}"
  if ! grep -qxF "$kv" "$ENVF"; then grep -v "^$k=" "$ENVF" > "$ENVF.tmp" || true; echo "$kv" >> "$ENVF.tmp"; mv "$ENVF.tmp" "$ENVF"; restart=1; fi
done

# Runner service plist: RunAtLoad + KeepAlive so launchd restarts it on crash and at login.
RPL="$(cat "$RUNNER_ROOT/.service" 2>/dev/null || true)"
if [ -n "$RPL" ] && [ -f "$RPL" ]; then
  for key in RunAtLoad KeepAlive; do
    cur=$(/usr/libexec/PlistBuddy -c "Print :$key" "$RPL" 2>/dev/null || echo missing)
    if [ "$cur" != true ]; then
      /usr/libexec/PlistBuddy -c "Delete :$key" "$RPL" >/dev/null 2>&1 || true
      /usr/libexec/PlistBuddy -c "Add :$key bool true" "$RPL" && restart=1
    fi
  done
fi
[ "$restart" = 1 ] && touch "$HOME_DIR/restart-runner.pending"

agent() {  # label, interval(0=KeepAlive), args...
  local label="$1" iv="$2"; shift 2
  local pl="$LA/$label.plist" args="" a
  for a in "$@"; do args="$args<string>$a</string>"; done
  local sched='<key>KeepAlive</key><true/>'
  [ "$iv" != 0 ] && sched="<key>StartInterval</key><integer>$iv</integer>"
  cat > "$pl.new" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>$args</array>
  $sched
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATHV</string></dict>
  <key>StandardOutPath</key><string>$HOME_DIR/$label.out.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/$label.err.log</string>
</dict></plist>
PLIST
  if ! cmp -s "$pl.new" "$pl" 2>/dev/null; then
    mv "$pl.new" "$pl"; launchctl bootout "gui/$UIDN/$label" 2>/dev/null || true; launchctl bootstrap "gui/$UIDN" "$pl"
  else rm -f "$pl.new"; launchctl print "gui/$UIDN/$label" >/dev/null 2>&1 || launchctl bootstrap "gui/$UIDN" "$pl"; fi
  launchctl enable "gui/$UIDN/$label" 2>/dev/null || true
}
agent com.augieos.mac-awake 0 /usr/bin/caffeinate -dimsu
agent com.augieos.mac-watchdog 120 /bin/bash "$HOME_DIR/sim-guard.sh" watchdog
agent com.augieos.mac-sim-guard 1800 /bin/bash "$HOME_DIR/sim-guard.sh" sweep

# Power settings: only if sudo works without a password (never prompts).
pm=skipped-no-passwordless-sudo
if sudo -n true 2>/dev/null; then
  sudo -n pmset -a sleep 0 disksleep 0 autorestart 1 womp 1 powernap 0 && pm=applied || pm=failed
fi
rm -f "$HOME_DIR/capabilities.json"; /bin/bash "$HOME_DIR/sim-guard.sh" watchdog >/dev/null 2>&1 || true
echo "$(date '+%FT%T%z') pmset=$pm" > "$HOME_DIR/pmset-result.txt"   # local only: job logs are public
echo "mac guard installed: runner_restart_pending=$([ -f "$HOME_DIR/restart-runner.pending" ] && echo yes || echo no)"
for l in com.augieos.mac-awake com.augieos.mac-watchdog com.augieos.mac-sim-guard; do
  echo "$l: $(launchctl print "gui/$UIDN/$l" 2>/dev/null | awk -F'= ' '/^\tstate =/{s=$2} /^\tpid =/{p=$2} END{print "state=" s " pid=" p}')"
done
exit 0
