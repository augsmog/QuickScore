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
    const expected = {A:2,B:2,C:-2,D:-2,E:-2,F:-2,G:2,H:2};
    const result = calculateContestSettlement(contest);
    assert.equal(result.pending, undefined);
    assert.deepEqual(result.netByPlayer, expected);
    assert.equal(result.transactions.length, 4);
    assert.equal(result.transactions.reduce((sum, t) => sum + t.amount, 0), 8);
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
