const runNode = require('./helpers/run-node.cjs');

test('Stroke Play basis is explicit, persisted, and version-gated', () => {
  runNode(['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    const { calculateSettlement } = await import('./src/engine/settlement.ts').then(m => m.default ?? m);
    const { configForGame, validateVariationSetup } = await import('./src/engine/types.ts').then(m => m.default ?? m);
    const course = {name:'Stroke basis',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
    const players = [
      {id:'a',name:'A',handicap:0,scores:Array(18).fill(4)},
      {id:'b',name:'B',handicap:0,scores:[6,...Array(17).fill(4)]},
      {id:'c',name:'C',handicap:0,scores:[8,...Array(17).fill(4)]},
    ];
    const config = {rulesVersion:1,strokePlayBasis:'per_stroke'};
    const persisted = JSON.parse(JSON.stringify(config));
    assert.equal(configForGame(persisted,'stroke_play').strokePlayBasis,'per_stroke');
    assert.equal(configForGame(persisted,'skins').strokePlayBasis,undefined);
    assert.match(validateVariationSetup([{players}],['stroke_play'],config,0.5) ?? '',/^$/);
    assert.match(validateVariationSetup([{players}],['stroke_play'],{rulesVersion:1,strokePlayBasis:'bogus'},0.5),/supported Stroke Play amount basis/);

    const ui = fs.readFileSync('./app/contest/new.tsx','utf8');
    assert.ok(ui.includes('cleanConfig.strokePlayBasis = gameConfig.strokePlayBasis ?? "total"'));
    assert.ok(ui.includes('Stroke Play amount'));
    assert.ok(ui.includes('Per stroke'));
    assert.ok(ui.includes('Total amount'));

    const perStroke = calculateSettlement(players,course,['stroke_play'],0.5,undefined,config);
    assert.deepEqual(perStroke.netByPlayer,{A:3,B:-1,C:-2});
    const total = calculateSettlement(players,course,['stroke_play'],0.5,undefined,
      {rulesVersion:1,strokePlayBasis:'total'});
    assert.deepEqual(total.netByPlayer,{A:1,B:-0.5,C:-0.5});
    const missing = calculateSettlement(players,course,['stroke_play'],0.5);
    assert.deepEqual(missing.netByPlayer,{A:1,B:-0.5,C:-0.5});
    const legacy = calculateSettlement(players,course,['stroke_play'],0.5,undefined,
      {strokePlayBasis:'per_stroke'});
    assert.deepEqual(legacy.netByPlayer,{A:1,B:-0.5,C:-0.5});

    const tiedPlayers = players.slice(0,2).map(p => ({...p,scores:Array(18).fill(4)}));
    const tied = calculateSettlement(tiedPlayers,course,['stroke_play'],0.5,undefined,config);
    assert.deepEqual(tied.netByPlayer,{A:0,B:0});
    const legacyTied = calculateSettlement(tiedPlayers,course,['stroke_play'],0.5);
    assert.deepEqual(legacyTied.netByPlayer,{A:0.5,B:-0.5});
  `]);
});
