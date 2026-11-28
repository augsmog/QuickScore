// AUG-1478: what was typed into New Contest survives backing out and coming back.
const React = require('react');
const { create, act } = require('react-test-renderer');
const loader = require('./helpers/load-ts.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation((...args) => { if (!String(args[0]).startsWith('react-test-renderer is deprecated')) throw Error(args.join(' ')); }); });
afterEach(() => jest.restoreAllMocks());
const { useDraftField, clearContestDraft, contestDraftHas } = loader({})('src/stores/contest-draft.ts');

function open() {
  let api;
  const Wizard = () => {
    const [players, setPlayers] = useDraftField('players', () => [{ name: 'Golfer' }, { name: '' }]);
    const [betUnit, setBetUnit] = useDraftField('betUnit', '5');
    api = { players, setPlayers, betUnit, setBetUnit };
    return null;
  };
  let root; act(() => { root = create(React.createElement(Wizard)); });
  return { get api() { return api; }, close: () => act(() => root.unmount()) };
}

test('back out mid-setup and reopen: the name typed is still there', () => {
  clearContestDraft();
  let screen = open();
  expect(screen.api.players[0].name).toBe('Golfer');
  act(() => screen.api.setPlayers(p => [{ ...p[0], name: 'Alex' }, p[1]]));
  act(() => screen.api.setBetUnit('10'));
  screen.close();
  screen = open();
  expect(screen.api.players[0].name).toBe('Alex');
  expect(screen.api.betUnit).toBe('10');
  screen.close();
});

test('after the round is created, or the account is wiped, the next one starts from the defaults', () => {
  let screen = open();
  expect(screen.api.players[0].name).toBe('Alex');
  screen.close();
  clearContestDraft();
  expect(contestDraftHas('players')).toBe(false);
  screen = open();
  expect(screen.api.players[0].name).toBe('Golfer');
  expect(screen.api.betUnit).toBe('5');
  screen.close();
});

test('the wizard keeps every setup field in the draft, clears it on create, and the account wipe clears it too', () => {
  const fs = require('fs');
  const wizard = fs.readFileSync('app/contest/new.tsx', 'utf8');
  for (const field of ['contestName', 'courseName', 'isTournament', 'numRounds', 'selectedCourse', 'selectedTeeBox', 'numGroups', 'players', 'hasTeams', 'teams', 'selectedGames', 'betUnit', 'gameConfig'])
    expect(wizard).toMatch(new RegExp(`useDraftField(<[^(]*>)?\\("${field}",`));
  expect(wizard.indexOf('clearContestDraft();')).toBeGreaterThan(wizard.indexOf('addContest(contest);'));
  expect(fs.readFileSync('src/stores/wipe-local-account.ts', 'utf8')).toContain('clearContestDraft();');
});
