#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
APP_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd -P)
OUT_DIR=dist-web-local

if (($#)) && [[ "$1" != EXPO_PUBLIC_* ]]; then
  OUT_DIR=$1
  shift
fi

while (($#)); do
  if [[ "$1" != EXPO_PUBLIC_[A-Za-z0-9_]*=* ]]; then
    echo "usage: $0 [out-dir] [EXPO_PUBLIC_NAME=value ...]" >&2
    exit 2
  fi
  export "$1"
  shift
done

if [[ ! -d "$APP_DIR/node_modules" || ! -f "$APP_DIR/node_modules/expo/bin/cli" ]]; then
  echo "local web export: installed Expo CLI missing under $APP_DIR/node_modules; link the lockfile-matched shared node_modules tree first" >&2
  exit 1
fi

# SnapScore's Metro config already supports this opt-in for the shared nightly
# dependency tree. Resolve the symlink so Metro watches and resolves one path.
export SNAPSCORE_NIGHTLY_NODE_MODULES
SNAPSCORE_NIGHTLY_NODE_MODULES=$(realpath -- "$APP_DIR/node_modules")
export CI=${CI:-1}
export EXPO_OFFLINE=${EXPO_OFFLINE:-1}
export EXPO_NO_TELEMETRY=${EXPO_NO_TELEMETRY:-1}

cd -- "$APP_DIR"
node node_modules/expo/bin/cli export --platform web --output-dir "$OUT_DIR" --clear
