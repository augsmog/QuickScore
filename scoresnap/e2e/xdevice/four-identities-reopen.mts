// AUG-1274: four disposable identities exercising the shared-round host/join/
// approval/roster flow for AUG-400, reusing the same production REST/RPC and
// scoreOutbox/onlineClient stack as e2e/xdevice/four-identities.mts. This file
// adds the one assertion that harness did not generically cover: a force-quit/
// reopen of EVERY identity (not just the one revoked-session case in the base
// script) restores membership, roster and the converged score from the
// account alone, with no in-memory client/view object reused.
//
// Scope note (AC: "cover tournament/league branches only when included;
// record exclusions explicitly"): the tournament-completion ("rewritten-008")
// path is already covered end-to-end by e2e/xdevice/four-identities.mts (its
// M5 section); it is not duplicated here. The M9 lightweight-league candidate
// is explicitly OUT of scope for this file -- it is tracked separately by
// AUG-1273's four-identities-league.mts, since league membership sits outside
// the base shared-round migration chain. No device, simulator binary or
// physical phone is involved; execution is on the disposable stack only.
import type { WriteArgs } from '../../src/services/tournament-sync-plan';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as guestJoinModule from '../../src/services/guest-join';
const { validJoinCode } = (guestJoinModule as any).default ?? guestJoinModule;
const outboxModule = await import(process.env.XDEVICE_OUTBOX_MODULE || '../../src/services/score-outbox.ts');
const { scoreOutbox } = outboxModule.default ?? outboxModule;
import * as onlineModule from '../../src/services/online-client';
const { onlineClient } = (onlineModule as any).default ?? onlineModule;
import * as syncModule from '../../src/services/sync-v1';
const { snapshotScore, loadSyncCapability } = (syncModule as any).default ?? syncModule;

const api = process.env.XDEVICE_API!;
const db = process.env.XDEVICE_DB!;
for (const url of [api, db]) assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'disposable loopback stack only');
const sql = (input: string) => execFileSync('psql', [db, '-XAt', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const work = await mkdtemp(join(tmpdir(), 'snapscore-four-identities-reopen-'));

const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { cwd: process.env.XDEVICE_BACKEND, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const anonKey: string = status.ANON_KEY;
assert(anonKey);

type Identity = { id: string; token: string; refresh: string };
const users: Identity[] = [];
for (let i = 0; i < 4; i++) {
  const auth = createClient(api, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await (i === 0
    ? auth.auth.signUp({ email: `xdevice-reopen-${randomUUID()}@example.test`, password: `${randomUUID()}aA!9` })
    : auth.auth.signInAnonymously());
  assert(!error && data.session && data.user, 'disposable host/anonymous guest Auth signup');
  if (i > 0) assert.equal(data.user.is_anonymous, true);
  users.push({ id: data.user.id, token: data.session.access_token, refresh: data.session.refresh_token! });
}
const rpc = (i: number) => async (name: string, args: Record<string, unknown>) => {
  const response = await fetch(`${api}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${users[i].token}`, apikey: anonKey }, body: JSON.stringify(args) });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw Object.assign(Error(`RPC ${name} failed`), { code: data?.code, status: response.status });
  return data;
};
const storage = { getItem: async (key: string) => { try { return await readFile(join(work, key), 'utf8'); } catch (e: any) { if (e.code === 'ENOENT') return null; throw e; } }, setItem: (key: string, value: string) => writeFile(join(work, key), value) };
const views: Record<number, Record<string, any>> = { 0: {}, 1: {}, 2: {}, 3: {} };
function makeClient(i: number) {
  return onlineClient(async (name: string, args: any) => ({ data: await rpc(i)(name, args), error: null }), (id: string, member: any, snapshot: any) => { if (member && snapshot) views[i][id] = snapshot; else delete views[i][id]; });
}
let clients = [makeClient(0), makeClient(1), makeClient(2), makeClient(3)];

try {
  // --- Host / join / approval / roster ----------------------------------
  const contest = randomUUID();
  const hostPlayer = randomUUID(), p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();
  const JOIN_CODE = 'SHRRND'; // exactly 6 chars from guest-join.ts's JOIN_ALPHABET (no I/O/0/1)
  assert(validJoinCode(JOIN_CODE), 'fixture join code must pass production validation');
  sql(`INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,protocol,sync_enabled) VALUES
('${contest}','${users[0].id}','Shared Round','{"holes":[{"num":1,"par":4},{"num":2,"par":3}]}','active','${JOIN_CODE}',1,true);
INSERT INTO public.contest_players(id,contest_id,user_id,name,scores) VALUES
('${hostPlayer}','${contest}','${users[0].id}','Host',ARRAY[0,0]),
('${p1}','${contest}',NULL,'Member One',ARRAY[0,0]),
('${p2}','${contest}',NULL,'Member Two',ARRAY[0,0]),
('${p3}','${contest}',NULL,'Member Three',ARRAY[0,0]);
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES
('${contest}','${users[0].id}','host',NULL,'approved');`);

  for (let i = 1; i < 4; i++) {
    assert.deepEqual(await clients[i].requestJoin(JOIN_CODE, `Guest ${i}`), { status: 'pending' });
    const discovered = await clients[i].discover();
    assert.equal(discovered.memberships.length, 0, 'no roster leaks before host approval');
  }
  const pending = await clients[0].listRequests(contest);
  const seats = [p1, p2, p3];
  for (let i = 1; i < 4; i++) await clients[0].decide(pending.find((r: any) => r.requester === users[i].id).id, true, seats[i - 1]);
  await clients[0].rejoinHost(contest);
  for (let i = 1; i < 4; i++) await clients[i].discover();
  for (let i = 0; i < 4; i++) assert(views[i][contest], `identity ${i} sees the approved roster after host decision`);
  assert.deepEqual(views[0][contest].rounds[0].players.map((p: any) => p.displayName).sort(), ['Host', 'Member One', 'Member Three', 'Member Two']);
  console.log('PASS host/join/approval/roster: three guests request, the host approves each into a distinct seat, and all four identities see the same roster');

  // --- Distinct player score edits ---------------------------------------
  const roundId = views[0][contest].rounds[0].id;
  const boxes = [hostPlayer, p1, p2, p3].map((player, i) => ({
    player,
    box: scoreOutbox(storage, users[i].id, randomUUID, async (writeArgs: WriteArgs) => {
      await loadSyncCapability(true, contest, () => rpc(i)('sync_capabilities', { contest_id: contest }), () => delete views[i][contest]);
      return rpc(i)('write_score', { ...writeArgs });
    }),
  }));
  for (let i = 0; i < 4; i++) {
    const edit = snapshotScore(true, views[i][contest], roundId, boxes[i].player, 1, 2 + i);
    await boxes[i].box.enqueue(edit.draft, edit.version);
    await boxes[i].box.replay();
  }
  for (let i = 1; i < 4; i++) await clients[i].discover();
  await clients[0].rejoinHost(contest);
  const getCell = (snapshot: any, player: string, hole: number) => snapshot.rounds.find((r: any) => r.id === roundId).players.find((p: any) => p.id === player).cells.find((c: any) => c.hole === hole);
  for (let i = 0; i < 4; i++) assert.equal(getCell(views[0][contest], boxes[i].player, 1).strokes, 2 + i, `each identity's own distinct edit landed on its own seat ${i}`);
  console.log('PASS distinct player score edits: four separate identities each committed a different seat\'s score and the host\'s view has all four');

  // --- Offline conflict / convergence -------------------------------------
  // Host (owner) and member 1 (the mapped player) both edit player 1's hole 2
  // offline before either has reconnected; one wins, the other must resolve
  // an explicit conflict, never silently overwrite or drop the other value.
  const hostEdit = snapshotScore(true, views[0][contest], roundId, p1, 2, 9);
  await boxes[0].box.enqueue(hostEdit.draft, hostEdit.version);
  const memberEdit = snapshotScore(true, views[1][contest], roundId, p1, 2, 5);
  await boxes[1].box.enqueue(memberEdit.draft, memberEdit.version);
  await boxes[0].box.replay();
  await boxes[1].box.replay();
  const conflictEntries = (await boxes[1].box.inspect()).entries;
  assert.equal(conflictEntries.length, 1);
  assert.equal(conflictEntries[0].state, 'conflict');
  assert.equal(conflictEntries[0].receipt?.strokes, 9, 'the loser\'s conflict receipt reports the value that actually committed, never its own');
  await boxes[1].box.resolve(conflictEntries[0].id, 'keep-current', true);
  assert.equal((await boxes[1].box.inspect()).entries.length, 0);
  for (let i = 1; i < 4; i++) await clients[i].discover();
  await clients[0].rejoinHost(contest);
  const canonical = views[0][contest];
  for (let i = 1; i < 4; i++) assert.deepEqual(views[i][contest], canonical, `identity ${i} converges to the same canonical state after the conflict resolves`);
  assert.equal(getCell(canonical, p1, 2).strokes, 9);
  console.log('PASS offline conflict/convergence: two identities editing the same cell offline resolve to one explicit value and every identity converges');

  // --- Reopen recovery (force-quit/reopen on EACH of the four identities) -
  // Discard every in-memory client and view, then reconstruct each identity
  // from only its persisted refresh token -- the same durable credential a
  // relaunched app reads from disk, never a cached client-side object.
  views[0] = {}; views[1] = {}; views[2] = {}; views[3] = {};
  const reopened: any[] = [];
  for (let i = 0; i < 4; i++) {
    const relaunchedAuth = createClient(api, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: session, error } = await relaunchedAuth.auth.refreshSession({ refresh_token: users[i].refresh });
    assert(!error && session.session, `identity ${i} real disposable Auth reconnect on relaunch`);
    users[i].token = session.session!.access_token; // the relaunched app's only source of authority
    const relaunchedClient = onlineClient(async (name: string, args: any) => ({ data: await rpc(i)(name, args), error: null }), (id: string, member: any, snapshot: any) => { if (member && snapshot) views[i][id] = snapshot; else delete views[i][id]; });
    reopened.push(i === 0 ? (await relaunchedClient.rejoinHost(contest)).snapshot : await relaunchedClient.rejoin(contest));
    clients[i] = relaunchedClient;
  }
  for (let i = 0; i < 4; i++) {
    assert(reopened[i], `identity ${i} restores its authorized seat on reopen with no prior in-memory state`);
    assert.deepEqual(views[i][contest], canonical, `identity ${i}'s roster, membership and every converged score match the pre-reopen canonical state`);
  }
  console.log('PASS reopen recovery: force-quitting and reopening all four identities restores membership, roster and the latest converged scores purely from the account');

  console.log('PASS four-identity shared-round journey for AUG-400: host/join/approval/roster, distinct score edits, offline conflict/convergence and reopen recovery on every identity');
} finally {
  await rm(work, { recursive: true, force: true });
}
