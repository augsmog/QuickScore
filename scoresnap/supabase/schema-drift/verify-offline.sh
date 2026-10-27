#!/usr/bin/env bash
# PostgreSQL single-user mode: no daemon, sockets, network, Docker, or Supabase CLI.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
pgbin=${PGBIN:-/usr/lib/postgresql/17/bin}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
"$pgbin/initdb" -D "$work/db" -U postgres -A trust > "$work/init.log"
cat > "$work/apply.sql" <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE supabase_admin;
CREATE ROLE authenticator;
CREATE ROLE supabase_realtime_admin;
-- Hosted role attributes/memberships (captured live 2026-10-26 22:05 MST).
ALTER ROLE authenticator LOGIN NOINHERIT;
ALTER ROLE service_role BYPASSRLS;
GRANT anon, authenticated, service_role TO authenticator WITH INHERIT FALSE, SET TRUE;
GRANT anon, authenticated, service_role, authenticator TO postgres WITH ADMIN TRUE, INHERIT TRUE, SET TRUE;
CREATE ROLE supabase_storage_admin;
GRANT authenticator TO supabase_storage_admin WITH INHERIT FALSE, SET TRUE;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE PUBLICATION supabase_realtime;
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
-- Exercise the defaults already present on a managed local stack.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- Platform-provided supabase_admin defaults on hosted (mirror of platform-emulation.sql; the local CLI image lacks them).
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
SQL
cat "$here"/../migrations/202603*.sql "$here"/../migrations/20261022*.sql "$here"/../migrations/20261027000000_live_baseline.sql >> "$work/apply.sql"
python3 - "$here/expected-ledger.json" >> "$work/apply.sql" <<'PY'
import json,sys
for m in json.load(open(sys.argv[1]))+[{'version':'20261027000000','name':'live_baseline'}]:
    print("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('%s','%s');" % (m['version'],m['name']))
PY
"$pgbin/postgres" --single -D "$work/db" -c wal_level=logical -j postgres < "$work/apply.sql" > "$work/apply.log" 2>&1
if rg 'ERROR:|FATAL:' "$work/apply.log"; then cat "$work/apply.log"; exit 1; fi
"$pgbin/postgres" --single -D "$work/db" -j postgres < "$here/catalog-query.sql" > "$work/catalog.log" 2>&1
python3 - "$work/catalog.log" "$work/local.json" <<'PY'
import json,pathlib,sys
s=pathlib.Path(sys.argv[1]).read_text()
assert 'ERROR:' not in s and 'FATAL:' not in s,s
x,_=json.JSONDecoder().raw_decode(s.split('catalog = "',1)[1])
pathlib.Path(sys.argv[2]).write_text(json.dumps(x))
PY
if [[ -n "${CATALOG_OUTPUT:-}" ]]; then cp "$work/local.json" "$CATALOG_OUTPUT"; fi
# Offline ONLY: plain PG17 cannot install hosted platform extensions (supabase_vault, pg_graphql,
# pg_stat_statements). Emulate their exact live rows; the pinned Supabase stack in CI compares them for real.
python3 "$here/platform_ext.py" "$here/../schema-snapshot/live.json" "$work/local.json"
python3 "$here/drift.py" compare "$here/../schema-snapshot/live.json" "$work/local.json"
python3 "$here/drift.py" ledger "$work/local.json" --mode baseline
python3 "$here/selftest.py"
python3 "$here/sql-fixtures.py" --pgdata "$work/db"
echo 'PASS: PostgreSQL single-user apply + catalog parity + ledger + fixtures (no running server)'

python3 "$here/verify-foundation.py"
