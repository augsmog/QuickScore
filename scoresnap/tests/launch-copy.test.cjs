const {execFileSync} = require('node:child_process');
test('staged launch copy matches exact strings, order and copy rules', () => {
 expect(() => execFileSync(process.execPath, ['scripts/lint-launch-copy.cjs'], {stdio:'pipe'})).not.toThrow();
});

const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');
test('final listing and settlement omit superseded launch copy', () => {
 const fixture = require('./fixtures/launch-copy.json');
 for (const file of ['docs/APP_STORE_LISTING.md', 'app/contest/[id]/settlement.tsx']) {
  for (const string of fixture[file]) expect(read(file)).toContain(string);
  expect(read(file)).not.toMatch(/Money Games|Team Money|Net Winners|SESSION TOTAL|Enter every score|multi-day|Choose from 50\+ game modes —/);
 }
});
test('approved Pro-dormant listing and Terms copy match the generated Terms page', () => {
 const listing = 'Everything for your round is free — 50+ game modes, settle-up, stats and scorecard scanning are all included. Hosting a multi-round, multi-group tournament uses the Tournament Director plan.';
 const terms = 'The App is free to use, including the in-app games and scorecard scanning. The App offers a paid subscription ("SnapScore Tournament Director") that lets a host run multi-round, multi-group tournaments; players join and score for free.';
 expect(read('docs/APP_STORE_LISTING.md')).toContain(listing);
 expect(read('docs/APP_STORE_LISTING.md')).not.toContain('Free includes core games and 3 scans a month.');
 expect(read('docs/terms-of-service.md')).toContain(terms);
 const renderedTerms = read('site/terms/index.html');
 expect(renderedTerms).toContain(terms.replaceAll('"', '&quot;'));
 expect(renderedTerms).not.toContain('SnapScore Pro');
});
test('categories merge into Classic and Team without changing playable count', () => {
 const ts = require('typescript');
 const mod = {exports:{}};
 new Function('require','module','exports', ts.transpileModule(read('src/engine/types.ts'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(()=>({FREE_GAMES:[]}),mod,mod.exports);
 const { ALL_GAMES, PLAYABLE_GAME_COUNT } = mod.exports;
 expect(PLAYABLE_GAME_COUNT).toBeGreaterThanOrEqual(50);
 for (const id of ['skins', 'skins_carry', 'nassau', 'nassau_press']) {
  expect(ALL_GAMES.find(game => game.id === id).category).toBe('Classic');
 }
 expect(ALL_GAMES.find(game => game.id === 'vegas').category).toBe('Team');
 for (const file of ['src/engine/types.ts', '../GolfScorecardApp.jsx', 'docs/GAME_MODE_PRDs.md']) {
  expect(read(file)).not.toMatch(/Money Games|Team Money/);
 }
});
