#!/usr/bin/env bash
# Only called by launchers that just created/reset a disposable PG17 cluster.
# Loopback alone is NOT disposal proof (it could be a forwarded production port).
set -euo pipefail
fail() { echo "AUG331_GUARD: $*" >&2; exit 1; }
[[ ${SNAPSCORE_DISPOSABLE_TEST:-} == 1 ]] || fail 'fresh disposable launcher opt-in required'
[[ $# == 1 ]] || fail 'exactly one disposable connection argument required'
# Reject routing/config overrides BEFORE the first psql call. Never print values.
for name in PGHOSTADDR PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGSYSCONFDIR PGOPTIONS PGSSLMODE PGSSLKEY PGSSLCERT PGSSLROOTCERT PGGSSENCMODE PGKRBSRVNAME PGREQUIREAUTH; do
  [[ ! -v $name ]] || fail 'libpq connection/config override is forbidden'
done
url=$1
python3 - "$url" <<'PY'
import re, sys
m = re.fullmatch(r'postgresql://postgres(?::postgres)?@127\.0\.0\.1:([0-9]{1,5})/postgres', sys.argv[1])
if not m or not 1024 <= int(m[1]) <= 65535:
    raise SystemExit('AUG331_GUARD: only the exact disposable loopback postgres endpoint is allowed')
PY
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
work=$(mktemp -d /tmp/aug331-rehearsal-XXXX)
trap 'rm -rf "$work"' EXIT
# No interactive auth, ~/.psqlrc, password files, SSL/GSS credentials or service files.
q() { env -i PATH="$PATH" LC_ALL=C PGPASSFILE=/dev/null PGSERVICEFILE=/dev/null PGCONNECT_TIMEOUT=3 PGSSLMODE=disable PGGSSENCMODE=disable PGREQUIREAUTH='!gss,!sspi' \
  psql "$url" -X -w -q -v ON_ERROR_STOP=1 -c "SET statement_timeout='30s'; SET lock_timeout='5s';" "$@"; }
identity=$(q -Atqc "SELECT current_setting('server_version_num')::int/10000=17 AND current_database()='postgres' AND session_user='postgres'")
[[ $identity == t ]] || fail 'requires actual PostgreSQL 17 on the disposable local postgres database'
# Docker port publishing maps the validated host-loopback URL to a container
# interface. The server-side socket address is diagnostic, not disposal proof.
q -Atqc "SELECT 'AUG331_REHEARSAL: server socket address (diagnostic only): ' || inet_server_addr()::text"
# Refuse to overwrite/roll back an already modified predecessor. Derive exact
# function-body expectations from this checkout's active migration definitions.
expected=$(python3 - "$here/../migrations" <<'PY'
import hashlib, json, pathlib, re, sys
expected = {}
for file in sorted(pathlib.Path(sys.argv[1]).glob('*.sql')):
    text = file.read_text()
    for name in ('fetch_snapshot', 'sync_round_bundle'):
        for match in re.finditer(r'CREATE(?: OR REPLACE)? FUNCTION public\.'+name+r'\(', text):
            start = text.index('AS $$', match.start()) + 5
            body = text[start:text.index('$$;', start)]
            expected[name] = hashlib.md5(body.encode()).hexdigest()
assert len(expected) == 2
print(json.dumps(expected))
PY
)
q -At -f "$here/catalog-query.sql" > "$work/before.json"
ledger="SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations m"
q -Atqc "$ledger" > "$work/ledger-before.json"
# Exact proposal/rollback files execute unmodified. Fixtures never surround their
# BEGIN/COMMIT blocks; only psql variables carry expectations across phases.
if ! q -v expected_bodies="$expected" -f "$here/../tests/owner-invite-rehearsal.sql" > "$work/probes.log" 2>&1; then
  cat "$work/probes.log" >&2
  echo 'AUG331_REHEARSAL: failed; launcher must discard this disposable cluster' >&2
  exit 1
fi
for marker in 'forward owner/access/shape probes' 'privacy mutant rejected' 'exact predecessor rollback' 'rollback mutant rejected' 'reapply owner/access/shape probes' 'prerequisite rollback'; do
  grep -Fq "PASS: AUG331 $marker" "$work/probes.log" || fail 'required rehearsal phase marker missing'
done
q -At -f "$here/catalog-query.sql" > "$work/after.json"
q -Atqc "$ledger" > "$work/ledger-after.json"
python3 "$here/drift.py" compare "$work/before.json" "$work/after.json"
python3 - "$work/ledger-before.json" "$work/ledger-after.json" <<'PY'
import json, sys
before, after = (json.load(open(p)) for p in sys.argv[1:])
assert before == after, 'AUG331_ASSERT: migration ledger changed'
print('PASS: AUG331 unchanged migration ledger')
PY
grep '^PASS: AUG331 ' "$work/probes.log"
echo 'PASS: AUG331 PG17 exact forward/rollback/reapply; normalized logical catalog restored (not physical OIDs or Auth/HTTP/device proof)'
