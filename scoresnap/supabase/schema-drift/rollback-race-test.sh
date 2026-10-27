#!/usr/bin/env bash
# Disposable databases only. Never print the supplied connection URL.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
url=${1:?usage: rollback-race-test.sh db-url [rollback-file]}
rollback=${2:-$here/../rollback/20261027120000_sync_foundation.down.sql}
# Strict URI authority; reject query/keyword overrides (host, service, etc.).
if [[ ! "$url" =~ ^postgres(ql)?://([^/@?]+@)?(127\.0\.0\.1|localhost)(:[0-9]+)?/[^?[:space:]]+$ ]]; then
 echo 'FAIL: only explicit localhost/127.0.0.1 database URLs without query options are allowed'; exit 1
fi
unset PGHOSTADDR PGSERVICE PGSERVICEFILE
export PGCONNECT_TIMEOUT=3
work=$(mktemp -d)
writer='' runner='' wpid='' rpid='' uid=''
q() { PGOPTIONS='-c statement_timeout=3000' psql "$url" -w -X -Atq -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
 trap - EXIT
 # Recover PIDs even if startup failed before the readiness marker was read.
 if [[ -n "$writer" && -z "$wpid" ]]; then
  wpid=$(q -c "SELECT pid FROM pg_stat_activity WHERE application_name='m2_race_writer' AND datname=current_database()" 2>/dev/null) || true
 fi
 if [[ -n "$runner" && -z "$rpid" ]]; then
  rpid=$(q -c "SELECT pid FROM pg_stat_activity WHERE application_name='m2_race_rollback' AND datname=current_database()" 2>/dev/null) || true
 fi
 # Terminate server sessions as well as clients; disconnect rolls back open transactions.
 for pid in "$rpid" "$wpid"; do
  [[ "$pid" =~ ^[0-9]+$ ]] && q -c "SELECT pg_terminate_backend($pid)" >/dev/null 2>&1 || true
 done
 for pid in "$runner" "$writer"; do
  [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
 done
 [[ -n "$runner" ]] && wait "$runner" 2>/dev/null || true
 [[ -n "$writer" ]] && wait "$writer" 2>/dev/null || true
 if [[ -n "$uid" ]]; then
  q -c "DELETE FROM public.contests WHERE owner_id='$uid'; DELETE FROM auth.users WHERE id='$uid'" >/dev/null 2>&1 || true
 fi
 rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
fail() { echo "FAIL: $*"; exit 1; }
[[ $(q -c "SELECT count(*) FROM pg_stat_activity WHERE application_name IN ('m2_race_writer','m2_race_rollback') AND datname=current_database()") == 0 ]] || fail 'race sessions already present; use an isolated database'
uid=$(q -c 'SELECT gen_random_uuid()')
code=$(q -c "SELECT 'R' || substr(replace('$uid','-',''),1,20)")
mkfifo "$work/input"
# Open both ends to keep the writer waiting for our explicit COMMIT.
exec 3<> "$work/input"
PGAPPNAME=m2_race_writer psql "$url" -w -X -Atq -v ON_ERROR_STOP=1 < "$work/input" > "$work/writer.log" 2>&1 &
writer=$!
printf '%s\n' "BEGIN; SET application_name='m2_race_writer';" \
 "SELECT pg_backend_pid();" \
 "INSERT INTO auth.users(id) VALUES('$uid');" \
 "INSERT INTO public.contests(owner_id,course,invite_code,protocol) VALUES('$uid','{}','$code',1);" \
 "SELECT 'WRITER_READY';" >&3
deadline=$((SECONDS+30))
until grep -q '^WRITER_READY$' "$work/writer.log"; do
 kill -0 "$writer" 2>/dev/null || fail 'writer exited before ready'
 (( SECONDS < deadline )) || fail 'writer readiness deadline exceeded'
 sleep 0.1
done
read -r wpid < "$work/writer.log"
[[ "$wpid" =~ ^[0-9]+$ ]] || fail 'missing writer backend pid'
# -1 also makes the historical nontransactional fixture recoverable on interruption.
PGAPPNAME=m2_race_rollback PGOPTIONS='-c statement_timeout=35000' \
 psql "$url" -w -X -1 -v ON_ERROR_STOP=1 -f "$rollback" > "$work/rollback.log" 2>&1 &
runner=$!
deadline=$((SECONDS+30))
while :; do
 kill -0 "$runner" 2>/dev/null || fail 'rollback finished before waiting on writer'
 rpid=$(q -c "SELECT pid FROM pg_stat_activity WHERE application_name='m2_race_rollback' AND datname=current_database() AND pid<>pg_backend_pid()")
 [[ -z "$rpid" || "$rpid" =~ ^[0-9]+$ ]] || fail 'multiple rollback sessions; use an isolated database'
 if [[ -n "$rpid" ]] && [[ $(q -c "SELECT wait_event_type='Lock' AND $wpid=ANY(pg_blocking_pids(pid)) FROM pg_stat_activity WHERE pid=$rpid") == t ]]; then
  echo 'PASS: observed rollback Lock wait blocked by the open writer transaction'
  break
 fi
 (( SECONDS < deadline )) || fail 'rollback did not wait on writer (deadline exceeded)'
 sleep 0.1
done
printf 'COMMIT;\n\\q\n' >&3
exec 3>&-
deadline=$((SECONDS+30))
while kill -0 "$runner" 2>/dev/null; do
 (( SECONDS < deadline )) || fail 'rollback exit deadline exceeded'
 sleep 0.1
done
rc=0
wait "$runner" || rc=$?
[[ "$rc" != 0 ]] || fail 'rollback succeeded after concurrent writer committed'
grep -q M2_DOWN_UNSAFE "$work/rollback.log" || fail 'rollback did not refuse with M2_DOWN_UNSAFE'
[[ $(q -c "SELECT to_regclass('public.contest_memberships') IS NOT NULL") == t ]] || fail 'M2 objects were lost'
[[ $(q -c "SELECT count(*) FROM public.contests WHERE owner_id='$uid' AND invite_code='$code' AND protocol=1") == 1 ]] || fail 'writer data was lost'
q -c "DELETE FROM public.contests WHERE owner_id='$uid'; DELETE FROM auth.users WHERE id='$uid'" >/dev/null
uid=''
echo 'PASS: rollback refused with M2_DOWN_UNSAFE; M2 objects and committed writer data preserved; test rows cleaned'
