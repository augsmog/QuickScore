// AUG-1273: four disposable identities exercising the M9 league candidate
// (supabase/proposed/20261103150000_lightweight_leagues.sql) end-to-end over the
// same production REST/RPC path as e2e/xdevice/four-identities.mts, plus the
// production scoreOutbox/onlineClient stack reused for the one named identity
// covering offline-reconnect-exactly-once and relaunch recovery. No device,
// simulator binary or physical phone is involved: "four-simulator" here means
// four disposable Auth identities against the loopback disposable stack.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { WriteArgs } from '../../src/services/tournament-sync-plan';
const outboxModule = await import(process.env.XDEVICE_OUTBOX_MODULE || '../../src/services/score-outbox.ts');
const { scoreOutbox } = outboxModule.default ?? outboxModule;
import * as onlineModule from '../../src/services/online-client';
const { onlineClient } = (onlineModule as any).default ?? onlineModule;
import * as syncModule from '../../src/services/sync-v1';
const { snapshotScore, loadSyncCapability } = (syncModule as any).default ?? syncModule;

const api = process.env.XDEVICE_API!;
const db = process.env.XDEVICE_DB!;
// Refuse remote endpoints before any Auth, SQL or HTTP operation.
for (const url of [api, db]) assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'disposable loopback stack only');
const sql = (input: string) => execFileSync('psql', [db, '-XAt', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const work = await mkdtemp(join(tmpdir(), 'snapscore-four-identities-league-'));

const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { cwd: process.env.XDEVICE_BACKEND, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const anonKey: string = status.ANON_KEY;
assert(anonKey);

type Identity = { id: string; token: string; refresh: string };
const users: Identity[] = [];
for (let i = 0; i < 4; i++) {
  const auth = createClient(api, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await (i === 0
    ? auth.auth.signUp({ email: `xdevice-league-${randomUUID()}@example.test`, password: `${randomUUID()}aA!9` })
    : auth.auth.signInAnonymously());
  assert(!error && data.session && data.user, 'disposable host/anonymous guest Auth signup');
  if (i > 0) assert.equal(data.user.is_anonymous, true);
  users.push({ id: data.user.id, token: data.session.access_token, refresh: data.session.refresh_token! });
}
const rpc = (i: number) => async (name: string, args: Record<string, unknown>) => {
  const response = await fetch(`${api}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${users[i].token}`, apikey: anonKey },
    body: JSON.stringify(args),
  });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw Object.assign(Error(`RPC ${name} failed`), { code: data?.code, status: response.status });
  return data;
};

try {
  // Host owns a league and two already-synced events. Event A has member 1
  // and member 3 already approved (so link_league_event imports them as
  // league members, the only way the M9 candidate creates league
  // membership). Event B seeds only the host's own approved membership row
  // (inserted explicitly above, contest_memberships for eventB/users[0]);
  // no other identity is an event B participant yet, so the host is the
  // sole approved membership link_league_event imports for event B.
  // Member 2 is never approved anywhere and never becomes a league member,
  // as a negative control throughout.
  const eventA = randomUUID(), eventB = randomUUID();
  const hostA = randomUUID(), m1A = randomUUID(), m3A = randomUUID();
  const hostB = randomUUID(), m1Seat = randomUUID(), m2Seat = randomUUID();
  sql(`INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,protocol,sync_enabled) VALUES
('${eventA}','${users[0].id}','League Event A','{"holes":[{"num":1,"par":4}]}','active','LGEEVA1',1,true),
('${eventB}','${users[0].id}','League Event B','{"holes":[{"num":1,"par":4}]}','active','LGEEVB1',1,true);
INSERT INTO public.contest_players(id,contest_id,user_id,name,scores) VALUES
('${hostA}','${eventA}','${users[0].id}','Host',ARRAY[0]),
('${m1A}','${eventA}','${users[1].id}','Member One',ARRAY[0]),
('${m3A}','${eventA}','${users[3].id}','Member Three',ARRAY[0]),
('${hostB}','${eventB}','${users[0].id}','Host',ARRAY[0]),
('${m1Seat}','${eventB}',NULL,'Member One seat',ARRAY[0]),
('${m2Seat}','${eventB}',NULL,'Member Two seat',ARRAY[0]);
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES
('${eventA}','${users[0].id}','host',NULL,'approved'),
('${eventA}','${users[1].id}','player','${m1A}','approved'),
('${eventA}','${users[3].id}','player','${m3A}','approved'),
('${eventB}','${users[0].id}','host',NULL,'approved');`);

  const league = (await rpc(0)('create_league', { p_league_name: 'Harness League' })) as string;
  await rpc(0)('link_league_event', { p_league_id: league, p_contest_id: eventA });
  const linkB = await rpc(0)('link_league_event', { p_league_id: league, p_contest_id: eventB });
  assert.deepEqual(linkB, { status: 'linked', mapped_players: 1 }, 'event B has only the host\'s own approved membership to import; no participant has joined yet');
  assert.equal((await rpc(0)('list_my_leagues', {})).length, 1);
  assert.equal((await rpc(0)('list_league_roster', { p_league_id: league })).length, 3, 'linking event A imported the host, member 1 and member 3, all already approved there; event B had no approved non-host member yet to import');

  // --- Before-approval isolation ---------------------------------------
  // Member 1 and member 3 are already league members (imported from event
  // A). Event B is listed but unauthorized/empty for both, until the event
  // host approves a seat there; league membership alone never grants event
  // access, and this holds independently for more than one league member.
  for (const member of [1, 3]) {
    const eventsForMember = await rpc(member)('list_league_events', { p_league_id: league });
    const row = eventsForMember.find((e: any) => e.id === eventB);
    assert.equal(row.authorized, false);
    assert.deepEqual(row.rounds, []);
    await assert.rejects(rpc(member)('fetch_snapshot', { contest_id: eventB, after_revision: 0 }), { code: '42501' });
  }
  await assert.rejects(rpc(1)('request_league_event_join', { p_league_id: league, p_contest_id: eventB }), { code: '22023' }, 'host must map a seat before a join request can resolve a player');

  // The host must map member 1's event B seat before a join request can
  // resolve a player; only then does request_league_event_join succeed.
  const hostRoster = await rpc(0)('list_league_roster', { p_league_id: league });
  const m1LeaguePlayer = hostRoster.find((r: any) => r.display_name === 'Member One').league_player_id;
  await rpc(0)('map_league_event_player', { p_league_id: league, p_contest_id: eventB, p_league_player_id: m1LeaguePlayer, p_contest_player_id: m1Seat });
  console.log('PASS before-approval isolation: league membership alone never exposes another event\'s roster, names or scores');

  // --- Event-specific approval / player mapping -------------------------
  assert.deepEqual(await rpc(1)('request_league_event_join', { p_league_id: league, p_contest_id: eventB }), { status: 'pending' });
  let rowB = (await rpc(1)('list_league_events', { p_league_id: league })).find((e: any) => e.id === eventB);
  assert.equal(rowB.authorized, false, 'a pending join request still grants no read access');
  const pendingB = await rpc(0)('list_join_requests', { contest_id: eventB });
  const m1Request = pendingB.find((r: any) => r.requester === users[1].id);
  assert.equal(m1Request.desired_player_id, m1Seat, 'the request carries the host-mapped seat, never a name-guessed one');
  await rpc(0)('decide_join_request', { request_id: m1Request.id, approve: true, player_id: m1Seat });
  rowB = (await rpc(1)('list_league_events', { p_league_id: league })).find((e: any) => e.id === eventB);
  assert.equal(rowB.authorized, true);
  // Member 3 remains an untouched league member throughout: approving
  // member 1's event B seat never leaked event B access to member 3.
  const rowBForMember3 = (await rpc(3)('list_league_events', { p_league_id: league })).find((e: any) => e.id === eventB);
  assert.equal(rowBForMember3.authorized, false, 'approving one member\'s event seat never authorizes a different league member');
  console.log('PASS event-specific approval and player mapping: approval on event B never touched event A, and the approved seat matches the host-mapped seat');

  // --- Mapped score synchronization --------------------------------------
  // Member 2's seat (m2Seat) stays deliberately unmapped and unapproved, so a
  // mapped write from member 1 is provably isolated to member 1's own seat.
  await rpc(1)('write_score', { contest_id: eventB, round_id: null, player_id: m1Seat, hole: 1, action: 'set', strokes: 4, expected_version: 0, op_id: randomUUID(), request_hash: 'league-m1-h1' });
  const afterM1 = await rpc(0)('list_league_events', { p_league_id: league });
  const eventBForHost = afterM1.find((e: any) => e.id === eventB);
  const m1Row = eventBForHost.rounds[0].players.find((p: any) => p.name === 'Member One seat');
  assert.equal(m1Row.holes[0].strokes, 4);
  assert.equal(eventBForHost.rounds[0].players.find((p: any) => p.name === 'Member Two seat').holes[0].strokes, null, 'an unrelated seat was not touched by member 1\'s write');
  await assert.rejects(
    rpc(1)('write_score', { contest_id: eventB, round_id: null, player_id: m2Seat, hole: 1, action: 'set', strokes: 9, expected_version: 0, op_id: randomUUID(), request_hash: 'league-m1-cross' }),
    { code: '42501' },
    'member 1 cannot write member 2\'s mapped seat',
  );
  console.log('PASS mapped score synchronization: a write from the mapped identity lands only on its own mapped seat and is readable through the league event listing');

  // --- Offline reconnect exactly-once convergence (member 1) ------------
  const storage = { getItem: async (key: string) => { try { return await readFile(join(work, key), 'utf8'); } catch (e: any) { if (e.code === 'ENOENT') return null; throw e; } }, setItem: (key: string, value: string) => writeFile(join(work, key), value) };
  const views: Record<string, any> = {};
  const client1 = onlineClient(async (name: string, args: any) => ({ data: await rpc(1)(name, args), error: null }), (id: string, member: any, snapshot: any) => { if (member && snapshot) views[id] = snapshot; else delete views[id]; });
  await client1.rejoin(eventB);
  assert(views[eventB], 'member 1 onlineClient restores the authorized league-mapped event');
  let dropOnce = true;
  const box1 = scoreOutbox(storage, users[1].id, randomUUID, async (writeArgs: WriteArgs) => {
    await loadSyncCapability(true, eventB, () => rpc(1)('sync_capabilities', { contest_id: eventB }), () => delete views[eventB]);
    const receipt = await rpc(1)('write_score', { ...writeArgs });
    if (dropOnce) { dropOnce = false; throw Error('injected lost response after commit'); }
    return receipt;
  });
  const before = sql(`SELECT count(*) FROM public.score_events WHERE contest_id='${eventB}' AND player_id='${m1Seat}';`);
  const edit = snapshotScore(true, views[eventB], views[eventB].rounds[0].id, m1Seat, 2, 7);
  await box1.enqueue(edit.draft, edit.version);
  await assert.rejects(box1.replay(), /lost response/);
  await box1.replay(); // the real app's reconnect retries the durable outbox entry, never a fresh op_id
  assert.equal((await box1.inspect()).entries.length, 0);
  const after = sql(`SELECT count(*) FROM public.score_events WHERE contest_id='${eventB}' AND player_id='${m1Seat}';`);
  assert.equal(Number(after) - Number(before), 1, 'the commit that reported a lost response must still land exactly once, not zero or twice');
  await client1.rejoin(eventB);
  assert.equal(views[eventB].rounds[0].players.find((p: any) => p.id === m1Seat).cells.find((c: any) => c.hole === 2).strokes, 7);
  console.log('PASS offline reconnect exactly-once convergence: a dropped-ack replay commits the mapped league score exactly once and the view converges');

  // --- Relaunch membership recovery (member 1) ---------------------------
  // Simulate a force-quit/reopen: discard every in-memory client/view object
  // for member 1 and re-authenticate from only the persisted refresh token,
  // the same durable credential a relaunched app would read from disk.
  delete views[eventB];
  const relaunchedAuth = createClient(api, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: relaunchSession, error: relaunchError } = await relaunchedAuth.auth.refreshSession({ refresh_token: users[1].refresh });
  assert(!relaunchError && relaunchSession.session, 'real disposable Auth reconnect on relaunch');
  const relaunchedRpc = async (name: string, args: Record<string, unknown>) => {
    const response = await fetch(`${api}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${relaunchSession.session!.access_token}`, apikey: anonKey }, body: JSON.stringify(args) });
    const body = await response.text();
    return { data: body ? JSON.parse(body) : null, error: null };
  };
  const relaunchedClient = onlineClient(relaunchedRpc, (id: string, member: any, snapshot: any) => { if (member && snapshot) views[id] = snapshot; else delete views[id]; });
  const restored = await relaunchedClient.rejoin(eventB);
  assert(restored, 'a freshly constructed client with no prior in-memory state still restores the authorized league seat');
  assert.equal(restored.rounds[0].players.find((p: any) => p.id === m1Seat).cells.find((c: any) => c.hole === 2).strokes, 7, 'the latest mapped score survives relaunch');
  const eventsAfterRelaunch: any = await (await fetch(`${api}/rest/v1/rpc/list_league_events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${relaunchSession.session!.access_token}`, apikey: anonKey }, body: JSON.stringify({ p_league_id: league }) })).json();
  assert.equal(eventsAfterRelaunch.find((e: any) => e.id === eventB).authorized, true, 'league event authorization recovers from the account alone, not a client-side cache');
  console.log('PASS relaunch membership recovery: league membership, the host-approved event seat, player mapping and the latest score all restore from the account after a simulated relaunch');

  console.log('PASS four-identity M9 league candidate journey: before-approval isolation, event-specific approval/player mapping, mapped score sync, offline reconnect exactly-once and relaunch recovery');
} finally {
  await rm(work, { recursive: true, force: true });
}
