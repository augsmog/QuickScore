#!/usr/bin/env bash
# Throwaway PG17 only. No Supabase CLI, linked configuration, or external URL.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
pgbin=${PGBIN:-/usr/lib/postgresql/17/bin}
export PATH="$pgbin:$PATH"
work=$(mktemp -d)
cleanup() {
 "$pgbin/pg_ctl" -D "$work/db" -m immediate -w stop >/dev/null 2>&1 || true
 rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
"$pgbin/initdb" -D "$work/db" -U postgres -A trust > "$work/init.log"
port=$((20000 + RANDOM))
if ! "$pgbin/pg_ctl" -D "$work/db" -l "$work/server.log" -o "-k $work -h 127.0.0.1 -p $port -c wal_level=logical" -w start; then
 echo 'FAIL: throwaway PG17 could not start (socket creation may be denied by sandbox)'
 cat "$work/server.log"; exit 1
fi
url="postgresql://postgres@127.0.0.1:$port/postgres"
q() { psql "$url" -X -v ON_ERROR_STOP=1 "$@"; }
q -f "$here/offline-bootstrap.sql" > "$work/apply.log" 2>&1 || { cat "$work/apply.log"; exit 1; }
# Hosted auth stub: claims drive real role/RLS probes.
q <<'SQL' >> "$work/apply.log" 2>&1
ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb, ADD COLUMN created_at timestamptz, ADD COLUMN last_sign_in_at timestamptz;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT auth.jwt()->>'role' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;
SQL
for migration in "$here"/../migrations/202603*.sql "$here"/../migrations/20261022*.sql "$here"/../migrations/20261027000000_live_baseline.sql "$here"/../migrations/20261027120000_sync_foundation.sql; do
 q -f "$migration" >> "$work/apply.log" 2>&1 || { cat "$work/apply.log"; exit 1; }
done
q -At -f "$here/catalog-query.sql" > "$work/m2.json"
if q -f "$here/../tests/guest-write-guard.sql" > "$work/red.log" 2>&1; then
 echo 'FAIL: M2 guest cases unexpectedly green'; exit 1
fi
cat "$work/red.log"
rg -q 'M2B_UNGUARDED: guest contest' "$work/red.log"
rg -q 'M2B_SUITE_FAILED:' "$work/red.log"
if rg -q 'M2B_UNEXPECTED_SQLSTATE:.*SQLSTATE=(42703|42P01|42883)' "$work/red.log"; then
 echo 'FAIL: invalid probe SQL'; exit 1
fi
echo 'PASS: M2 guest cases RED'
q -f "$here/../migrations/20261027130000_guest_write_guard.sql" >> "$work/apply.log" 2>&1
q -At -f "$here/catalog-query.sql" > "$work/m2b.json"
python3 "$here/guest-guard-catalog.py" "$work/m2.json" "$work/m2b.json"
q -f "$here/../tests/guest-write-guard.sql" > "$work/green.log" 2>&1 || { cat "$work/green.log"; exit 1; }
echo 'PASS: M2b role/JWT probes GREEN'
python3 "$here/guest-guard-mutations.py" --url "$url"
echo 'PASS: local guest guard red/green and all mutations rejected'
