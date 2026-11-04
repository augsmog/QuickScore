const runNode = require('./helpers/run-node.cjs');

function check(source) {
  runNode(['--import', 'tsx', '--input-type=module', '-e', `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const deps = {
  './online-store': { useOnlineStore: { getState: () => ({ events: {} }) } },
  '../services/ocr-review': { completeScores: scores => [...scores] },
  '../config/auth': { REAL_AUTH_CONFIGURED: false },
  './auth-store': { useAuthStore: { getState: () => ({}) } },
  '../services/guest-join': { generateJoinCode: () => 'ABC234' },
  zustand: require('zustand'),
  'zustand/middleware': { persist: creator => creator, createJSONStorage: () => ({}) },
  '@react-native-async-storage/async-storage': {},
  './persisted-keys': { CONTEST_STORAGE_KEY: 'test', createGatedStorage: storage => storage },
  '../services/tournament-sync': { syncScore: async () => {}, syncRound: async () => {}, syncRoundGroups: async () => {}, syncContestTournamentMeta: async () => {} },
  '../engine/contest-validation': { validateScoreWrite: (contest, groupId, playerId, hole, strokes) => {
    if (contest.gameConfig?.rulesVersion !== 1) return;
    const round = contest.isTournament ? contest.rounds?.find(r => r.number === contest.currentRound) : undefined;
    const group = (round?.groups ?? contest.groups).find(g => g.id === groupId);
    if (!group?.players.some(p => p.id === playerId) || !Number.isInteger(hole) || hole < 1 || hole > 18 || !Number.isInteger(strokes) || strokes < 0 || strokes > 99) throw Error('Invalid score entry');
    if (contest.status === 'completed') throw Error('Completed scorecards are locked');
  } },
  '../engine/contest-results': { scopeKey: (roundId, groupId) => [roundId || 'default', groupId].join('/') },
  './scan-store': { useScanStore: { getState: () => ({ tier: 'pro' }) } },
};
const module = { exports: {} };
const sourceText = fs.readFileSync('src/stores/contest-store.ts', 'utf8');
const code = ts.transpileModule(sourceText, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
new Function('require', 'module', 'exports', code)(id => {
  if (!(id in deps)) throw Error('Unexpected dependency ' + id);
  return deps[id];
}, module, module.exports);
const store = module.exports.useContestStore;
const holes = Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 }));
const player = id => ({ id, name: id, accountId: 'account-' + id, userId: 'user-' + id, handicap: 3, scores: Array(18).fill(0) });
const fixture = () => {
  const six = Array.from({ length: 6 }, (_, i) => player('p' + i));
  six[0].scores[1] = 5;
  six[1].scores[1] = 3;
  return {
    id: 'contest-1', name: 'Tournament', status: 'active', createdAt: '', course: { name: 'Course', holes },
    betUnit: 1, hasTeams: false, games: [], isTournament: true, currentRound: 1,
    groups: [{ id: 'legacy-group', name: 'Legacy', players: [player('legacy')] }],
    rounds: [
      { id: 'round-1', number: 1, name: 'Round 1', course: { name: 'Course', holes }, groups: [{ id: 'group-1', name: 'Six', players: six }, { id: 'other-group', name: 'Other', players: [player('other')] }] },
      { id: 'round-2', number: 2, name: 'Round 2', course: { name: 'Course 2', holes }, groups: [{ id: 'round-2-group', name: 'Round 2 group', players: [player('later')] }] },
    ],
  };
};
function install(contest) { store.setState({ contests: [contest], activeContestId: 'another-active-contest' }); }
${source}
`]);
}

test('reviewed patch merges only explicit cells in a six-player current group, including hole 10, and is idempotent', () => check(`
  const contest = fixture();
  contest.rounds[0].course = { name: 'Back nine', holes: holes.slice(9) };
  install(contest);
  const before = structuredClone(contest);
  const action = store.getState().applyReviewedPartialImport;
  const patch = [{ playerId: 'p0', hole: 10, strokes: 6 }, { playerId: 'p1', hole: 10, strokes: 4 }];
  action('contest-1', 'round-1', 'group-1', patch);
  const after = store.getState();
  const updated = after.contests[0];
  assert.equal(updated.rounds[0].groups[0].players[0].scores[0], 6);
  assert.equal(updated.rounds[0].groups[0].players[1].scores[0], 4);
  assert.deepEqual(updated.rounds[0].groups[0].players[0].scores.slice(1), before.rounds[0].groups[0].players[0].scores.slice(1));
  assert.deepEqual(updated.rounds[0].groups[0].players.slice(2), before.rounds[0].groups[0].players.slice(2));
  assert.deepEqual(updated.rounds[0].groups[1], before.rounds[0].groups[1]);
  assert.deepEqual(updated.rounds[1], before.rounds[1]);
  assert.deepEqual(updated.groups, before.groups);
  assert.equal(updated.rounds[0].groups[0].players[0].accountId, 'account-p0');
  assert.equal(updated.rounds[0].groups[0].players[0].userId, 'user-p0');
  assert.equal(after.activeContestId, 'another-active-contest');
  const once = structuredClone(updated);
  action('contest-1', 'round-1', 'group-1', patch);
  assert.deepEqual(store.getState().contests[0], once);
`));

test('reviewed patch rejects stale round, unknown player, and conflicting existing score without partial writes', () => check(`
  const contest = fixture(); install(contest);
  const action = store.getState().applyReviewedPartialImport;
  const before = structuredClone(contest);
  assert.throws(() => action('contest-1', 'round-2', 'group-1', [{ playerId: 'p0', hole: 10, strokes: 6 }]), /no longer active/);
  assert.throws(() => action('contest-1', 'round-1', 'group-1', [{ playerId: 'missing', hole: 10, strokes: 6 }]), /outside the selected group or course/);
  assert.throws(() => action('contest-1', 'round-1', 'group-1', [
    { playerId: 'p0', hole: 10, strokes: 6 }, { playerId: 'p1', hole: 2, strokes: 7 },
  ]), /conflicts with an existing score/);
  assert.deepEqual(store.getState().contests[0], before);
`));

test('reviewed patch rejects malformed scores and course hole identities before any write, including legacy contests', () => check(`
  const action = store.getState().applyReviewedPartialImport;
  for (const strokes of [-1, 1.5, 100, NaN, Infinity, null, undefined, '4']) {
    const contest = fixture(); install(contest);
    const before = store.getState();
    assert.throws(() => action('contest-1', 'round-1', 'group-1', [
      { playerId: 'p0', hole: 10, strokes: 6 }, { playerId: 'p1', hole: 10, strokes },
    ]), /Invalid reviewed import cell/);
    assert.equal(store.getState(), before);
  }
  for (const numbers of [[...Array(9)].map((_, i) => i).concat(Array(9).fill(10)), [1, 2, 3, 4, 5, 6, 7, 8, 19], [1, 2, 3, 4, 5, 6, 7, 8, 8]]) {
    const contest = fixture(); contest.rounds[0].course = { name: 'Invalid', holes: numbers.map(num => ({ num, par: 4, hcp: 1 })) }; install(contest);
    const before = store.getState();
    assert.throws(() => action('contest-1', 'round-1', 'group-1', [{ playerId: 'p0', hole: 10, strokes: 4 }]), /Course hole mapping/);
    assert.equal(store.getState(), before);
  }
`));

test('existing full-card importScores still replaces the target player card as before', () => check(`
  const contest = fixture();
  contest.isTournament = false; delete contest.currentRound; delete contest.rounds;
  contest.groups = [{ id: 'group-1', name: 'Six', players: Array.from({ length: 6 }, (_, i) => player('p' + i)) }];
  install(contest);
  const imported = Array.from({ length: 18 }, (_, i) => i % 2 ? 5 : 4);
  store.getState().importScores('contest-1', 'group-1', [{ playerId: 'p0', scores: imported, source: 'ocr' }]);
  assert.deepEqual(store.getState().contests[0].groups[0].players[0].scores, imported);
  assert.deepEqual(store.getState().contests[0].groups[0].players[1].scores, Array(18).fill(0));
`));
