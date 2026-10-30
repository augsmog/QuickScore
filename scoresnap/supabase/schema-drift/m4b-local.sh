#!/usr/bin/env bash
# Native PG17 with Auth/Realtime SQL stubs. Never accepts an external URL.
set -euo pipefail
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGDATABASE PGUSER PGPASSWORD
export PGCONNECT_TIMEOUT=3
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export PATH="${PGBIN:-/usr/lib/postgresql/17/bin}:$PATH"
work=$(mktemp -d /tmp/m4b-XXXX)
cleanup() { pg_ctl -D "$work/db" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
trap 'exit 130' INT TERM
initdb -D "$work/db" -U postgres -A trust > "$work/init.log"
port=$((20000 + RANDOM))
pg_ctl -D "$work/db" -l "$work/server.log" -o "-k $work -h 127.0.0.1 -p $port -c wal_level=logical" -w start >/dev/null
url="postgresql://postgres@127.0.0.1:$port/postgres"
q() { psql "$url" -X -v ON_ERROR_STOP=1 "$@"; }
q -f "$here/offline-bootstrap.sql" > "$work/apply.log" 2>&1
q <<'SQL' >> "$work/apply.log" 2>&1
ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb, ADD COLUMN created_at timestamptz, ADD COLUMN last_sign_in_at timestamptz;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT auth.jwt()->>'role' $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated;
-- SQL transaction/ACL emulation only: no socket delivery or JWT Auth service claim.
CREATE SCHEMA realtime;
CREATE TABLE realtime.messages(payload jsonb,event text,topic text,private boolean,extension text DEFAULT 'broadcast');
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT SELECT,INSERT ON realtime.messages TO authenticated;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('realtime.topic',true) $$;
CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.messages(payload,event,topic,private) VALUES($1,$2,$3,$4) $$;
GRANT EXECUTE ON FUNCTION realtime.topic() TO authenticated;
SQL
for migration in "$here"/../migrations/*.sql; do
 if [[ $migration == *20261029180000* ]]; then q -At -f "$here/catalog-query.sql" > "$work/m3.json"; q -f "$here/../tests/m4b-upgrade.sql" >> "$work/apply.log" 2>&1; fi
 name=$(basename "$migration" .sql)
 version=${name%%_*}
 label=${name#*_}
 q -c "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('$version','$label')" >> "$work/apply.log" 2>&1
 q -f "$migration" >> "$work/apply.log" 2>&1 || { cat "$work/apply.log"; exit 1; }
done
q -f "$here/../tests/m4b-upgrade-replay.sql" >> "$work/apply.log" 2>&1 || { cat "$work/apply.log"; exit 1; }
echo 'PASS: seeded M3 accepted receipt replays after M4b with exactly one event'
echo 'PASS: full baseline/foundation/M2b/M3/sync_api chain'
q -At -f "$here/catalog-query.sql" > "$work/m4b.json"
python3 "$here/drift.py" ledger "$work/m4b.json" --mode pending
python3 "$here/m4b-verify.py" catalog "$work/m4b.json" "${1:-compare}"
for suite in guest-write-guard legacy-compatibility m3-acl m4b-api m5-security; do
 q -v m4b_native=true -f "$here/../tests/$suite.sql" > "$work/$suite.log" 2>&1 || { cat "$work/$suite.log"; exit 1; }
 echo "PASS: $suite on full M4b chain"
done
python3 "$here/guest-guard-mutations.py" --url "$url" > "$work/mutations.log" 2>&1 || { cat "$work/mutations.log"; exit 1; }
tail -1 "$work/mutations.log"
python3 "$here/m4b-verify.py" races "$url"
q -f "$here/../rollback/20261029180000_sync_api.down.sql" > "$work/down.log" 2>&1 || { cat "$work/down.log"; exit 1; }
q -At -f "$here/catalog-query.sql" > "$work/down.json"
python3 "$here/drift.py" compare "$work/m3.json" "$work/down.json"
echo 'PASS: M4b down restores exact M3 catalog'
for down in 20261028162155_tournament_rounds_live 20261027130000_guest_write_guard 20261027120000_sync_foundation; do
 q -f "$here/../rollback/$down.down.sql" >> "$work/down.log" 2>&1 || { cat "$work/down.log"; exit 1; }
done
echo 'PASS: paired full down chain to baseline'
