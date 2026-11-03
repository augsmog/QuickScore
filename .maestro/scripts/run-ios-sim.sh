#!/usr/bin/env bash
# Product-agnostic Maestro runner for an iOS simulator .app built by EAS (aos-e2e/v1).
# Usage: run-ios-sim.sh --app-url URL --build <build-key> [--flows all|id,id] [--build-id ID] [--out DIR] [--config PATH]
# Writes DIR/manifest.json and DIR/flows/<flow-id>/{*.png,maestro.log,junit.xml,hierarchy.json}.
# Needs: macOS with Xcode simulators, python3, maestro on PATH. Uses no credentials.
set -euo pipefail

CONFIG=".maestro/e2e.config.json"; FLOWS="all"; BUILD_ID=""; OUT="e2e-out"; APP_URL=""; BUILD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2;;
    --app-url) APP_URL="$2"; shift 2;;
    --build) BUILD="$2"; shift 2;;
    --flows) FLOWS="$2"; shift 2;;
    --build-id) BUILD_ID="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    *) echo "unknown arg $1" >&2; exit 2;;
  esac
done
[ -n "$APP_URL" ] && [ -n "$BUILD" ] || { echo "--app-url and --build are required" >&2; exit 2; }
ROOT="$(pwd)"; CONFIG="$ROOT/$CONFIG"; mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
cfg() { python3 -c "import json,sys;c=json.load(open('$CONFIG'));print(eval(sys.argv[1]))" "$1"; }
APP_ID="$(cfg "c['appId']")"; PRODUCT="$(cfg "c['product']")"
DEVICE_TYPE="$(cfg "c['device']['type']")"

# 1. Fetch the build and prove its architecture.
WORK="$(mktemp -d)"; curl -fsSL -o "$WORK/app.tar.gz" "$APP_URL"
SHA="$(shasum -a 256 "$WORK/app.tar.gz" | awk '{print $1}')"
mkdir -p "$WORK/x"; tar -xzf "$WORK/app.tar.gz" -C "$WORK/x"
APP="$(find "$WORK/x" -maxdepth 3 -name '*.app' -type d | head -1)"
[ -n "$APP" ] || { echo "no .app in artifact" >&2; exit 1; }
EXE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Info.plist")"
ARCHS="$(lipo -archs "$APP/$EXE")"; FILE_OUT="$(file -b "$APP/$EXE")"
echo "binary $EXE archs: $ARCHS"
case " $ARCHS " in *" arm64 "*) ;; *) echo "build has no arm64 slice ($ARCHS)" >&2; exit 1;; esac

# 2. Fresh simulator on the newest installed iOS runtime.
RUNTIME="$(xcrun simctl list runtimes -j | python3 -c "import json,sys;r=[x for x in json.load(sys.stdin)['runtimes'] if x['platform']=='iOS' and x['isAvailable']];r.sort(key=lambda x:[int(p) for p in x['version'].split('.')]);print(r[-1]['identifier'])")"
UDID="$(xcrun simctl create "e2e-$PRODUCT" "$DEVICE_TYPE" "$RUNTIME")"
xcrun simctl boot "$UDID"; xcrun simctl bootstatus "$UDID" -b >/dev/null
OS_VERSION="$(xcrun simctl list devices -j | python3 -c "import json,sys;d=json.load(sys.stdin)['devices'];print([k for k,v in d.items() for x in v if x['udid']=='$UDID'][0].split('.')[-1])")"
MAESTRO_VERSION="$(maestro --version 2>/dev/null | tail -1 || true)"

# 3. Each flow gets a clean install (+ optional fixture) so flows never depend on each other.
python3 - "$CONFIG" "$BUILD" "$FLOWS" > "$WORK/flows.tsv" <<'PY'
import json,sys
c=json.load(open(sys.argv[1])); want=sys.argv[3]
ids=None if want=="all" else set(x.strip() for x in want.split(",") if x.strip())
for f in c["flows"]:
    if f["build"]!=sys.argv[2] or (ids is not None and f["id"] not in ids): continue
    fx=c["fixtures"][f["fixture"]]["file"] if f.get("fixture") else "-"
    print("\t".join([f["id"],f["file"],fx,"1" if f.get("captureHierarchy") else "0"]))
PY
[ -s "$WORK/flows.tsv" ] || { echo "no flows match build=$BUILD flows=$FLOWS" >&2; exit 2; }

seed_asyncstorage() { # $1 fixture json (key -> string value), written as RN AsyncStorage's iOS manifest
  local data; data="$(xcrun simctl get_app_container "$UDID" "$APP_ID" data)"
  local dir="$data/Library/Application Support/$APP_ID/RCTAsyncLocalStorage_V1"
  mkdir -p "$dir"; python3 -c "import json,sys;json.dump(json.load(open(sys.argv[1])),open(sys.argv[2],'w'))" "$ROOT/$1" "$dir/manifest.json"
}

: > "$WORK/results.tsv"; FAILED=0
while IFS=$'\t' read -r ID FLOW FIXTURE HIER; do
  D="$OUT/flows/$ID"; mkdir -p "$D"
  xcrun simctl terminate "$UDID" "$APP_ID" 2>/dev/null || true
  xcrun simctl uninstall "$UDID" "$APP_ID" 2>/dev/null || true
  xcrun simctl install "$UDID" "$APP"
  [ "$FIXTURE" = "-" ] || seed_asyncstorage "$FIXTURE"
  START=$(date +%s); set +e
  (cd "$D" && maestro --device "$UDID" test --format junit --output "$D/junit.xml" \
      --test-output-dir "$D" --debug-output "$D/debug" "$ROOT/$FLOW") > "$D/maestro.log" 2>&1
  RC=$?; set -e
  [ "$HIER" = "1" ] && maestro --device "$UDID" hierarchy > "$D/hierarchy.json" 2>/dev/null || true
  [ $RC -eq 0 ] || { FAILED=1; maestro --device "$UDID" hierarchy > "$D/hierarchy-at-failure.json" 2>/dev/null || true; }
  # Maestro writes takeScreenshot files under its timestamped run dir; lift them to the flow dir for the manifest.
  find "$D" -mindepth 2 -path '*/takeScreenshot/*.png' -exec cp -n {} "$D/" \; 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\n' "$ID" "$FLOW" "$RC" "$(( $(date +%s) - START ))" >> "$WORK/results.tsv"
  echo "flow $ID rc=$RC"
done < "$WORK/flows.tsv"

# 4. Manifest a verifier can read without the runner.
python3 - "$OUT" "$WORK/results.tsv" "$CONFIG" <<PY
import json,os,sys,glob
out,res,cfgp=sys.argv[1:4]; c=json.load(open(cfgp)); byid={f["id"]:f for f in c["flows"]}
flows=[]
for line in open(res):
    i,f,rc,secs=line.rstrip("\n").split("\t"); d=os.path.join(out,"flows",i)
    flows.append({"id":i,"file":f,"tickets":byid[i]["tickets"],"status":"passed" if rc=="0" else "failed","exitCode":int(rc),"seconds":int(secs),
      "fixture":byid[i].get("fixture"),"partial":byid[i].get("partial"),"liveWrite":byid[i].get("liveWrite"),
      "screenshots":sorted(os.path.basename(p) for p in glob.glob(os.path.join(d,"*.png"))),
      "hierarchy":os.path.exists(os.path.join(d,"hierarchy.json"))})
json.dump({"schema":"aos-e2e/v1","product":c["product"],"repo":c["repo"],"appId":c["appId"],
  "gitSha":os.environ.get("GITHUB_SHA",""),"ghRunId":os.environ.get("GITHUB_RUN_ID",""),
  "build":{"key":"$BUILD","easProfile":c["builds"]["$BUILD"]["easProfile"],"easBuildId":"$BUILD_ID","url":"$APP_URL","sha256":"$SHA",
           "executable":"$EXE","lipoArchs":"$ARCHS","file":"""$FILE_OUT"""},
  "device":{"type":"$DEVICE_TYPE","runtime":"$RUNTIME","iosVersion":"$OS_VERSION","udid":"$UDID"},
  "maestroVersion":"""$MAESTRO_VERSION""","flows":flows},open(os.path.join(out,"manifest.json"),"w"),indent=2)
PY
xcrun simctl shutdown "$UDID" || true; xcrun simctl delete "$UDID" || true
exit $FAILED
