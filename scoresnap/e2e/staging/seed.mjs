// Disposable staging seed (AUG-395). Runs ONLY against a never-linked local Supabase stack
// (supabase start on a CI runner or a dev machine). Never point this at a hosted project.
// Reproducible: fixed synthetic emails and row ids, seed version pinned, safe to run twice.
// Passwords are random per run, masked in CI logs, and written only to a mode-600 env file.
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

export const SEED_VERSION = 1;
export const ACCOUNTS = [
  { role: 'owner', name: 'Staging Owner', member: true },
  { role: 'player2', name: 'Staging Player Two', member: true },
  { role: 'player3', name: 'Staging Player Three', member: true },
  { role: 'player4', name: 'Staging Player Four', member: true },
  { role: 'outsider', name: 'Staging Outsider', member: false },
];
export const emailFor = role => `snapscore-staging-${role}@example.test`;
export const CONTEST_ID = '5e5e0000-0000-4000-8000-000000000001';
export const playerId = i => `5e5e0000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`;
export const COURSE = {
  name: 'Staging Synthetic Links',
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: [4, 3, 5][i % 3], hcp: ((i * 7) % 18) + 1, yards: [380, 165, 510][i % 3] })),
};

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):54321$/;

export function assertLocal(url) {
  assert.match(String(url), LOCAL, 'Staging seed only runs against a never-linked local stack');
}

async function call(url, path, key, { method = 'GET', body, bearer = key, prefer } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: r.status, json };
}

async function findUser(url, service, email) {
  for (let page = 1; page <= 20; page++) {
    const r = await call(url, `/auth/v1/admin/users?page=${page}&per_page=200`, service);
    assert.equal(r.status, 200, 'List users');
    const users = r.json?.users ?? [];
    const hit = users.find(u => u.email === email);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

async function ensureUser(url, service, email, password) {
  const created = await call(url, '/auth/v1/admin/users', service, { method: 'POST', body: { email, password, email_confirm: true } });
  if (created.status === 200) return { user: created.json, reused: false };
  assert.ok([400, 422].includes(created.status), `Create user unexpected status ${created.status}`);
  const existing = await findUser(url, service, email);
  assert.ok(existing, 'Existing staging user not found after conflict');
  const upd = await call(url, `/auth/v1/admin/users/${existing.id}`, service, { method: 'PUT', body: { password, email_confirm: true } });
  assert.equal(upd.status, 200, 'Rotate staging user password');
  return { user: upd.json, reused: true };
}

async function signIn(url, anon, email, password) {
  const r = await call(url, '/auth/v1/token?grant_type=password', anon, { method: 'POST', body: { email, password } });
  assert.equal(r.status, 200, 'Password sign-in');
  assert.equal(r.json.user.is_anonymous, false);
  return r.json.access_token;
}

export async function seed({ url, anon, service, mask = () => {} }) {
  assertLocal(url);
  const out = { accounts: {}, env: { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: anon } };
  for (const a of ACCOUNTS) {
    const email = emailFor(a.role);
    const password = randomBytes(32).toString('hex');
    mask(password);
    const { user, reused } = await ensureUser(url, service, email, password);
    assert.equal(user.is_anonymous ?? false, false);
    const prof = await call(url, `/rest/v1/profiles?id=eq.${user.id}`, service, { method: 'PATCH', body: { display_name: a.name }, prefer: 'return=representation' });
    assert.equal(prof.status, 200, 'Profile row (on_auth_user_created trigger) updated');
    assert.equal(prof.json.length, 1, 'Exactly one profile per staging account');
    out.accounts[a.role] = { email, user_id: user.id, reused, password };
    const k = `STAGING_${a.role.toUpperCase()}`;
    out.env[`${k}_EMAIL`] = email;
    out.env[`${k}_PASSWORD`] = password;
  }
  // Contest: created by the owner through RLS (the app's legacy create path), then the roster by service role.
  const ownerJwt = await signIn(url, anon, out.accounts.owner.email, out.accounts.owner.password);
  const have = await call(url, `/rest/v1/contests?id=eq.${CONTEST_ID}&select=id,invite_code,owner_id`, anon, { bearer: ownerJwt });
  assert.equal(have.status, 200);
  if (have.json.length === 0) {
    const ins = await call(url, '/rest/v1/contests', anon, { method: 'POST', bearer: ownerJwt, prefer: 'return=representation',
      body: { id: CONTEST_ID, owner_id: out.accounts.owner.user_id, name: 'Staging Seed Round', course: COURSE, protocol: 0, sync_enabled: false } });
    assert.equal(ins.status, 201, 'Owner creates staging contest through RLS');
  }
  const roster = ACCOUNTS.filter(a => a.member).map((a, i) => ({ id: playerId(i + 1), contest_id: CONTEST_ID, user_id: out.accounts[a.role].user_id, name: a.name, handicap: [8, 12, 18, 24][i] }));
  const up = await call(url, '/rest/v1/contest_players?on_conflict=id', service, { method: 'POST', body: roster, prefer: 'resolution=merge-duplicates,return=representation' });
  assert.ok([200, 201].includes(up.status), `Seed roster status ${up.status}`);
  const contest = (await call(url, `/rest/v1/contests?id=eq.${CONTEST_ID}&select=id,invite_code,owner_id`, service)).json[0];
  assert.equal(contest.owner_id, out.accounts.owner.user_id, 'Seed contest still owned by the staging owner');
  // Verify every account signs in, members see the round, the outsider does not.
  for (const a of ACCOUNTS) {
    const jwt = await signIn(url, anon, out.accounts[a.role].email, out.accounts[a.role].password);
    const seen = await call(url, `/rest/v1/contests?id=eq.${CONTEST_ID}&select=id`, anon, { bearer: jwt });
    assert.equal(seen.status, 200);
    assert.equal(seen.json.length, a.member ? 1 : 0, `${a.role} contest visibility`);
  }
  const players = (await call(url, `/rest/v1/contest_players?contest_id=eq.${CONTEST_ID}&select=id`, service)).json;
  assert.equal(players.length, 4, 'Seed roster is exactly four players');
  out.manifest = {
    seed_version: SEED_VERSION, target: 'disposable-local-supabase', api_url: url,
    accounts: Object.fromEntries(Object.entries(out.accounts).map(([r, v]) => [r, { email: v.email, user_id: v.user_id, reused: v.reused }])),
    contest: { id: CONTEST_ID, invite_code: contest.invite_code, players: players.length, course: COURSE.name },
    checks: ['email-sign-in x5', 'profiles x5', 'owner-rls-create', 'member-visibility x4', 'outsider-hidden'],
  };
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.env.RUNNER_TEMP || process.env.STAGING_DIR;
  assert.ok(dir, 'Set RUNNER_TEMP or STAGING_DIR');
  const status = JSON.parse(await readFile(process.env.STAGING_STATUS || `${dir}/staging-status.json`, 'utf8'));
  const ci = !!process.env.GITHUB_ACTIONS;
  const mask = v => { if (ci) console.log(`::add-mask::${v}`); };
  mask(status.SERVICE_ROLE_KEY); mask(status.ANON_KEY);
  const { env, manifest } = await seed({ url: status.API_URL, anon: status.ANON_KEY, service: status.SERVICE_ROLE_KEY, mask });
  await writeFile(`${dir}/staging.env`, Object.entries(env).map(([k, v]) => `export ${k}='${v}'`).join('\n') + '\n', { mode: 0o600 });
  await chmod(`${dir}/staging.env`, 0o600);
  const manifestPath = process.env.STAGING_MANIFEST || `${dir}/staging-manifest.json`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Staging seed v${SEED_VERSION}: ${Object.keys(manifest.accounts).length} accounts (${Object.values(manifest.accounts).filter(a => a.reused).length} reused), contest ${manifest.contest.id} with ${manifest.contest.players} players`);
}
