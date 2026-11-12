const fs = require('node:fs');
const ts = require('typescript');
const runNode = require('./helpers/run-node.cjs');

function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    // Entitlement presentation is unrelated to config validation.
    if (name === '../services/entitlements') return { FREE_GAMES: [] };
    throw new Error(`Unexpected runtime import: ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}

const expected = {
  stroke_play: 'event', match_play: 'group', stableford: 'event', mod_stableford: 'event',
  skins: 'event', skins_carry: 'event', nassau: 'group', nassau_press: 'group',
  wolf: 'group', banker: 'event', hammer: 'group', snake: 'group',
  bingo_bango_bongo: 'group', dots: 'event', rabbit: 'event', defender: 'event',
  nines: 'event', vegas: 'event', sixes: 'event', closeout: 'event', quota: 'event',
  chicago: 'event', greenies: 'group', aces_deuces: 'event', best_ball: 'event',
  scramble: 'event', shamble: 'event', alternate_shot: 'group', chapman: 'group', fourball: 'event',
};
const { validateVariationSetup, configForGame } = load('src/engine/types.ts');
const validate = config => validateVariationSetup([], [], config, 0);
// Load inside each resolver test so missing implementation does not mask validator red proof.
const resolve = (...args) => load('src/engine/game-scope.ts').resolveGameScope(...args);

test('the scope table covers every declared GameType, including future additions', () => {
  const source = ts.createSourceFile('types.ts', fs.readFileSync('src/engine/types.ts', 'utf8'), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(s => ts.isTypeAliasDeclaration(s) && s.name.text === 'GameType');
  expect(ts.isUnionTypeNode(declaration.type)).toBe(true);
  const games = declaration.type.types.map(t => t.literal.text);
  expect(Object.keys(expected).sort()).toEqual(games.sort());
});

test.each(Object.entries(expected))('%s defaults to current %s scope', (game, scope) => {
  expect(resolve(game)).toBe(scope);
  expect(resolve(game, {})).toBe(scope);
  expect(resolve(game, { rulesVersion: 1 })).toBe(scope);
});

test.each(['skins', 'skins_carry'])('%s follows only the legacy skinsScope setting', game => {
  expect(resolve(game, { skinsScope: 'field' })).toBe('event');
  expect(resolve(game, { skinsScope: 'group' })).toBe('group');
  expect(resolve(game, { skinsScope: 'group', gameScopes: { [game]: 'event' } })).toBe('group');
});

test.each(Object.entries(expected))('%s ignores reserved gameScopes metadata', (game, scope) => {
  const config = Object.freeze({ gameScopes: Object.freeze({ [game]: scope === 'event' ? 'group' : 'event' }) });
  expect(resolve(game, config)).toBe(scope);
  expect(configForGame(config, game).gameScopes).toBeUndefined();
});

test('absent, empty, and all valid partial scope maps are accepted', () => {
  expect(validate({})).toBeUndefined();
  expect(validate({ gameScopes: undefined })).toBeUndefined();
  expect(validate({ gameScopes: {} })).toBeUndefined();
  expect(validate({ gameScopes: expected })).toBeUndefined();
  for (const game of Object.keys(expected)) for (const scope of ['event', 'group']) {
    expect(validate({ gameScopes: { [game]: scope } })).toBeUndefined();
  }
});

test.each(['field', 'GROUP', '', null, undefined, false, 1, {}, []])('rejects invalid scope value %p', value => {
  expect(validate({ gameScopes: { stableford: value } })).toEqual(expect.any(String));
});

test.each([null, false, 1, 'event', [], ['event']])('rejects malformed scope map %p', gameScopes => {
  expect(validate({ gameScopes })).toEqual(expect.any(String));
});

test('rejects unknown game keys and checks every entry', () => {
  expect(validate({ gameScopes: { unknown_game: 'event' } })).toEqual(expect.any(String));
  expect(validate({ gameScopes: { skins: 'event', stableford: 'field' } })).toEqual(expect.any(String));
  expect(validate({ gameScopes: JSON.parse('{"__proto__":"group"}') })).toEqual(expect.any(String));
});

test('reserved metadata cannot change existing contest settlement', () => {
  runNode(['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { calculateContestSettlement } = await import('./src/engine/contest-results.ts').then(m => m.default ?? m);
    const course = {name:'Scope',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
    const groups = ['one','two'].map((id,g) => ({id,players:[0,1].map(i=>({id:id+i,name:id+i,handicap:0,scores:Array(18).fill(3+g+i)}))}));
    for (const rulesVersion of [undefined, 1]) for (const game of ['stableford', 'skins', 'skins_carry', 'nassau', 'match_play']) {
      const contest = {course,groups,games:[game],betUnit:1,gameConfig:{rulesVersion}};
      const original = calculateContestSettlement(contest);
      for (const scope of ['event', 'group']) assert.deepEqual(
        calculateContestSettlement({...contest,gameConfig:{...contest.gameConfig,gameScopes:{[game]:scope}}}), original);
    }
  `]);
});
