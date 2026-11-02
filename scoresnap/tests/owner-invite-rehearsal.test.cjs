const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const runner = path.resolve('supabase/schema-drift/owner-invite-rehearsal.sh');
const local = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
test('SQL fixture invite codes satisfy the actual client alphabet contract', () => {
  const { validJoinCode, normalizeJoinCode } = require('./helpers/load-ts.cjs')()('src/services/guest-join.ts');
  const sql = fs.readFileSync('supabase/tests/owner-invite-probes.sql', 'utf8');
  const codes = [...sql.matchAll(/,1,true,'([^']+)'/g)].map(match => match[1]);
  expect(codes).toHaveLength(2);
  for (const code of codes) { expect(validJoinCode(code)).toBe(true); expect(normalizeJoinCode(code)).toBe(code); }
});
function probe(args, additions = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aug331-guard-')), touched = path.join(dir, 'connected');
  fs.writeFileSync(path.join(dir, 'psql'), `#!/bin/sh\nprintf invoked >> '${touched}'\n[ -z "\${PGTARGETSESSIONATTRS+x}" ] || printf unexpected >> '${touched}'\nprintf "f\\n"\n`, { mode: 0o755 });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && key !== 'SNAPSCORE_DISPOSABLE_TEST'));
  Object.assign(env, { PATH: `${dir}:${env.PATH}`, AUG331_TOUCH: touched }, additions);
  try { return { ...spawnSync('bash', [runner, ...args], { env, encoding: 'utf8' }), connected: fs.existsSync(touched), touch: fs.existsSync(touched) ? fs.readFileSync(touched, 'utf8') : '' }; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('missing fresh-disposable-launcher opt-in rejects before database contact', () => {
  const r = probe([local]); expect(r.status).toBe(1); expect(r.stderr).toContain('AUG331_GUARD: fresh disposable launcher opt-in required'); expect(r.connected).toBe(false);
});
test.each([
  [], [local, 'extra'], ['postgresql://postgres:postgres@remote.example:54322/postgres'],
  ['postgresql://postgres:postgres@localhost:54322/postgres'], ['postgresql://postgres:postgres@127.0.0.1:54322/live'],
  ['postgresql://other:postgres@127.0.0.1:54322/postgres'], ['postgresql://postgres:other@127.0.0.1:54322/postgres'],
  [`${local}?hostaddr=203.0.113.1`], [`${local}#fragment`], ['postgresql://postgres@127%2e0%2e0%2e1:54322/postgres'],
  ['postgresql://postgres@127.0.0.1,remote.example:54322/postgres'], ['postgresql://postgres@127.0.0.1:99999/postgres'],
].map(args => [args]))('unsafe arguments refused before psql: %j', args => {
  const r = probe(args, { SNAPSCORE_DISPOSABLE_TEST: '1' }); expect(r.status).not.toBe(0); expect(r.stderr).toContain('AUG331_GUARD:'); expect(r.connected).toBe(false);
});
test.each(['PGHOSTADDR','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGSYSCONFDIR','PGOPTIONS','PGSSLMODE','PGSSLKEY','PGSSLCERT','PGSSLROOTCERT','PGGSSENCMODE','PGKRBSRVNAME','PGREQUIREAUTH'])('libpq %s override rejected without reading/printing its value or connecting', name => {
  const r = probe([local], { SNAPSCORE_DISPOSABLE_TEST: '1', [name]: 'override-value-do-not-print' });
  expect(r.status).toBe(1); expect(r.stderr).toContain('AUG331_GUARD: libpq'); expect(r.stderr).not.toContain('override-value-do-not-print'); expect(r.connected).toBe(false);
});
test('allowed URL still requires actual PG17 disposable server before writes', () => {
  const r = probe([local], { SNAPSCORE_DISPOSABLE_TEST: '1' }); expect(r.status).toBe(1); expect(r.connected).toBe(true); expect(r.stderr).toContain('requires actual PostgreSQL 17');
});
test('validated host-loopback URL may reach a disposable Docker bridge server address', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aug331-bridge-'));
  fs.writeFileSync(path.join(dir, 'psql'), `#!/bin/sh
case "$*" in
  *server_version_num*) case "$*" in *inet_server_addr*) printf 'f\\n';; *) printf 't\\n';; esac;;
  *inet_server_addr*) printf 'AUG331_REHEARSAL: server socket address (diagnostic only): 172.18.0.2\\n';;
  *catalog-query.sql*) printf 'reached catalog preflight without writes\\n' >&2; exit 42;;
  *) exit 43;;
esac
`, { mode: 0o755 });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  Object.assign(env, { PATH: `${dir}:${env.PATH}`, SNAPSCORE_DISPOSABLE_TEST: '1' });
  try {
    const r = spawnSync('bash', [runner, local], { env, encoding: 'utf8' });
    expect(r.status).toBe(42); expect(r.stdout).toContain('diagnostic only): 172.18.0.2');
    expect(r.stderr).toContain('reached catalog preflight without writes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('existing fresh-stack lanes opt in without making the proposal an active migration', () => {
  expect(fs.readFileSync('supabase/schema-drift/m4b-local.sh','utf8')).toContain('SNAPSCORE_DISPOSABLE_TEST=1 bash "$here/owner-invite-rehearsal.sh" "$url"');
  expect(fs.readFileSync('supabase/schema-drift/verify-foundation-ci.sh','utf8')).toContain('bash "$here/owner-invite-rehearsal.sh" "$url"');
  expect(fs.readFileSync('../.github/workflows/schema-drift.yml','utf8')).toContain('SNAPSCORE_DISPOSABLE_TEST: "1"');
  expect(fs.existsSync('supabase/migrations/20261101190000_owner_invite_snapshot.sql')).toBe(false);
});

test('unlisted PG settings are removed from the psql subprocess environment', () => {
  const r = probe([local], { SNAPSCORE_DISPOSABLE_TEST: '1', PGTARGETSESSIONATTRS: 'read-write' });
  expect(r.status).toBe(1); expect(r.touch).toBe('invoked');
});
