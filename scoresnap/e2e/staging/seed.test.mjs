import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTS, COURSE, CONTEST_ID, SEED_VERSION, assertLocal, emailFor, playerId, seed } from './seed.mjs';

test('targets only a never-linked local stack', async () => {
  for (const ok of ['http://127.0.0.1:54321', 'http://localhost:54321']) assert.doesNotThrow(() => assertLocal(ok));
  for (const bad of ['https://pltgbizexllikiwryozm.supabase.co', 'http://127.0.0.1:54321/', 'http://10.0.0.5:54321', 'https://127.0.0.1:54321', '']) assert.throws(() => assertLocal(bad));
  await assert.rejects(seed({ url: 'https://example.supabase.co', anon: 'a', service: 's' }), /never-linked local stack/);
});

test('seed identities are fixed, synthetic and unroutable', () => {
  assert.equal(SEED_VERSION, 1);
  assert.deepEqual(ACCOUNTS.map(a => a.role), ['owner', 'player2', 'player3', 'player4', 'outsider']);
  for (const a of ACCOUNTS) assert.match(emailFor(a.role), /^snapscore-staging-[a-z0-9]+@example\.test$/);
  assert.equal(new Set(ACCOUNTS.map(a => emailFor(a.role))).size, ACCOUNTS.length);
  assert.equal(ACCOUNTS.filter(a => a.member).length, 4);
  const ids = [CONTEST_ID, ...[1, 2, 3, 4].map(playerId)];
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('synthetic course is a valid 18-hole layout', () => {
  assert.equal(COURSE.holes.length, 18);
  assert.deepEqual(COURSE.holes.map(h => h.num), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.deepEqual([...COURSE.holes.map(h => h.hcp)].sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.equal(COURSE.holes.reduce((s, h) => s + h.par, 0), 72);
});
