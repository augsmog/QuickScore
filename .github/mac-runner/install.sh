#!/usr/bin/env bash
# Installs/refreshes the Mac guard (AUG-1484): copies sim-guard.sh to ~/aos-mac-hygiene, wires it as the GitHub
# runner job-started/job-completed hooks (enforced on EVERY job on this runner, whatever the workflow), and loads a
# launchd agent that sweeps every 30 min for sims booted outside Actions. Idempotent. If the runner .env changed, a
# one-shot restart is left pending and done by the next idle sweep (never mid-job).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${AOS_MAC_HYGIENE_HOME:-$HOME/aos-mac-hygiene}"
RUNNER_ROOT="${RUNNER_ROOT:-$HOME/actions-runner-quickscore}"
LABEL=com.augieos.mac-sim-guard
mkdir -p "$HOME_DIR"
install -m 0755 "$SRC/sim-guard.sh" "$HOME_DIR/sim-guard.sh"
printf '#!/bin/bash\nexec /bin/bash "%s/sim-guard.sh" pre\n' "$HOME_DIR" > "$HOME_DIR/hook-job-started.sh"
printf '#!/bin/bash\n/bin/bash "%s/sim-guard.sh" post || true\nexit 0\n' "$HOME_DIR" > "$HOME_DIR/hook-job-completed.sh"
chmod 0755 "$HOME_DIR"/hook-*.sh
ENVF="$RUNNER_ROOT/.env"; touch "$ENVF"; changed=0
for kv in "ACTIONS_RUNNER_HOOK_JOB_STARTED=$HOME_DIR/hook-job-started.sh" "ACTIONS_RUNNER_HOOK_JOB_COMPLETED=$HOME_DIR/hook-job-completed.sh"; do
  k="${kv%%=*}"
  if ! grep -qxF "$kv" "$ENVF"; then
    grep -v "^$k=" "$ENVF" > "$ENVF.tmp" || true; echo "$kv" >> "$ENVF.tmp"; mv "$ENVF.tmp" "$ENVF"; changed=1
  fi
done
[ "$changed" = 1 ] && touch "$HOME_DIR/restart-runner.pending"
PL="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PL.new" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$HOME_DIR/sim-guard.sh</string><string>sweep</string></array>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string></dict>
  <key>StandardOutPath</key><string>$HOME_DIR/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/launchd.err.log</string>
</dict></plist>
PLIST
if ! cmp -s "$PL.new" "$PL" 2>/dev/null; then
  mv "$PL.new" "$PL"; launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PL"
else rm -f "$PL.new"; launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || launchctl bootstrap "gui/$(id -u)" "$PL"; fi
echo "mac-sim-guard installed: hooks_env_changed=$changed restart_pending=$([ -f "$HOME_DIR/restart-runner.pending" ] && echo yes || echo no)"
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state =|last exit" | head -2
