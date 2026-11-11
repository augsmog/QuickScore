#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
export LOG_FILE="$temp_dir/log"
export INSTALL_DEPS_COUNT_FILE="$temp_dir/install-deps-count"
export PROBE_COUNT_FILE="$temp_dir/probe-count"
export EXPECTED_NPX_LOG="$LOG_FILE"
export EXPECTED_INSTALL_COUNT="$INSTALL_DEPS_COUNT_FILE"
export EXPECTED_PROBE_COUNT="$PROBE_COUNT_FILE"
export PATH="$temp_dir:$PATH"

cat > "$temp_dir/npx" <<'MOCK_NPX'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$EXPECTED_NPX_LOG"
if [[ "$*" == "playwright install chromium" ]]; then exit 0; fi
if [[ "$*" == "playwright install-deps chromium" ]]; then
  count=0; [[ -f "$EXPECTED_INSTALL_COUNT" ]] && count=$(cat "$EXPECTED_INSTALL_COUNT")
  count=$((count + 1)); echo "$count" > "$EXPECTED_INSTALL_COUNT"
  if [[ "${FORCE_DEPS_FAILURE:-0}" == 1 ]]; then exit 1; fi
  exit 0
fi
echo "Unexpected npx arguments: $*" >&2
exit 2
MOCK_NPX
cat > "$temp_dir/node" <<'MOCK_NODE'
#!/usr/bin/env bash
set -euo pipefail
count=0; [[ -f "$EXPECTED_PROBE_COUNT" ]] && count=$(cat "$EXPECTED_PROBE_COUNT")
count=$((count + 1)); echo "$count" > "$EXPECTED_PROBE_COUNT"
[[ "${FORCE_PROBE_FAILURE:-0}" != 1 ]]
[[ "$count" -ge 3 ]]
MOCK_NODE
cat > "$temp_dir/sleep" <<'MOCK_SLEEP'
#!/usr/bin/env bash
echo "sleep $*" >> "$EXPECTED_NPX_LOG"
MOCK_SLEEP
chmod +x "$temp_dir/npx" "$temp_dir/node" "$temp_dir/sleep"

bash "$repo_root/scripts/ci/install-playwright-chromium.sh"
grep -qx 'playwright install chromium' "$LOG_FILE"
grep -qx 'playwright install-deps chromium' "$LOG_FILE"
[[ "$(cat "$INSTALL_DEPS_COUNT_FILE")" == 2 ]]
[[ "$(cat "$PROBE_COUNT_FILE")" == 3 ]]
grep -q '^sleep 20$' "$LOG_FILE"

: > "$LOG_FILE"
rm -f "$INSTALL_DEPS_COUNT_FILE" "$PROBE_COUNT_FILE"
failure_output="$temp_dir/failure-output"
if FORCE_DEPS_FAILURE=1 FORCE_PROBE_FAILURE=1 bash "$repo_root/scripts/ci/install-playwright-chromium.sh" >"$failure_output" 2>&1; then
  echo "Expected persistent dependency failures to exit non-zero." >&2
  exit 1
fi
[[ "$(cat "$INSTALL_DEPS_COUNT_FILE")" == 4 ]]
grep -qx 'sleep 20' "$LOG_FILE"
grep -qx 'sleep 60' "$LOG_FILE"
grep -qx 'sleep 120' "$LOG_FILE"
grep -qx 'INFRA: chromium deps unavailable (apt)' "$failure_output"
echo "PASS: failed probe retries install-deps and passes on retry."
