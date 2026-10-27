#!/usr/bin/env bash
# Called only against the disposable CLI stack. No linked or live URL accepted.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
psql_local() { psql "$url" -X -v ON_ERROR_STOP=1 "$@"; }
extract() { psql_local -At -f "$here/catalog-query.sql" > /tmp/m2-catalog.json; }
python3 "$here/check-active-sql.py"
# Concurrency regression (verifier M2-1): a writer that commits while rollback waits must make rollback refuse.
psql_local -c "BEGIN; INSERT INTO auth.users(id) VALUES('20000000-0000-0000-0000-000000000009'); INSERT INTO public.contests(owner_id,course,invite_code,protocol) VALUES('20000000-0000-0000-0000-000000000009','{}','RACE01',1); SELECT pg_sleep(6); COMMIT;" > /tmp/m2-writer.log 2>&1 &
writer=$!
sleep 2
if psql_local -f "$here/../rollback/20261027120000_sync_foundation.down.sql" > /tmp/m2-race.log 2>&1; then
 echo 'ERROR: rollback ran despite a concurrent committed writer'; cat /tmp/m2-race.log; exit 1
fi
wait "$writer"; cat /tmp/m2-writer.log
grep -q 'M2_DOWN_UNSAFE' /tmp/m2-race.log || { cat /tmp/m2-race.log; exit 1; }
echo 'PASS: rollback waits for and refuses concurrent committed writer'
psql_local -c "DELETE FROM public.contests WHERE invite_code='RACE01'; DELETE FROM auth.users WHERE id='20000000-0000-0000-0000-000000000009'"
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
