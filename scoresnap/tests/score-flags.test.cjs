// A flagged score change in the app: who decides, what each person reads, and which holes carry a badge.
const loader = require('./helpers/load-ts.cjs');
const { flagRole, flagLine, localFlags, flaggedOnHole, flaggedHoles } = loader({})('src/services/score-flags.ts');

const flag = (over = {}) => ({ id: 'f1', round_id: 'sr1', group_id: 'sg1', player_id: 'sp1', player_name: 'Matt', hole: 4, current_strokes: 4, proposed_strokes: 6, mine: false, can_resolve: false, created_at: '', ...over });

test('who can decide: the group scorekeeper or the organizer; the asker waits; everyone else just sees it', () => {
  expect(flagRole(flag({ can_resolve: true }))).toBe('decide');
  expect(flagRole(flag({ can_resolve: true, mine: true }))).toBe('decide'); // only the organizer can be both
  expect(flagRole(flag({ mine: true }))).toBe('asked');
  expect(flagRole(flag())).toBe('waiting');
});

test('every line says which score counts now', () => {
  expect(flagLine(flag({ can_resolve: true }))).toBe('Matt, hole 4: 4 was entered, 6 was asked for. 4 counts until you decide.');
  expect(flagLine(flag({ mine: true }))).toBe('Matt, hole 4: you asked to change 4 to 6. 4 counts until the group scorekeeper decides.');
  expect(flagLine(flag())).toBe('Matt, hole 4: a change from 4 to 6 is waiting. 4 counts for now.');
  expect(flagLine(flag({ current_strokes: null, proposed_strokes: 5 }))).toBe('Matt, hole 4: a change from no score to 5 is waiting. No score counts for now.');
});

test('server ids become this phone\'s ids, so the badge lands on the right player', () => {
  const map = [{ kind: 'player', local_id: 'lp1', server_id: 'sp1' }, { kind: 'round', local_id: 'lr1', server_id: 'sr1' }];
  const [mapped] = localFlags([flag()], map);
  expect([mapped.player_id, mapped.round_id]).toEqual(['lp1', 'lr1']);
  // A joined player's phone already uses the server's ids.
  expect(localFlags([flag()], [])[0].player_id).toBe('sp1');
  expect(localFlags([flag()], undefined)[0].player_id).toBe('sp1');
});

test('badge: only the flagged player on the flagged hole, in the round on screen', () => {
  const flags = [flag({ player_id: 'p1', round_id: 'r1' }), flag({ id: 'f2', player_id: 'p2', hole: 7, round_id: 'r2' })];
  expect([...flaggedOnHole(flags, 4)]).toEqual(['p1']);
  expect([...flaggedOnHole(flags, 5)]).toEqual([]);
  expect([...flaggedOnHole(flags, 7, 'r1')]).toEqual([]);
  expect([...flaggedOnHole(flags, 7, 'r2')]).toEqual(['p2']);
  expect(flaggedHoles(flags)).toEqual([4, 7]);
  expect(flaggedHoles(flags, 'r1')).toEqual([4]);
});
