const { execFileSync } = require('node:child_process');

for (const mode of ['net', 'gross', 'default']) {
  test(`Games calculator and Settlement agree: ${mode}`, () => {
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const { calcSkins, skinsModeLabel } = await import('./src/engine/calculators/skins.ts').then(m => m.default ?? m);
      const { calculateSettlement } = await import('./src/engine/settlement.ts').then(m => m.default ?? m);
      const course = { name: 'Test', holes: Array.from({length:18}, (_,i)=>({num:i+1,par:4,hcp:i+1})) };
      const players = [
        {id:'a',name:'A',handicap:0,scores:Array(18).fill(4)},
        {id:'b',name:'B',handicap:36,scores:Array(18).fill(5)},
        {id:'c',name:'C',handicap:0,scores:Array(18).fill(6)},
        {id:'d',name:'D',handicap:0,scores:Array(18).fill(7)},
      ];
      const mode = '${mode}';
      const config = mode === 'default' ? undefined : {skinsMode:mode};
      const winner = mode === 'gross' ? 'A' : 'B';
      assert.equal(skinsModeLabel(config), mode === 'gross' ? 'Gross skins' : 'Net skins');
      for (const game of ['skins','skins_carry']) {
        const games = calcSkins(players, course, game === 'skins_carry', config?.skinsMode);
        assert.equal(games.totals[winner],18);
        assert.ok(games.skins.every(s=>s.winner===winner));
        const settlement = calculateSettlement(players,course,[game],4,undefined,config);
        for (const player of players) {
          assert.equal(settlement.netByPlayer[player.name], (games.totals[player.name]-4.5)*4);
        }
        assert.equal(Object.values(settlement.netByPlayer).reduce((a,b)=>a+b,0),0);
      }
      assert.ok(Object.values(calcSkins(players.map(p=>({...p,scores:Array(18).fill(0)})),course).totals).every(n=>n===0));
      // Missing mode on an existing config also defaults to net.
      assert.deepEqual(calcSkins(players,course),calcSkins(players,course,false,{}.skinsMode));
    `], { stdio: 'pipe' });
  });
}

test('multiple skins winners receive only their calculated winnings', () => {
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { calcSkins } = await import('./src/engine/calculators/skins.ts').then(m => m.default ?? m);
    const { calculateSettlement } = await import('./src/engine/settlement.ts').then(m => m.default ?? m);
    const course = {name:'Test',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
    const players = ['A','B','C','D'].map((name,i)=>({id:name,name,handicap:0,scores:Array.from({length:18},(_,h)=>(i===0&&h<10)||(i===1&&h>=10)?3:5)}));
    for (const skinsMode of ['net','gross']) {
      const games = calcSkins(players,course,false,skinsMode);
      const settlement = calculateSettlement(players,course,['skins'],4,undefined,{skinsMode});
      for (const p of players) assert.equal(settlement.netByPlayer[p.name],(games.totals[p.name]-4.5)*4);
    }
  `], {stdio:'pipe'});
});
