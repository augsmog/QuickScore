// AUG-1368: the New Contest wizard crashed (SCORESNAP-S, fatal
// `Error: Your plan does not include this hosting configuration`) when a non-TD user
// turned on Multi-Day Tournament, because createContest saved straight through the store
// validator with no entitlement pre-check. The wizard now calls canHostTournament() first
// and routes unentitled hosts to /paywall?tier=td. These tests pin, against the REAL
// engine, that (1) the crash throw is real for a free host on both axes (rounds AND
// groups), and (2) canHostTournament is an exact pre-check for that throw — so the wizard
// gate and the store boundary can never disagree.
const loadTS = require('./helpers/load-ts.cjs');
const load = loadTS();
const {canHostTournament} = load('src/services/entitlements.ts');
const {validateHostContest} = load('src/engine/contest-validation.ts');

const course = {name: 'C', holes: Array.from({length: 18}, (_, i) => ({num: i + 1, par: 4, hcp: i + 1, yards: 100}))};
const mkGroup = (id, names) => ({id, name: id, players: names.map(n => ({id: 'p-' + n, name: n, handicap: 0, team: null, scores: new Array(18).fill(0)}))});
const g1 = mkGroup('g1', ['Augie', 'Lee']);
// gameConfig without rulesVersion:1 isolates the entitlement throw from variation checks.
const base = {id: 'c1', name: 'T', createdAt: '', course, status: 'active', games: ['stroke_play'], gameConfig: {}, betUnit: 1, hasTeams: false, groups: [g1]};
const round = (n) => ({id: `r${n}`, number: n, name: `Round ${n}`, course, groups: [g1]});
const multiRound = {...base, isTournament: true, currentRound: 1, rounds: [round(1), round(2)]};
const multiGroup = {...base, groups: [g1, mkGroup('g2', ['Kai', 'Ty'])]};
const HOSTING = /Your plan does not include this hosting configuration/;

test('free host is not entitled to multi-day rounds or multiple groups; TD is', () => {
  expect(canHostTournament(multiRound, 'free')).toBe(false);
  expect(canHostTournament(multiRound, 'pro')).toBe(false); // Pro-dormant is still not a TD host
  expect(canHostTournament(multiRound, 'td')).toBe(true);
  expect(canHostTournament(multiGroup, 'free')).toBe(false);
  expect(canHostTournament(multiGroup, 'td')).toBe(true);
});

test('a single-round, single-group free contest is allowed', () => {
  expect(canHostTournament(base, 'free')).toBe(true);
  expect(() => validateHostContest(base, 'free')).not.toThrow();
});

test('the store validator throws the exact Sentry crash for an ungated free tournament host', () => {
  expect(() => validateHostContest(multiRound, 'free')).toThrow(HOSTING);
  expect(() => validateHostContest(multiGroup, 'free')).toThrow(HOSTING);
});

test('a TD host passes the store validator for multi-day rounds', () => {
  expect(() => validateHostContest(multiRound, 'td')).not.toThrow();
  expect(() => validateHostContest(multiGroup, 'td')).not.toThrow();
});
