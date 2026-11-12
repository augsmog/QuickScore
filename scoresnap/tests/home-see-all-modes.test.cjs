const fs = require('fs');
require('tsx/cjs');
test('home See All opens the library instead of the first game', () => {
 const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
 expect(home).not.toMatch(/setSelectedGame\(ALL_GAMES\[0\]\)/);
 expect(home).toContain('setShowGameLibrary(true)');
 expect(home).toContain('home-see-all-modes');
});
test('library contains every playable capability exactly once', () => {
 const types = require('../src/engine/types.ts');
 const { GAME_MODE_LIBRARY } = require('../src/engine/game-mode-library.ts');
 const ids = GAME_MODE_LIBRARY.map(mode => mode.id);
 for (const mode of GAME_MODE_LIBRARY) {
  expect(mode.name).toEqual(expect.any(String));
  expect(mode.desc).toEqual(expect.any(String));
  if (types.PLAYABLE_BASE_GAME_IDS.includes(mode.id)) expect(mode.game.id).toBe(mode.id);
 }
 expect(ids).toHaveLength(types.PLAYABLE_GAME_COUNT);
 expect(new Set(ids).size).toBe(types.PLAYABLE_GAME_COUNT);
 expect(ids.sort()).toEqual([...types.PLAYABLE_BASE_GAME_IDS, ...types.PLAYABLE_OPTION_IDS, ...types.PLAYABLE_FORMAT_IDS].sort());
});
