const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const run = body => void execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
import assert from 'node:assert/strict';
const plan = await import('./src/services/tournament-sync-plan.ts');
const {
  emptyOutbox, enqueueScore, rememberBundle, replayOutbox, resolveWrite, roundPayload, cellKey,
} = plan.default ?? plan;
${body}`], { encoding: 'utf8' });

const source = fs.readFileSync('src/services/tournament-sync.ts', 'utf8');

test('tournament sync does not name the tables 008 used to assume', () => {
  for (const word of ['hole_scores', 'contest_groups', '.from(', '.delete(', '.upsert(', '.insert(']) {
    expect(source.includes(word)).toBe(false);
  }
  expect(source.includes('sync_round_bundle')).toBe(true);
  expect(source.includes('write_score')).toBe(true);
  expect(source.includes('set_tournament_meta')).toBe(true);
});

test('round payload keeps players and does not describe a delete', () => run(`
const payload = roundPayload({
  id: 'round-local', number: 2, name: 'Round 2', date: '2026-10-27',
  course: { name: 'Pines' },
  groups: [{ id: 'group-local', name: 'Group 1', teeTime: '10:03', players: [
    { id: 'ada', name: 'Ada', handicap: 5, status: 'active' },
    { id: 'bea', name: 'Bea', handicap: 8 },
  ]}],
});
assert.equal(payload.local_id, 'round-local');
assert.equal(payload.number, 2);
assert.equal(payload.groups[0].players.length, 2);
assert.equal(payload.groups[0].players[0].host, undefined);
assert.equal(JSON.stringify(payload).includes('hole_scores'), false);
assert.equal(JSON.stringify(payload).includes('delete'), false);
const hosted = roundPayload({
  id: 'round-local', number: 1, name: 'Round 1',
  groups: [{ id: 'group-local', name: 'Group 1', players: [
    { id: 'ada', name: 'Ada', handicap: 5, host: true },
    { id: 'bea', name: 'Bea', handicap: 8 },
  ]}],
});
assert.equal(hosted.groups[0].players[0].host, true);
assert.equal(hosted.groups[0].players[1].host, undefined);
assert.equal(JSON.stringify(hosted).includes('user_id'), false);
`));

test('two clients round-trip and an offline queue replays the same op', () => run(`
const server = { cells: new Map(), receipts: new Map(), events: 0 };
function send(actor, _op, args) {
  const receipt = actor + ':' + args.op_id;
  if (server.receipts.has(receipt)) return server.receipts.get(receipt);
  const cell = [args.contest_id, args.round_id, args.player_id, args.hole].join('|');
  const version = server.cells.get(cell) ?? 0;
  if (version !== args.expected_version) return { status: 'conflict', version };
  const result = { status: 'accepted', version: version + 1 };
  server.cells.set(cell, result.version);
  server.receipts.set(receipt, result);
  server.events += 1;
  return result;
}
let a = rememberBundle(emptyOutbox(), 'round-local', { round_id: 'round-server', groups: [{ players: [{ local_id: 'ada', id: 'player-server' }] }] });
let b = rememberBundle(emptyOutbox(), 'round-local', { round_id: 'round-server', groups: [{ players: [{ local_id: 'ada', id: 'player-server' }] }] });
a = enqueueScore(a, { contestId: 'contest', roundLocalId: 'round-local', roundNumber: 1, playerLocalId: 'ada', hole: 1, strokes: 4 }, 'op-a');
b = enqueueScore(b, { contestId: 'contest', roundLocalId: 'round-local', roundNumber: 1, playerLocalId: 'ada', hole: 1, strokes: 5 }, 'op-b');
const first = replayOutbox(a, (op, args) => send('A', op, args));
assert.equal(first.sent, 1);
assert.equal(first.outbox.ops.length, 0);
const second = replayOutbox(b, (op, args) => send('B', op, args));
assert.equal(second.sent, 0);
assert.equal(second.outbox.conflicts.length, 1);
assert.equal(server.events, 1);
const calls = [];
let offline = emptyOutbox();
offline = rememberBundle(offline, 'round-local', { round_id: 'round-server', groups: [{ players: [{ local_id: 'ada', id: 'player-server' }] }] });
offline = enqueueScore(offline, { contestId: 'contest', roundLocalId: 'round-local', roundNumber: 2, playerLocalId: 'ada', hole: 2, strokes: 3 }, 'op-q1');
offline = enqueueScore(offline, { contestId: 'contest', roundLocalId: 'round-local', roundNumber: 2, playerLocalId: 'ada', hole: 2, strokes: 4 }, 'op-q2');
let queued = replayOutbox(offline, (op, args) => { calls.push(args.op_id); return { status: 'offline' }; });
assert.equal(queued.sent, 0);
assert.deepEqual(queued.outbox.ops.map(op => op.opId), ['op-q1', 'op-q2']);
queued = replayOutbox(queued.outbox, (op, args) => { calls.push(args.op_id); return { status: 'accepted', version: args.expected_version + 1 }; });
assert.equal(queued.sent, 2);
assert.equal(queued.outbox.ops.length, 0);
assert.deepEqual(calls, ['op-q1', 'op-q1', 'op-q2']);
const waiting = enqueueScore(emptyOutbox(), { contestId: 'contest', roundLocalId: 'round-local', roundNumber: 2, playerLocalId: 'ada', hole: 3, strokes: 4 }, 'op-wait');
const held = replayOutbox(waiting, () => { throw new Error('sent before the round id existed'); });
assert.equal(held.sent, 0);
assert.equal(resolveWrite(held.outbox.ids, held.outbox.ops[0]), null);
const ready = replayOutbox(rememberBundle(held.outbox, 'round-local', { round_id: 'round-server', groups: [{ players: [{ local_id: 'ada', id: 'player-server' }] }] }), () => ({ status: 'accepted' }));
assert.equal(ready.sent, 1);
assert.equal(cellKey(waiting.ops[0]).includes('ada'), true);
`));
