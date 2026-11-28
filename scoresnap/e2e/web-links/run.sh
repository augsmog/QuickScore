#!/usr/bin/env bash
# One command: throwaway local Postgres with the repo's schema plus the two PROPOSED web
# files, a local stand-in for the hosted backend, the site build, and the three-browser journey.
# Touches nothing outside this machine. Needs: Node, Playwright's Chromium, PostgreSQL 16 or 17.
#
#   e2e/web-links/run.sh            # builds the site first (about 3 minutes)
#   DIST=dist-site e2e/web-links/run.sh   # reuse a site already built with EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399
#   OUT_DIR=/some/folder            # where the screenshots go (default: the system temp folder)
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd); app=$(cd -- "$here/../.." && pwd)
bin=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}; [ -n "$bin" ] && export PATH="$bin:$PATH"
command -v initdb >/dev/null || { echo "web-links: PostgreSQL (initdb) not found; set PGBIN"; exit 2; }
work=$(mktemp -d "${TMPDIR:-/tmp}/web-links-XXXXXX"); port=54777; url="postgresql://postgres@127.0.0.1:$port/postgres"
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
cleanup() { [ -n "${bridge:-}" ] && kill "$bridge" 2>/dev/null || true; as_pg pg_ctl -D "$work/db" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
mkdir -p "$work/sql" && cp -R "$app/supabase/migrations" "$app/supabase/proposed" "$app/supabase/schema-drift/offline-bootstrap.sql" "$here/stubs.sql" "$here/seed.sql" "$work/sql/"
# PostgreSQL 16 has no MAINTAIN privilege (17 does). Drop the word from the throwaway copy only.
if [ "$(initdb --version | grep -oE '[0-9]+' | head -1)" -lt 17 ]; then sed -i.bak -E 's/, MAINTAIN//g; s/MAINTAIN, //g' "$work"/sql/migrations/*.sql "$work"/sql/proposed/*.sql; fi
[ "$(id -u)" = 0 ] && chown -R postgres "$work" && chmod 755 "$work"
as_pg initdb -D "$work/db" -U postgres -A trust >/dev/null
as_pg pg_ctl -D "$work/db" -l "$work/server.log" -o "-k $work -h 127.0.0.1 -p $port" -w start >/dev/null
q() { psql "$url" -X -q -v ON_ERROR_STOP=1 "$@"; }
q -f "$work/sql/offline-bootstrap.sql" >"$work/apply.log" 2>&1
q -f "$work/sql/stubs.sql" >>"$work/apply.log" 2>&1
for m in "$work"/sql/migrations/*.sql; do q -f "$m" >>"$work/apply.log" 2>&1 || { echo "FAILED $m"; tail -5 "$work/apply.log"; exit 1; }; done
# Proposals already live in production, then the two under test.
for p in 20261031230000_restore_game_settings 20261101020000_owner_discovery 20261101190000_owner_invite_snapshot 20261128000000_web_player_links 20261128010000_web_score_rules; do
  q -f "$work/sql/proposed/$p.sql" >>"$work/apply.log" 2>&1 || { echo "FAILED $p"; tail -5 "$work/apply.log"; exit 1; }; done
q -f "$app/supabase/tests/web-player-links.sql" | grep -q 'PASS: web player links' && echo "PASS  server test (supabase/tests/web-player-links.sql)"
q -f "$app/supabase/tests/web-score-rules.sql" | grep -q 'PASS: web score rules' && echo "PASS  server test (supabase/tests/web-score-rules.sql)"
token=$(q -At -f "$work/sql/seed.sql" | tail -1)
dist=${DIST:-}
if [ -z "$dist" ]; then
  (cd "$app" && EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 EXPO_PUBLIC_SUPABASE_ANON_KEY=local-stand-in EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=true \
    EXPO_PUBLIC_FEATURE_ACCOUNT_HANDOFF=false EXPO_PUBLIC_PRO_ENABLED=false EXPO_PUBLIC_FEATURE_LEAGUES=false EXPO_PUBLIC_FEATURE_NATIVE_LINKS=false node scripts/build-web-site.cjs >"$work/build.log" 2>&1) || { tail -20 "$work/build.log"; exit 1; }
  dist="$app/dist-site"
fi
WEB_LINKS_DB="$url" node "$here/bridge.cjs" >"$work/bridge.log" 2>&1 & bridge=$!
sleep 1
WEB_LINKS_DB="$url" PLAYER_TOKEN="$token" node "$here/journey.cjs" "$dist"
