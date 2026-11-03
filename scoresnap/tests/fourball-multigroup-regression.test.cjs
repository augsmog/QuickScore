const runNode = require('./helpers/run-node.cjs');

test('Four-Ball settles every independent two-pair group without cross-group play', () => {
  runNode(['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { calculateContestSettlement } = await import('./src/engine/contest-results.ts').then(m => m.default ?? m);
    const { calculateSettlement } = await import('./src/engine/settlement.ts').then(m => m.default ?? m);
    const course = { name: 'Four-Ball groups', holes: Array.from({length: 18}, (_, i) => ({num:i+1, par:4, hcp:i+1})) };
    const group = (id, names, scores) => ({ id, name:id, players:names.map((name,i) => ({
      id:name, name, team:i < 2 ? 'A' : 'B', handicap:0, scores:Array(18).fill(scores[i]),
    })) });
    const groups = [
      group('front', ['A','B','C','D'], [3,4,5,5]),
      group('back', ['E','F','G','H'], [5,5,3,4]),
    ];
    const contest = {
      course, games:['fourball'], betUnit:1, gameConfig:{rulesVersion:1,inputRulesVersion:1},
      groups, auxiliaryByScope:{},
    };
    const expected = {A:1,B:1,C:-1,D:-1,E:-1,F:-1,G:1,H:1};
    const result = calculateContestSettlement(contest);
    assert.equal(result.pending, undefined);
    assert.deepEqual(result.netByPlayer, expected);
    assert.equal(result.transactions.length, 4);
    assert.equal(result.transactions.reduce((sum, t) => sum + t.amount, 0), 4);
    for (const t of result.transactions) {
      assert.ok((['A','B','C','D'].includes(t.from) && ['A','B','C','D'].includes(t.to)) ||
                (['E','F','G','H'].includes(t.from) && ['E','F','G','H'].includes(t.to)));
    }
    assert.equal(Object.values(result.netByPlayer).reduce((sum,n) => sum+n,0), 0);

    // Deliberately interleave the flat player array: the cent-consolidation
    // stage must retain the original group boundaries too.
    const interleaved = [groups[0].players[0],groups[1].players[0],groups[0].players[1],groups[1].players[1],
      groups[0].players[2],groups[1].players[2],groups[0].players[3],groups[1].players[3]];
    const direct = calculateSettlement(interleaved,course,['fourball'],1,undefined,contest.gameConfig,groups);
    assert.deepEqual(direct.netByPlayer,expected);
    for (const t of direct.transactions) {
      assert.ok((['A','B','C','D'].includes(t.from) && ['A','B','C','D'].includes(t.to)) ||
                (['E','F','G','H'].includes(t.from) && ['E','F','G','H'].includes(t.to)));
    }
  `]);
});

test('Four-Ball round robin uses the selected pair score and splits each stake equally', () => {
  runNode(['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { calculateSettlement } = await import('./src/engine/settlement.ts').then(m => m.default ?? m);
    const { configForGame, validateVariationSetup } = await import('./src/engine/types.ts').then(m => m.default ?? m);
    const fs = await import('node:fs');
    const course = { name: 'Round robin', holes: Array.from({length: 18}, (_, i) => ({num:i+1, par:4, hcp:i+1})) };
    const scores = { A1:3, A2:8, B1:5, B2:5, C1:6, C2:6 };
    const players = Object.entries(scores).map(([name,score], i) => ({
      id:name, name, team:name[0], handicap:0, scores:Array(18).fill(score),
    }));
    const groups = [{id:'six',name:'Six',players}];
    const selected = {rulesVersion:1,fourBallFormat:'round_robin',fourBallScoring:'total'};
    const createdConfig = {rulesVersion:1,inputRulesVersion:1,fourBallScoring:selected.fourBallScoring,
      fourBallFormat:selected.fourBallFormat};
    const persistedConfig = JSON.parse(JSON.stringify(createdConfig));
    assert.deepEqual(configForGame(persistedConfig,'fourball'),createdConfig);
    const unrelated = configForGame(persistedConfig,'stroke_play');
    assert.equal(unrelated.fourBallFormat,undefined);
    assert.equal(unrelated.fourBallScoring,undefined);
    const createScreen = fs.readFileSync('./app/contest/new.tsx','utf8');
    assert.match(createScreen,/cleanConfig\.fourBallScoring = gameConfig\.fourBallScoring/);
    assert.match(createScreen,/cleanConfig\.fourBallFormat = gameConfig\.fourBallFormat/);

    assert.match(validateVariationSetup(groups,['fourball'],{rulesVersion:1,fourBallFormat:'round_robin'},1.01),/even number of cents/);
    assert.match(validateVariationSetup(groups,['fourball'],{rulesVersion:1},1),/exactly two complete pairs/);
    const fourTeams = [...players,{id:'D1',name:'D1',team:'D',handicap:0,scores:Array(18).fill(7)},
      {id:'D2',name:'D2',team:'D',handicap:0,scores:Array(18).fill(7)}];
    assert.match(validateVariationSetup([{players:fourTeams}],['fourball'],
      {rulesVersion:1,fourBallFormat:'round_robin'},1),/exactly three complete pairs/);
    assert.match(validateVariationSetup(groups,['fourball'],
      {rulesVersion:1,fourBallScoring:'gross'},1),/supported Four-Ball pair score/);
    assert.match(validateVariationSetup([{players:players.slice(0,5)}],['fourball'],
      {rulesVersion:1,fourBallFormat:'round_robin'},1),/exactly three complete pairs/);
    const better = calculateSettlement(players,course,['fourball'],1,undefined,
      {rulesVersion:1,fourBallFormat:'round_robin',fourBallScoring:'better'},groups);
    // A wins vs B and C by best ball; B wins vs C. Each pair's net is equal.
    assert.deepEqual(better.netByPlayer,{A1:2,A2:2,B1:0,B2:0,C1:-2,C2:-2});
    assert.equal(better.transactions.length,2);
    assert.ok(better.transactions.every(t => t.amount === 2));

    // Total pair scores reverse A/B: 11 per hole loses to 10 per hole.
    const total = calculateSettlement(players,course,['fourball'],1,undefined,
      {rulesVersion:1,fourBallFormat:'round_robin',fourBallScoring:'total'},groups);
    assert.deepEqual(total.netByPlayer,{A1:0,A2:0,B1:2,B2:2,C1:-2,C2:-2});
    assert.equal(Object.values(total.netByPlayer).reduce((sum,n) => sum+n,0),0);

    const legacy = calculateSettlement(players,course,['fourball'],1,undefined,
      {fourBallFormat:'round_robin',fourBallScoring:'total'},groups);
    assert.deepEqual(legacy.netByPlayer,{A1:2,A2:2,B1:-2,B2:-2,C1:0,C2:0});

    const tiedPlayers = players.slice(0,4).map(p => ({...p,scores:Array(18).fill(4)}));
    const tiedGroup = [{id:'tie',name:'Tie',players:tiedPlayers}];
    const tied = calculateSettlement(tiedPlayers,course,['fourball'],1,undefined,
      {rulesVersion:1},tiedGroup);
    assert.equal(tied.transactions.length,0);
    assert.ok(Object.values(tied.netByPlayer).every(n => n === 0));
  `]);
});
