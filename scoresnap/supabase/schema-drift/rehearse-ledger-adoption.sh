#!/usr/bin/env bash
# Destructive only to the hard-coded disposable local rehearsal database.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$here/../.."
admin='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
url='postgresql://postgres:postgres@127.0.0.1:54322/live_rehearsal'
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# Same cluster roles; isolated public-schema simulation, not a second Auth service.
# Avoid TEMPLATE postgres: the running stack has active connections to postgres.
psql "$admin" -X -v ON_ERROR_STOP=1 -c 'CREATE DATABASE live_rehearsal TEMPLATE template0'
psql "$url" -X -v ON_ERROR_STOP=1 <<'SQL'
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
SQL
# Default ACLs are per-database: emulate hosted platform-provided supabase_admin defaults here too.
# Hosted platform extensions the main local DB already has (vault, pg_stat_statements); pg_graphql is in platform-emulation.sql.
psql 'postgresql://supabase_admin:postgres@127.0.0.1:54322/live_rehearsal' -X -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS supabase_vault' -c 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA extensions'
psql 'postgresql://supabase_admin:postgres@127.0.0.1:54322/live_rehearsal' -X -v ON_ERROR_STOP=1 -f "$here/platform-emulation.sql"
psql "$url" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261027000000_live_baseline.sql
python3 - "$here/expected-ledger.json" > "$work/ledger.sql" <<'PY'
import json,sys
for m in [m for m in json.load(open(sys.argv[1])) if m['version'] < '20261027000000']:
    print("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('%s','%s');" % (m['version'],m['name']))
PY
psql "$url" -X -v ON_ERROR_STOP=1 -f "$work/ledger.sql"
psql "$url" -X -At -v ON_ERROR_STOP=1 -f "$here/catalog-query.sql" > "$work/before.json"
python3 "$here/drift.py" compare "$here/../schema-snapshot/baseline.json" "$work/before.json"
python3 "$here/drift.py" ledger "$work/before.json" --mode pre-adoption
supabase migration list --db-url "$url"
supabase db push --dry-run --db-url "$url" 2>&1 | tee "$work/before.log"
# Assert the pending migration list exactly, rather than merely grep for a name.
python3 "$here/rehearsal-pending.py" "$work/before.log" before
supabase migration repair 20261027000000 --status applied --db-url "$url"
supabase migration list --db-url "$url"
supabase db push --dry-run --db-url "$url" 2>&1 | tee "$work/after.log"
python3 "$here/rehearsal-pending.py" "$work/after.log" after
psql "$url" -X -At -v ON_ERROR_STOP=1 -f "$here/catalog-query.sql" > "$work/after.json"
python3 "$here/drift.py" compare "$here/../schema-snapshot/baseline.json" "$work/after.json"
python3 "$here/drift.py" ledger "$work/after.json" --mode baseline
psql "$admin" -X -v ON_ERROR_STOP=1 -c 'DROP DATABASE live_rehearsal WITH (FORCE)'
