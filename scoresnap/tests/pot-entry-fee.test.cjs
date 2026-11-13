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

const { validateVariationSetup } = load('src/engine/types.ts');
const validate = config => validateVariationSetup([], [], config, 0);

test.each([undefined, 0, 1, 5, 12.5, 100.99, 0.01, 999.99])('accepts pot entry fee %p', value => {
  expect(validate({ potEntryFee: value })).toBeUndefined();
});

test.each([-1, -0.01, NaN, Infinity, -Infinity, 12.555, 0.001, '5', '', null, true, {}, []])(
  'rejects invalid pot entry fee %p',
  value => {
    expect(validate({ potEntryFee: value })).toEqual(expect.any(String));
  },
);

test('reserved pot metadata cannot change existing contest settlement', () => {
  runNode(['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { calculateContestSettlement } = await import('./src/engine/contest-results.ts').then(m => m.default ?? m);
    const course = {name:'Pot',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
    const groups = ['one','two'].map((id,g) => ({id,players:[0,1].map(i=>({id:id+i,name:id+i,handicap:0,scores:Array(18).fill(3+g+i)}))}));
    for (const rulesVersion of [undefined, 1]) for (const game of ['stableford', 'skins', 'skins_carry', 'nassau', 'match_play']) {
      const contest = {course,groups,games:[game],betUnit:1,gameConfig:{rulesVersion}};
      const original = calculateContestSettlement(contest);
      for (const potEntryFee of [0, 5, 12.5]) assert.deepEqual(
        calculateContestSettlement({...contest,gameConfig:{...contest.gameConfig,potEntryFee}}), original);
    }
  `]);
});
