#!/usr/bin/env bash
# One command: throwaway local Postgres with the repo's schema plus the two PROPOSED web
# files, a local stand-in for the hosted backend, the site build, and the three-browser journey.
# Touches nothing outside this machine. Needs: Node, Playwright's Chromium, and either
# PostgreSQL 16 or 17 installed, or Docker (then nothing else: it runs postgres:17 in a container).
#
#   e2e/web-links/run.sh            # builds the site first (about 3 minutes)
#   DIST=dist-site e2e/web-links/run.sh   # reuse a site already built with EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399
#   OUT_DIR=/some/folder            # where the screenshots go (default: the system temp folder)
#   WEB_LINKS_DOCKER=1              # use Docker even when PostgreSQL is installed
#   PGURL=postgresql://...          # use a database that is already running instead of starting one. It must be an
#                                   # EMPTY throwaway: the script refuses one that already has SnapScore tables.
#   PSQL="docker exec -i NAME psql -U postgres"   # with PGURL, when this machine has no psql of its own
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd); app=$(cd -- "$here/../.." && pwd)
bin=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}; [ -n "$bin" ] && export PATH="$bin:$PATH"
external=${PGURL:-}
docker=${WEB_LINKS_DOCKER:-}; [ -n "$external" ] || command -v initdb >/dev/null || docker=1
[ -z "$external" ] || docker=
if [ -n "$docker" ]; then command -v docker >/dev/null || { echo "web-links: neither PostgreSQL (initdb; set PGBIN) nor Docker found"; exit 2; }; fi
work=$(mktemp -d "${TMPDIR:-/tmp}/web-links-XXXXXX"); port=54777; url="postgresql://postgres@127.0.0.1:$port/postgres"
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
box="web-links-$$"
cleanup() { [ -n "${bridge:-}" ] && kill "$bridge" 2>/dev/null || true
  if [ -n "$external" ]; then :; elif [ -n "$docker" ]; then docker rm -f "$box" >/dev/null 2>&1 || true; else as_pg pg_ctl -D "$work/db" -m immediate -w stop >/dev/null 2>&1 || true; fi; rm -rf "$work"; }
trap cleanup EXIT
mkdir -p "$work/sql" && cp -R "$app/supabase/migrations" "$app/supabase/proposed" "$app/supabase/schema-drift/offline-bootstrap.sql" "$here/stubs.sql" "$here/seed.sql" "$work/sql/"
if [ -n "$external" ]; then
  # A database someone else started. Nothing is started or stopped here.
  if [ -n "${PSQL:-}" ]; then read -r -a psqlcmd <<<"$PSQL"; else psqlcmd=(psql "$external"); fi
elif [ -n "$docker" ]; then
  # Reachable from this machine only; trust auth is for the throwaway container, never a real database.
  docker run -d --rm --name "$box" -e POSTGRES_HOST_AUTH_METHOD=trust -p "127.0.0.1:$port:5432" postgres:17 >/dev/null
  for _ in $(seq 60); do docker exec "$box" psql -U postgres -h 127.0.0.1 -Atc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
  docker exec "$box" psql -U postgres -h 127.0.0.1 -Atc 'select 1' >/dev/null || { echo "web-links: the postgres:17 container did not start"; exit 2; }
  psqlcmd=(docker exec -i "$box" psql -U postgres)
else
  [ "$(id -u)" = 0 ] && chown -R postgres "$work" && chmod 755 "$work"
  as_pg initdb -D "$work/db" -U postgres -A trust >/dev/null
  as_pg pg_ctl -D "$work/db" -l "$work/server.log" -o "-k $work -h 127.0.0.1 -p $port" -w start >/dev/null
  psqlcmd=(psql "$url")
fi
q() { "${psqlcmd[@]}" -X -q -v ON_ERROR_STOP=1 "$@"; }
q -Atc 'select 1' >/dev/null || { echo "web-links: cannot reach the database with: ${psqlcmd[*]}"; exit 2; }
if [ -n "$external" ] && [ "$(q -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='contests'")" != 0 ]; then
  echo "web-links: the PGURL database already has SnapScore tables. Use an empty throwaway database."; exit 2; fi
# PostgreSQL 16 has no MAINTAIN privilege (17 does). Drop the word from the throwaway copy only.
if [ "$(q -Atc 'show server_version_num')" -lt 170000 ]; then sed -i.bak -E 's/, MAINTAIN//g; s/MAINTAIN, //g' "$work"/sql/migrations/*.sql "$work"/sql/proposed/*.sql; fi
# The browser journey and the stand-in backend reach the database the same way this script does.
export WEB_LINKS_PSQL; WEB_LINKS_PSQL=$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${psqlcmd[@]}")
# Files go in on standard input, so the same lines work inside the container.
qf() { local file=$1; shift; q "$@" <"$file"; }
qf "$work/sql/offline-bootstrap.sql" >"$work/apply.log" 2>&1
qf "$work/sql/stubs.sql" >>"$work/apply.log" 2>&1
for m in "$work"/sql/migrations/*.sql; do qf "$m" >>"$work/apply.log" 2>&1 || { echo "FAILED $m"; tail -5 "$work/apply.log"; exit 1; }; done
# Proposals already live in production, then the two under test.
for p in 20261031230000_restore_game_settings 20261101020000_owner_discovery 20261101190000_owner_invite_snapshot 20261128000000_web_player_links 20261128010000_web_score_rules; do
  qf "$work/sql/proposed/$p.sql" >>"$work/apply.log" 2>&1 || { echo "FAILED $p"; tail -5 "$work/apply.log"; exit 1; }; done
qf "$app/supabase/tests/web-player-links.sql" | grep -q 'PASS: web player links' && echo "PASS  server test (supabase/tests/web-player-links.sql)"
qf "$app/supabase/tests/web-score-rules.sql" | grep -q 'PASS: web score rules' && echo "PASS  server test (supabase/tests/web-score-rules.sql)"
token=$(qf "$work/sql/seed.sql" -At | tail -1)
dist=${DIST:-}
if [ -z "$dist" ]; then
  (cd "$app" && EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 EXPO_PUBLIC_SUPABASE_ANON_KEY=local-stand-in EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=true \
    EXPO_PUBLIC_FEATURE_ACCOUNT_HANDOFF=false EXPO_PUBLIC_PRO_ENABLED=false EXPO_PUBLIC_FEATURE_LEAGUES=false EXPO_PUBLIC_FEATURE_NATIVE_LINKS=false node scripts/build-web-site.cjs >"$work/build.log" 2>&1) || { tail -20 "$work/build.log"; exit 1; }
  dist="$app/dist-site"
fi
WEB_LINKS_DB="$url" node "$here/bridge.cjs" >"$work/bridge.log" 2>&1 & bridge=$!
sleep 1
WEB_LINKS_DB="$url" PLAYER_TOKEN="$token" node "$here/journey.cjs" "$dist"
