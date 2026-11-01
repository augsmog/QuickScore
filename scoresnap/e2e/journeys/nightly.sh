#!/usr/bin/env bash
set -euo pipefail
# Box-only. Network is limited to git clone/fetch; no installs, pushes, or schedules.
if [[ ${SNAPSCORE_NIGHTLY_INNER:-0} != 1 ]]; then
  mkdir -p /workspace/aos-state/test-program
  exec 200>/workspace/aos-state/test-program/nightly.lock
  flock -w 600 200
  export SNAPSCORE_NIGHTLY_INNER=1
  exec timeout --signal=TERM --kill-after=10s 20m bash "$0" "$@"
fi
HARNESS_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export HARNESS_SHA
HARNESS_SHA=$(git -C "$HARNESS_DIR" rev-parse HEAD)
RUN_ROOT=${RUN_ROOT:-/workspace/aos-state/test-program/runs}
REPO_DIR=${REPO_DIR:-/workspace/aos-state/test-program/repo}
NODE_MODULES_SRC=${NODE_MODULES_SRC:-/workspace/ss-rc-build-1030/scoresnap/node_modules}
export RUN_DATE RUN_DIR ATTEMPT_DIR STALE_WARNING
RUN_DATE=$(TZ=America/Los_Angeles date +%F)
RUN_DIR="$RUN_ROOT/$RUN_DATE"
mkdir -p "$RUN_DIR"
STALE_WARNING=$(node --input-type=module - "$RUN_ROOT" <<'JS'
import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2];
const times=fs.readdirSync(root).filter(n=>/^\d{4}-\d{2}-\d{2}$/.test(n)).map(n=>path.join(root,n,'summary.md')).filter(f=>fs.existsSync(f)).map(f=>fs.statSync(f).mtimeMs);
if(times.length&&Date.now()-Math.max(...times)>36*3600000)console.log('STALE: previous completed run is more than 36 hours old; inspect scheduler health.');
JS
)
ATTEMPT_DIR="$RUN_DIR/$(date -u +%H%M%S)-$$"
mkdir -p "$ATTEMPT_DIR/harness/e2e/journeys" "$ATTEMPT_DIR/harness/e2e/shared"
cp "$HARNESS_DIR/"*.mjs "$HARNESS_DIR/journeys.json" "$ATTEMPT_DIR/harness/e2e/journeys/"
cp "$HARNESS_DIR/../shared/paid-tier-fixture.mjs" "$ATTEMPT_DIR/harness/e2e/shared/"
ln -s "$NODE_MODULES_SRC" "$ATTEMPT_DIR/harness/node_modules"
SERVER_PID=''
finish() {
  local result=$?
  trap - EXIT
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  NIGHTLY_EXIT=$result node "$ATTEMPT_DIR/harness/e2e/journeys/summary.mjs"
  # Keep the last 14 dated directories, preserving every invocation within a day.
  node --input-type=module - "$RUN_ROOT" <<'JS'
import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2];const dirs=fs.readdirSync(root).filter(n=>/^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
for(const n of dirs.slice(14))fs.rmSync(path.join(root,n),{recursive:true});
JS
  if [[ -n "$STALE_WARNING" ]]; then result=1; fi
  echo "Nightly exit $result; summary: $RUN_DIR/summary.md"
  exit "$result"
}
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
if [[ ! -d "$REPO_DIR/.git" ]]; then
  git clone --no-checkout https://github.com/augsmog/QuickScore.git "$REPO_DIR" > "$ATTEMPT_DIR/git.log" 2>&1
else
  git -C "$REPO_DIR" fetch origin main > "$ATTEMPT_DIR/git.log" 2>&1
fi
git -C "$REPO_DIR" checkout --detach origin/main >> "$ATTEMPT_DIR/git.log" 2>&1
export GIT_SHA
GIT_SHA=$(git -C "$REPO_DIR" rev-parse HEAD)
echo "$GIT_SHA" > "$ATTEMPT_DIR/main-sha.txt"
cd "$REPO_DIR/scoresnap"
if [[ ! -e node_modules ]]; then ln -s "$NODE_MODULES_SRC" node_modules; fi
# Invoke installed CLI directly so an absent dependency can never cause a download.
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_OFFLINE_MODE=true EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=true \
  node node_modules/expo/bin/cli export --platform web --output-dir dist-web-journeys --clear > "$ATTEMPT_DIR/export.log" 2>&1
# Prefer 8193; a local bind chooses a free fallback if occupied.
PORT=$(node --input-type=module - "${PORT:-8193}" <<'JS'
import net from 'node:net';
const server=net.createServer();server.once('error',()=>server.listen(0,'127.0.0.1'));
server.listen(Number(process.argv[2]),'127.0.0.1',()=>{console.log(server.address().port);server.close();});
JS
)
WEB_ROOT=dist-web-journeys PORT="$PORT" node e2e/serve.mjs > "$ATTEMPT_DIR/server.log" 2>&1 &
SERVER_PID=$!
export BASE_URL="http://127.0.0.1:$PORT"
node --input-type=module <<'JS'
let ready=false;
for(let i=0;i<40;i++){try{const r=await fetch(process.env.BASE_URL);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
if(!ready)throw Error('nightly server did not become ready');
JS
# Run both checks even if the first fails. Logs retain the single attempt; no retry.
result=0
OUT_DIR="$ATTEMPT_DIR/journeys" node "$ATTEMPT_DIR/harness/e2e/journeys/runner.mjs" > "$ATTEMPT_DIR/runner.log" 2>&1 || result=1
OUT_DIR="$ATTEMPT_DIR/negative-proof" node "$ATTEMPT_DIR/harness/e2e/journeys/negative-proof.mjs" > "$ATTEMPT_DIR/negative-proof.log" 2>&1 || result=1
exit "$result"
