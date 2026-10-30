#!/usr/bin/env bash
# Disposable native PG17 + real PostgREST. SQL Auth/Realtime stubs are explicit.
set -euo pipefail
: "${XDEVICE_BACKEND:?point to existing M4b scoresnap directory}"
: "${POSTGREST_BIN:?point to PostgREST 12.2.12 binary}"
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGDATABASE PGUSER PGPASSWORD
export PATH="/usr/lib/postgresql/17/bin:$PATH"
work=$(mktemp -d /tmp/snapscore-r2-stack-XXXX)
cleanup() { if [[ -n ${rest_pid:-} ]]; then kill "$rest_pid" 2>/dev/null || true; wait "$rest_pid" 2>/dev/null || true; fi; pg_ctl -D "$work/db" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
trap 'exit 130' INT TERM
initdb -D "$work/db" -U postgres -A trust > "$work/init.log"
port=$((20000 + RANDOM))
rest_port=$((20000 + RANDOM))
pg_ctl -D "$work/db" -l "$work/server.log" -o "-k $work -h 127.0.0.1 -p $port -c wal_level=logical" -w start >/dev/null
export XDEVICE_DB="postgresql://postgres@127.0.0.1:$port/postgres"
q() { psql "$XDEVICE_DB" -X -v ON_ERROR_STOP=1 "$@"; }
q -f "$XDEVICE_BACKEND/supabase/schema-drift/offline-bootstrap.sql" > "$work/apply.log" 2>&1
q <<'SQL' >> "$work/apply.log" 2>&1
ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb, ADD COLUMN created_at timestamptz, ADD COLUMN last_sign_in_at timestamptz;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT auth.jwt()->>'role' $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated;
CREATE SCHEMA realtime;
CREATE TABLE realtime.messages(payload jsonb,event text,topic text,private boolean,extension text DEFAULT 'broadcast');
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT SELECT,INSERT ON realtime.messages TO authenticated;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('realtime.topic',true) $$;
CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.messages(payload,event,topic,private) VALUES($1,$2,$3,$4) $$;
GRANT EXECUTE ON FUNCTION realtime.topic() TO authenticated;
SQL
for migration in "$XDEVICE_BACKEND"/supabase/migrations/*.sql; do
 q -f "$migration" >> "$work/apply.log" 2>&1 || { cat "$work/apply.log"; exit 1; }
done
export XDEVICE_NATIVE=1 XDEVICE_API="http://127.0.0.1:$rest_port"
XDEVICE_JWT=$(openssl rand -hex 32); export XDEVICE_JWT
PGRST_DB_URI="postgresql://authenticator@127.0.0.1:$port/postgres" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$XDEVICE_JWT" PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT="$rest_port" "$POSTGREST_BIN" > "$work/rest.log" 2>&1 &
rest_pid=$!
for _ in $(seq 1 50); do if curl -fsS "$XDEVICE_API/" >/dev/null 2>&1; then break; fi; sleep 0.2; done
node --import tsx e2e/xdevice/four-identities.mts
