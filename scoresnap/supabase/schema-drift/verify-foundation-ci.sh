#!/usr/bin/env bash
# Called only against the disposable CLI stack. No linked or live URL accepted.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
psql_local() { psql "$url" -X -v ON_ERROR_STOP=1 "$@"; }
extract() { psql_local -At -f "$here/catalog-query.sql" > /tmp/m2-catalog.json; }
python3 "$here/check-active-sql.py"
python3 "$here/reference-guard.py"
# Reset starts with the full chain. Peel the unapplied purge, then rewritten 008, before the M2 gates.
psql_local -f "$here/../rollback/20261028223000_account_purge.down.sql"
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261028223000'"
psql_local -f "$here/../rollback/20261028162155_tournament_rounds_live.down.sql"
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261028162155'"
# Remove M2b before all M2 down/race gates.
psql_local -f "$here/../rollback/20261027130000_guest_write_guard.down.sql"
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261027130000'"
psql_local -At -f "$here/catalog-query.sql" > /tmp/m2-before-guard.json
# Require the specific guest-write failure, then verify every vulnerable case.
if psql_local -f "$here/../tests/guest-write-guard.sql" > /tmp/m2b-red.log 2>&1; then
 echo 'FAIL: M2-only guest guard unexpectedly green'; exit 1
fi
grep -q 'M2B_UNGUARDED: guest contest' /tmp/m2b-red.log
echo 'PASS: M2-only guest holes reproduced (expected red)'
# Red before green, exclusively on the disposable CLI stack.
red_log=$(mktemp)
trap 'rm -f "$red_log"' EXIT
if bash "$here/rollback-race-test.sh" "$url" "$here/fixtures/unsafe-rollback-no-lock.down.sql" > "$red_log" 2>&1; then
 echo 'FAIL: unsafe rollback unexpectedly passed the synchronized race'; exit 1
fi
cat "$red_log"
# Require the historical bug, rather than counting an infrastructure error as red.
grep -q 'PASS: observed rollback Lock wait' "$red_log"
grep -q 'FAIL: rollback succeeded after concurrent writer committed' "$red_log"
echo 'PASS: unsafe rollback rejected by synchronized race (expected red)'
# The old rollback can finish destructively after the writer commits. Restore a
# known unused baseline even if the red run instead interrupted it transactionally.
if [[ $(psql_local -Atqc "SELECT to_regclass('public.contest_memberships') IS NOT NULL") == t ]]; then
 psql_local -f "$here/../rollback/20261027120000_sync_foundation.down.sql"
fi
psql_local -f "$here/../migrations/20261027120000_sync_foundation.sql"
bash "$here/rollback-race-test.sh" "$url"
# Baseline prefix: undo M2 before running every M1 gate.
psql_local -f "$here/../rollback/20261027120000_sync_foundation.down.sql"
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261027120000'"
extract
python3 "$here/drift.py" compare "$here/../schema-snapshot/baseline.json" /tmp/m2-catalog.json
python3 "$here/drift.py" ledger /tmp/m2-catalog.json --mode baseline
if psql_local -f "$here/../tests/default-privileges.sql" > /tmp/m2-default-red.log 2>&1; then
 echo 'ERROR: baseline default privilege test unexpectedly green'; exit 1
fi
cat /tmp/m2-default-red.log
grep -q 'DEFAULT_TABLE_PRIVILEGE' /tmp/m2-default-red.log
python3 "$here/selftest.py"
python3 "$here/sql-fixtures.py" --url "$url" --admin-url postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres
# CLI reapplies the pending foundation, guest guard, rewritten 008, and the purge.
(cd "$here/../.." && supabase migration up --local)
# M2b catalog gates stay on the pre-008 schema. Peel the purge before M3.
psql_local -f "$here/../rollback/20261028223000_account_purge.down.sql"
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261028223000'"
psql_local -f "$here/../rollback/20261028162155_tournament_rounds_live.down.sql"
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261028162155'"
extract
python3 "$here/guest-guard-catalog.py" /tmp/m2-before-guard.json /tmp/m2-catalog.json
python3 "$here/drift.py" compare "$here/../schema-snapshot/expected-after.json" /tmp/m2-catalog.json
python3 "$here/drift.py" ledger /tmp/m2-catalog.json --mode local
psql_local -f "$here/../tests/default-privileges.sql"
psql_local -f "$here/../tests/foundation.sql"
psql_local -f "$here/../tests/legacy-compatibility.sql"

psql_local -f "$here/../tests/guest-write-guard.sql"

python3 "$here/guest-guard-mutations.py" --url "$url"
cp /tmp/m2-catalog.json /tmp/m2b-catalog.json
psql_local -f "$here/../migrations/20261028162155_tournament_rounds_live.sql"
psql_local -c "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261028162155','tournament_rounds_live') ON CONFLICT DO NOTHING"
extract
python3 "$here/drift.py" compare "$here/../schema-snapshot/expected-m3.json" /tmp/m2-catalog.json
psql_local -f "$here/../tests/m3-acl.sql"
python3 "$here/m3-mutations.py" --url "$url"
psql_local -f "$here/../migrations/20261028223000_account_purge.sql"
psql_local -c "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261028223000','account_purge') ON CONFLICT DO NOTHING"
psql_local -f "$here/../tests/purge-account.sql"
psql_local -f "$here/../rollback/20261028223000_account_purge.down.sql"
extract
python3 "$here/drift.py" compare "$here/../schema-snapshot/expected-m3.json" /tmp/m2-catalog.json
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261028223000'"
psql_local -f "$here/../rollback/20261028162155_tournament_rounds_live.down.sql"
extract
python3 "$here/drift.py" compare /tmp/m2b-catalog.json /tmp/m2-catalog.json
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261028162155'"
psql_local -f "$here/../migrations/20261028162155_tournament_rounds_live.sql"
psql_local -c "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20261028162155','tournament_rounds_live') ON CONFLICT DO NOTHING"
