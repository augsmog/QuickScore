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
# Hosted auth.users columns read by live handle_new_user (same stub as verify-foundation.py).
q -c "ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb, ADD COLUMN IF NOT EXISTS created_at timestamptz, ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz" >> "$work/apply.log" 2>&1
for migration in "$here"/../migrations/202603*.sql "$here"/../migrations/20261022*.sql "$here"/../migrations/20261027000000_live_baseline.sql "$here"/../migrations/20261027120000_sync_foundation.sql; do
 q -f "$migration" >> "$work/apply.log" 2>&1 || { cat "$work/apply.log"; exit 1; }
done
red_log="$work/red.log"
if bash "$here/rollback-race-test.sh" "$url" "$here/fixtures/unsafe-rollback-no-lock.down.sql" > "$red_log" 2>&1; then
 echo 'FAIL: unsafe fixture unexpectedly passed'; exit 1
fi
cat "$red_log"
# Require the historical bug, rather than counting an infrastructure error as red.
grep -q 'PASS: observed rollback Lock wait' "$red_log"
grep -q 'FAIL: rollback succeeded after concurrent writer committed' "$red_log"
echo 'PASS: unsafe fixture failed (expected red)'
if [[ $(q -Atqc "SELECT to_regclass('public.contest_memberships') IS NOT NULL") == t ]]; then
 q -f "$here/../rollback/20261027120000_sync_foundation.down.sql" >> "$work/apply.log" 2>&1
fi
q -f "$here/../migrations/20261027120000_sync_foundation.sql" >> "$work/apply.log" 2>&1
bash "$here/rollback-race-test.sh" "$url"
echo 'PASS: local synchronized rollback race red/green'
