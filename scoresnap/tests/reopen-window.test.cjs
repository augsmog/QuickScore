// One hour to reopen a finalized round, on the server's clock.
const loader = require('./helpers/load-ts.cjs');
const { reopenState, reopenLine, reopenEnds, minutesLeft, fixTarget } = loader({})('src/services/reopen-window.ts');
const finalizedAt = '2026-11-28T12:00:00.000Z';
const at = minutes => Date.parse(finalizedAt) + minutes * 60000;

test('59 minutes after finalizing a scorer can still reopen; at 60 and 61 the round is locked', () => {
  expect(reopenState({ finalizedAt }, at(0))).toBe('final');
  expect(reopenState({ finalizedAt }, at(59))).toBe('final');
  expect(reopenState({ finalizedAt }, at(60))).toBe('locked');
  expect(reopenState({ finalizedAt }, at(61))).toBe('locked');
});

test('a reopened card is open at 59 minutes and locked at 61, whenever it was reopened', () => {
  const reopenedUntil = '2026-11-28T13:00:00.000Z';
  expect(reopenState({ finalizedAt, reopenedUntil }, at(59))).toBe('reopened');
  expect(reopenState({ finalizedAt, reopenedUntil }, at(61))).toBe('locked');
});

test('the server said no: locked, whatever the phone thinks the time is', () => {
  expect(reopenState({ finalizedAt, closed: true }, at(5))).toBe('locked');
  expect(reopenState({ closed: true }, at(5))).toBe('locked');
});

test('finalize time not known: Reopen is offered and the server decides', () => {
  expect(reopenState({}, at(500))).toBe('final');
  expect(reopenEnds({})).toBeNull();
  expect(reopenLine({}, at(500))).toBe('Round final. You can reopen your card to fix a mistake.');
});

test('each state reads plainly and counts down in whole minutes', () => {
  expect(minutesLeft(at(60), at(59.5))).toBe(1);
  expect(reopenLine({ finalizedAt }, at(18))).toBe('Round final. You can reopen your card to fix a mistake. 42 min left.');
  expect(reopenLine({ finalizedAt, reopenedUntil: '2026-11-28T13:00:00.000Z' }, at(50))).toBe('Reopened to fix a score. 10 min left. Everyone else still sees the round as final.');
  expect(reopenLine({ finalizedAt }, at(61))).toBe('Round final. Scores are locked.');
});

test('a fix is aimed at the server\'s cell and its current version', () => {
  const snapshot = { contest_id: 'c1', id_map: [{ kind: 'player', local_id: 'lp1', server_id: 'sp1' }],
    rounds: [{ id: 'r1', number: 1, players: [{ id: 'sp1', cells: [{ hole: 3, version: 2, strokes: 5 }] }] }, { id: 'r2', number: 2, players: [{ id: 'sp1', cells: [{ hole: 3, version: 7, strokes: 4 }] }] }] };
  expect(fixTarget(snapshot, 1, 'lp1', 3)).toEqual({ contest_id: 'c1', round_id: 'r1', player_id: 'sp1', hole: 3, version: 2 });
  expect(fixTarget(snapshot, 2, 'lp1', 3).version).toBe(7);
  expect(fixTarget(snapshot, 1, 'someone-else', 3)).toBeNull();
  expect(fixTarget(snapshot, 1, 'lp1', 9)).toBeNull();
});
