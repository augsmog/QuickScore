#!/usr/bin/env bash
# Called only against the disposable CLI stack. No linked or live URL accepted.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
psql_local() { psql "$url" -X -v ON_ERROR_STOP=1 "$@"; }
extract() { psql_local -At -f "$here/catalog-query.sql" > /tmp/m2-catalog.json; }
python3 "$here/check-active-sql.py"
# Reset starts with the full chain. Remove M2b before all M2 down/race gates.
psql_local -f "$here/../rollback/20261027130000_guest_write_guard.down.sql"
psql_local -c "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261027130000'"
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
python3 "$here/drift.py" compare "$here/../schema-snapshot/live.json" /tmp/m2-catalog.json
python3 "$here/drift.py" ledger /tmp/m2-catalog.json --mode baseline
if psql_local -f "$here/../tests/default-privileges.sql" > /tmp/m2-default-red.log 2>&1; then
 echo 'ERROR: baseline default privilege test unexpectedly green'; exit 1
fi
cat /tmp/m2-default-red.log
grep -q 'DEFAULT_TABLE_PRIVILEGE' /tmp/m2-default-red.log
python3 "$here/selftest.py"
python3 "$here/sql-fixtures.py" --url "$url" --admin-url postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres
# CLI reapplies the pending foundation and restores its ledger entry.
(cd "$here/../.." && supabase migration up --local)
extract
python3 "$here/drift.py" compare "$here/../schema-snapshot/expected-after.json" /tmp/m2-catalog.json
python3 "$here/drift.py" ledger /tmp/m2-catalog.json --mode local
psql_local -f "$here/../tests/default-privileges.sql"
psql_local -f "$here/../tests/foundation.sql"
psql_local -f "$here/../tests/legacy-compatibility.sql"

psql_local -f "$here/../tests/guest-write-guard.sql"

python3 "$here/guest-guard-mutations.py" --url "$url"
