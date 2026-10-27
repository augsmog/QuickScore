#!/usr/bin/env bash
# Called only against the disposable CLI stack. No linked or live URL accepted.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
psql_local() { psql "$url" -X -v ON_ERROR_STOP=1 "$@"; }
extract() { psql_local -At -f "$here/catalog-query.sql" > /tmp/m2-catalog.json; }
python3 "$here/check-active-sql.py"
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
rg -q 'DEFAULT_TABLE_PRIVILEGE' /tmp/m2-default-red.log
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
