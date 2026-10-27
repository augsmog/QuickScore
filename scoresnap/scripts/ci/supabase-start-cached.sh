#!/usr/bin/env bash
set -euo pipefail

warn() { printf 'WARNING: supabase image cache: %s\n' "$*" >&2; }

load_images() {
  local dir=$1 archive output
  local -a archives
  shopt -s nullglob
  archives=("$dir"/images.tar*)
  if ((${#archives[@]} == 0)); then
    warn 'no archive found; continuing without cached images'
    return 0
  fi
  archive=${archives[0]}
  if ! output=$(case "$archive" in
    *.zst) zstd -dc "$archive" | docker load ;;
    *.gz) gzip -dc "$archive" | docker load ;;
    *) docker load --input "$archive" ;;
  esac); then
    warn 'archive could not be loaded; continuing without cached images'
    return 0
  fi
  local count=0 line
  while IFS= read -r line; do
    case "$line" in 'Loaded image:'*|'Loaded image ID:'*) count=$((count + 1)) ;; esac
  done <<< "$output"
  printf 'supabase image cache: loaded %s images\n' "$count"
}

start_stack() {
  local attempt delay status=1
  for attempt in 1 2 3 4 5; do
    printf 'supabase start: attempt %s/5\n' "$attempt"
    if supabase start "$@"; then
      return 0
    else
      status=$?
    fi
    if ((attempt < 5)); then
      supabase stop --no-backup || true
      delay=$((15 * (1 << (attempt - 1)) + RANDOM % 6))
      printf 'supabase start failed; retrying in %s seconds\n' "$delay"
      sleep "$delay"
    fi
  done
  return "$status"
}

save_images() {
  local dir=$1 listing image
  local -a images=()
  mkdir -p "$dir" || return 1
  listing=$(docker image ls --format '{{.Repository}}:{{.Tag}}') || return 1
  while IFS= read -r image; do
    case "$image" in
      ghcr.io/supabase/*|public.ecr.aws/supabase/*|supabase/*)
        [[ "$image" == *':<none>' ]] || images+=("$image") ;;
    esac
  done <<< "$listing"
  if ((${#images[@]} == 0)); then
    printf 'supabase image cache: no images to save\n'
    return 0
  fi
  printf '%s\n' "${images[@]}" > "$dir/images.txt" || return 1
  if command -v zstd >/dev/null 2>&1; then
    (set -o pipefail; docker save "${images[@]}" | zstd -T0 -o "$dir/images.tar.zst.tmp" -f) || return 1
    mv "$dir/images.tar.zst.tmp" "$dir/images.tar.zst" || return 1
  else
    (set -o pipefail; docker save "${images[@]}" | gzip > "$dir/images.tar.gz.tmp") || return 1
    mv "$dir/images.tar.gz.tmp" "$dir/images.tar.gz" || return 1
  fi
  printf 'supabase image cache: saved %s images\n' "${#images[@]}"
}

case "${1:-}" in
  load)
    [[ $# == 2 ]] || { echo 'Usage: supabase-start-cached.sh load <dir>' >&2; exit 2; }
    load_images "$2"
    ;;
  start) shift; start_stack "$@" ;;
  save)
    [[ $# == 2 ]] || { echo 'Usage: supabase-start-cached.sh save <dir>' >&2; exit 2; }
    if ! save_images "$2"; then
      warn 'could not save images; continuing without updating cache'
      rm -f "$2/images.tar.zst.tmp" "$2/images.tar.gz.tmp" "$2/images.tar.zst" "$2/images.tar.gz" "$2/images.txt" || true
    fi
    ;;
  *) echo 'Usage: supabase-start-cached.sh {load <dir>|start [args...]|save <dir>}' >&2; exit 2 ;;
esac
