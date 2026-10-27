#!/usr/bin/env bash
set -euo pipefail

warn() { printf 'WARNING: supabase image cache: %s\n' "$*" >&2; }

load_images() {
  local dir=$1 archive output
  archive=''
  local name
  for name in images.tar.zst images.tar.gz images.tar; do
    if [[ -f "$dir/$name" ]]; then
      archive="$dir/$name"
      break
    fi
  done
  if [[ -z "$archive" ]]; then
    warn 'no archive found; continuing without cached images'
    return 0
  fi
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

# The Docker CLI uses the registry credentials configured by docker/login-action.
pull_image() {
  local image=$1 attempt delay
  for attempt in 1 2 3 4; do
    if docker pull "$image"; then
      return 0
    fi
    if ((attempt < 4)); then
      delay=$((10 * (1 << (attempt - 1)) + RANDOM % 6))
      printf 'image pull failed; retrying %s in %s seconds\n' "$image" "$delay"
      sleep "$delay" || true
    fi
  done
  return 1
}

prepull_failed_images() {
  local log=$1 image mirror
  prepulled=0
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    if docker image inspect "$image" >/dev/null 2>&1; then
      continue
    fi
    if pull_image "$image"; then
      prepulled=$((prepulled + 1))
      continue
    fi
    if [[ "$image" == ghcr.io/supabase/* ]]; then
      for mirror in "public.ecr.aws/supabase/${image#ghcr.io/supabase/}" "docker.io/supabase/${image#ghcr.io/supabase/}"; do
        if pull_image "$mirror" && docker tag "$mirror" "$image"; then
          prepulled=$((prepulled + 1))
          break
        fi
      done
    fi
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      warn "could not pre-pull $image; continuing with start retries"
    fi
  done < <(sed -nE \
    -e 's/.*Retrying after [0-9]+s: ([^[:space:]]+).*/\1/p' \
    -e 's/.*failed to pull docker image from all registries: ([^[:space:]]+).*/\1/p' \
    "$log" | sed -E 's/[[:punct:]]+$//' | sort -u)
  return 0
}

start_stack() {
  local attempt delay status=1 log prepulled
  local -a pipeline_status
  log=$(mktemp)
  for attempt in 1 2 3 4 5; do
    printf 'supabase start: attempt %s/5\n' "$attempt"
    if supabase start "$@" 2>&1 | tee "$log"; then
      rm -f "$log"
      return 0
    else
      pipeline_status=("${PIPESTATUS[@]}")
      status=${pipeline_status[0]}
      # Preserve a logging failure too, if start itself succeeded.
      if ((status == 0)); then status=${pipeline_status[1]}; fi
    fi
    if ((attempt < 5)); then
      supabase stop --no-backup || true
      prepull_failed_images "$log"
      if ((prepulled > 0)); then
        printf 'supabase start failed; pre-pulled %s images; retrying immediately\n' "$prepulled"
      else
        delay=$((15 * (1 << (attempt - 1)) + RANDOM % 6))
        printf 'supabase start failed; retrying in %s seconds\n' "$delay"
        sleep "$delay"
      fi
    fi
  done
  rm -f "$log"
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
