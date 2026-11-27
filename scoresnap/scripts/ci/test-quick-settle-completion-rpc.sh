#!/usr/bin/env bash
# Disposable PostgreSQL only. Never point this at a live project: it creates and drops objects.
#
# Tests supabase/proposed/20261127031500_quick_settle_completion_rpc.sql (AUG-1585):
#   1. apply, then single-connection contract (ack shape, replay, misuse, grants);
#   2. TWO CONNECTIONS sending the identical request at the same time must both get the same
#      acknowledgment and leave exactly one operation row;
#   3. rollback restores the starting state, and the file applies again;
#   4. control: the earlier body (20261103170000_first_round_finished.sql) FAILS step 2 with a
#      unique-key error, which proves step 2 detects the defect it was written for.
#
# Usage: test-quick-settle-completion-rpc.sh <admin connection URL of an EMPTY disposable database>
# Works on a bare PostgreSQL (it stubs the auth schema and API roles) and on a local Supabase stack.
set -euo pipefail
URL="${1:?admin connection URL of a disposable database}"
HERE="$(cd "$(dirname "$0")" && pwd)"; SUPA="$HERE/../../supabase"
NEW="$SUPA/proposed/20261127031500_quick_settle_completion_rpc.sql"
NEW_DOWN="$SUPA/rollbacks/20261127031500_quick_settle_completion_rpc.sql"
OLD="$SUPA/proposed/20261103170000_first_round_finished.sql"
OLD_DOWN="$SUPA/rollbacks/20261103170000_first_round_finished.sql"
P=(psql "$URL" -X -q -v ON_ERROR_STOP=1 -At)
OWNER=00000000-0000-0000-0000-0000000000a1; OTHER=00000000-0000-0000-0000-0000000000a2; ANON=00000000-0000-0000-0000-0000000000a3
CONTEST=00000000-0000-0000-0000-0000000000c1; CONTEST2=00000000-0000-0000-0000-0000000000c2
say() { printf '%s\n' "$*"; }
fail() { say "FAIL: $*"; exit 1; }

# The guard against pointing this at something real: refuse a database that already has the tables
# this test creates and drops, or that has any contest rows.
[ "$("${P[@]}" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('first_round_finishes','quick_settle_completion_operations')")" = 0 ] || fail "target database already has the Quick Settle tables; this test only runs on a disposable database"
if [ "$("${P[@]}" -c "select to_regclass('public.contests') is not null")" = t ]; then
  [ "$("${P[@]}" -c "select count(*) from public.contests")" = 0 ] || fail "target database has contest rows; refusing to run"
fi

"${P[@]}" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, is_anonymous boolean, created_at timestamptz DEFAULT now());
DO $$ BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  END IF;
END $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
"${P[@]}" -c "INSERT INTO auth.users(id,is_anonymous) VALUES ('$OWNER',false),('$OTHER',false),('$ANON',true) ON CONFLICT DO NOTHING"

call() { # $1 caller sub, $2 operation, $3 owner arg, $4 contest  -> prints ack json or the SQLSTATE
  psql "$URL" -X -q -At -v VERBOSITY=sqlstate <<SQL 2>&1 | tail -1
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','$1',false);
\\o
SELECT public.record_quick_settle_completion('$2','$3','$4');
SQL
}
expect() { [ "$2" = "$3" ] && say "  ok: $1" || fail "$1: expected [$3], got [$2]"; }
ops() { "${P[@]}" -c "select count(*) from public.quick_settle_completion_operations where operation_id='$1'"; }

contract() {
  local OP1=00000000-0000-0000-0000-0000000000f1 OP2=00000000-0000-0000-0000-0000000000f2
  local ACK="{\"ownerId\": \"$OWNER\", \"operationId\": \"$OP1\"}"
  expect "first call acknowledges" "$(call $OWNER $OP1 $OWNER $CONTEST)" "$ACK"
  expect "replay returns the same acknowledgment" "$(call $OWNER $OP1 $OWNER $CONTEST)" "$ACK"
  expect "replay leaves one operation row" "$(ops $OP1)" 1
  expect "same operation ID for another contest is refused" "$(call $OWNER $OP1 $OWNER $CONTEST2 | grep -o '23505')" 23505
  expect "same operation ID from another owner is refused" "$(call $OTHER $OP1 $OTHER $CONTEST | grep -o '23505')" 23505
  expect "owner argument that is not the caller is refused" "$(call $OTHER $OP2 $OWNER $CONTEST | grep -o '42501')" 42501
  expect "anonymous account is refused" "$(call $ANON $OP2 $ANON $CONTEST | grep -o '42501')" 42501
  expect "no session is refused" "$(call '' $OP2 $OWNER $CONTEST | grep -o '42501')" 42501
  expect "refused calls wrote nothing" "$(ops $OP2)" 0
  expect "first finish recorded once, for the first contest" "$("${P[@]}" -c "select count(*)||':'||min(contest_id::text)||':'||min(source) from public.first_round_finishes where user_id='$OWNER'")" "1:$CONTEST:quick_settle"
  expect "anon role cannot execute" "$("${P[@]}" -c "select has_function_privilege('anon','public.record_quick_settle_completion(uuid,uuid,uuid)','execute')")" f
  expect "authenticated cannot read or write either table" "$("${P[@]}" -c "select bool_or(has_table_privilege('authenticated',t,p)) from unnest(array['public.first_round_finishes','public.quick_settle_completion_operations']) t, unnest(array['select','insert','update','delete']) p")" f
  expect "row security is on for both tables" "$("${P[@]}" -c "select bool_and(relrowsecurity) from pg_class where oid in ('public.first_round_finishes'::regclass,'public.quick_settle_completion_operations'::regclass)")" t
}

# Two connections, identical request. A holds its transaction open after calling; B calls while A
# is still open. Prints "A=<result> B=<result> rows=<n>".
race() {
  local OP=$1 OUT; OUT=$(mktemp -d)
  psql "$URL" -X -q -At -v VERBOSITY=sqlstate >"$OUT/a" 2>&1 <<SQL &
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','$OWNER',true);
\\o
SELECT public.record_quick_settle_completion('$OP','$OWNER','$CONTEST');
\\o /dev/null
SELECT pg_sleep(3);
COMMIT;
SQL
  local APID=$!
  sleep 1
  # B must really be overlapping A: A's transaction is open and has not committed.
  [ "$("${P[@]}" -c "select count(*) from pg_stat_activity where state like 'idle in transaction%' or (state='active' and query like '%pg_sleep%' and pid<>pg_backend_pid())")" -ge 1 ] || { say "race did not overlap"; return 2; }
  call $OWNER $OP $OWNER $CONTEST >"$OUT/b" 2>&1 || true
  wait $APID || true
  say "A=$(tail -1 "$OUT/a") B=$(tail -1 "$OUT/b") rows=$(ops $OP)"
  rm -rf "$OUT"
}

say "== 1. apply the corrected RPC-only migration"
"${P[@]}" -f "$NEW"
expect "no trigger was created on any table" "$("${P[@]}" -c "select count(*) from pg_trigger where not tgisinternal and tgname like 'first_round_finish%'")" 0
expect "no activation view was created" "$("${P[@]}" -c "select to_regclass('public.activation_daily') is null")" t
contract

say "== 2. two connections, identical request, corrected body"
RACE_OP=00000000-0000-0000-0000-0000000000e1
RESULT="$(race $RACE_OP)"; say "  $RESULT"
ACK="{\"ownerId\": \"$OWNER\", \"operationId\": \"$RACE_OP\"}"
expect "both connections get the same acknowledgment and one row exists" "$RESULT" "A=$ACK B=$ACK rows=1"

say "== 3. rollback, then apply again"
"${P[@]}" -f "$NEW_DOWN"
expect "rollback removed function and tables" "$("${P[@]}" -c "select (to_regprocedure('public.record_quick_settle_completion(uuid,uuid,uuid)') is null) and (to_regclass('public.first_round_finishes') is null) and (to_regclass('public.quick_settle_completion_operations') is null)")" t
"${P[@]}" -f "$NEW"; contract
"${P[@]}" -f "$NEW_DOWN"

say "== 4. control: the earlier body must FAIL the same two-connection test"
STUBBED=0
if [ "$("${P[@]}" -c "select to_regclass('public.contests') is null")" = t ]; then
  STUBBED=1
  "${P[@]}" -c "CREATE TABLE public.contests (id uuid PRIMARY KEY, owner_id uuid, status text, updated_at timestamptz); CREATE TABLE public.published_rounds (contest_id uuid, owner_id uuid, ended_at timestamptz);"
fi
"${P[@]}" -c "BEGIN" -f "$OLD" -c "COMMIT" >/dev/null
OLD_OP=00000000-0000-0000-0000-0000000000e2
RESULT="$(race $OLD_OP)"; say "  $RESULT"
case "$RESULT" in
  *"B="*23505*"rows=1") say "  ok: earlier body returns a unique-key error (23505) to the second identical request" ;;
  *) fail "control did not reproduce the defect; the two-connection test proves nothing: $RESULT" ;;
esac
"${P[@]}" -f "$OLD_DOWN"
[ "$STUBBED" = 1 ] && "${P[@]}" -c "DROP TABLE public.published_rounds; DROP TABLE public.contests;"
"${P[@]}" -c "DELETE FROM auth.users WHERE id IN ('$OWNER','$OTHER','$ANON')"
say "PASS: quick settle completion RPC"
