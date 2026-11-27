// The Android layout gate could not prove two findings (A2, A3) because blank player rows had no
// identity. Per-player controls take their test id from the player's name
// ("remove-player-<name>"); three blank rows all rendered "remove-player-", and the native tree
// reported one of them only by an ordinal ("n17"). A reveal proof needs to find the SAME control
// before and after a scroll, so on Android a blank row's controls are now numbered by position.
// Named rows keep their name-built ids on Android and web, and the iPhone rule is unchanged
// (player one by name, every later player by position).
const fs = require('node:fs');
const ts = require('typescript');

const m = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/tournament-setup-layout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
const { playerControlTestId } = m.exports;
const id = (kind, platformOS, index, name, teamId) => playerControlTestId(kind, { platformOS, index, name, teamId });
const screen = fs.readFileSync('app/contest/new.tsx', 'utf8');

test('Android: a blank row is numbered by position, so three blank rows have three different ids', () => {
  expect([1, 2, 3].map((index) => id('remove', 'android', index, ''))).toEqual(['wizard-remove-player-2', 'wizard-remove-player-3', 'wizard-remove-player-4']);
  expect(id('handicap', 'android', 2, '')).toBe('wizard-player-handicap-3');
  expect(id('group', 'android', 2, '')).toBe('wizard-player-group-3');
  expect(id('team', 'android', 2, '', 'B')).toBe('wizard-player-team-3-B');
  // Player one too, and a name of spaces only is blank.
  expect(id('remove', 'android', 0, '')).toBe('wizard-remove-player-1');
  expect(id('handicap', 'android', 1, '   ')).toBe('wizard-player-handicap-2');
});

test('Android and web: a named row keeps its name-built ids', () => {
  for (const os of ['android', 'web']) {
    expect(id('remove', os, 1, 'Sam')).toBe('remove-player-Sam');
    expect(id('handicap', os, 1, 'Sam')).toBe('player-handicap-Sam');
    expect(id('group', os, 3, 'Journey Guest')).toBe('player-group-Journey Guest');
    expect(id('team', os, 1, 'Sam', 'A')).toBe('player-team-Sam-A');
  }
  // Web is not changed for blank rows either: its tests address rows by name only.
  expect(id('remove', 'web', 1, '')).toBe('remove-player-');
});

test('iPhone is unchanged: player one by name, every later player by position, blank or not', () => {
  expect(id('remove', 'ios', 0, 'Ava')).toBe('remove-player-Ava');
  expect(id('handicap', 'ios', 0, 'Ava')).toBe('player-handicap-Ava');
  expect(id('group', 'ios', 0, '')).toBe('player-group-');
  expect(id('remove', 'ios', 1, 'Ben')).toBe('wizard-remove-player-2');
  expect(id('handicap', 'ios', 3, '')).toBe('wizard-player-handicap-4');
  expect(id('group', 'ios', 1, 'Journey Guest')).toBe('wizard-player-group-2');
  expect(id('team', 'ios', 2, 'Cy', 'A')).toBe('wizard-player-team-3-A');
});

test('the position-built ids are the ones the layout gate already knows as controls', () => {
  const known = /^wizard-(?:remove-player-\d+|player-(?:handicap|group)-\d+|player-team-\d+-[A-Z])$/;
  expect(fs.readFileSync('e2e/device-layout/scripts/bundle-from-maestro.mjs', 'utf8')).toContain('remove-player-\\d+|player-(?:handicap|group)-\\d+|player-team-\\d+-[A-Z]');
  for (const kind of ['remove', 'handicap', 'group']) expect(id(kind, 'android', 1, '')).toMatch(known);
  expect(id('team', 'android', 1, '', 'A')).toMatch(known);
});

test('a team id is required for a team chip, and an unknown kind is refused', () => {
  expect(() => id('team', 'android', 1, '')).toThrow(/team/);
  expect(() => id('nickname', 'android', 1, '')).toThrow(/kind/);
});

test('the screen takes all four per-player ids from the one helper', () => {
  for (const call of [
    'testID={playerControlTestId("remove", { platformOS: Platform.OS, index: idx, name: player.name })}',
    'testID={playerControlTestId("handicap", { platformOS: Platform.OS, index: idx, name: player.name })}',
    'testID={playerControlTestId("group", { platformOS: Platform.OS, index: idx, name: player.name })}',
    'testID={playerControlTestId("team", { platformOS: Platform.OS, index: idx, name: player.name, teamId: t.id })}',
  ]) expect(screen.split(call).length - 1).toBe(1);
  // No hand-built per-player id is left behind.
  expect(screen).not.toMatch(/`(?:remove-player|player-handicap|player-group|player-team)-\$\{/);
  expect(screen).not.toMatch(/`wizard-(?:remove-player|player-handicap|player-group|player-team)-\$\{/);
});
