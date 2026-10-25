const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('Modified Stableford settlement follows its scoreboard and regular Stableford stays unchanged', () => {
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    const { calculateSettlement } = await import('./src/engine/settlement.ts').then(m => m.default ?? m);
    const { calcStableford } = await import('./src/engine/calculators/stableford.ts').then(m => m.default ?? m);
    const { calcModStableford } = await import('./src/engine/calculators/mod-stableford.ts').then(m => m.default ?? m);
    const fixture = JSON.parse(readFileSync('./tests/fixtures/mod-stableford-settlement.json', 'utf8'))
      .find(f => f.id === 'mod_stableford');
    const { players, course, betUnit, auxiliaryData, gameConfig } = fixture;
    assert.deepEqual(calcModStableford(players, course), fixture.expected.result);
    const modified = calculateSettlement(players, course, ['mod_stableford'], betUnit, auxiliaryData, gameConfig);
    assert.deepEqual(modified.netByPlayer, fixture.expected.netByPlayer);
    assert.equal(modified.netByPlayer.Casey, 3);
    assert.equal(Object.values(modified.netByPlayer).reduce((sum, amount) => sum + amount, 0), 0);
    assert.deepEqual(modified.transactions, ['Alex', 'Jordan', 'Sam'].map(from => ({
      from, to: 'Casey', amount: 1, gameType: 'mod_stableford'
    })));

    // A separate three-hole round has strictly different winners for the two formats.
    const shortCourse = { name: 'Three holes', holes: [1, 2, 3].map(num => ({ num, par: 4, hcp: num })) };
    const rivals = [
      { id: 'steady', name: 'Steady', handicap: 0, scores: [1, 1, 3] },
      { id: 'bold', name: 'Bold', handicap: 0, scores: [2, 2, 2] },
    ];
    assert.deepEqual(calcStableford(rivals, shortCourse).map(p => [p.name, p.points]), [['Steady', 13], ['Bold', 12]]);
    assert.deepEqual(calcModStableford(rivals, shortCourse).map(p => [p.name, p.points]), [['Bold', 24], ['Steady', 21]]);
    assert.deepEqual(calculateSettlement(rivals, shortCourse, ['stableford'], 2).netByPlayer, { Steady: 2, Bold: -2 });
    assert.deepEqual(calculateSettlement(rivals, shortCourse, ['mod_stableford'], 2).netByPlayer, { Steady: -2, Bold: 2 });
    const regular = calculateSettlement(players, course, ['stableford'], betUnit);
    assert.equal(calcStableford(players, course)[0].name, 'Alex');
    assert.deepEqual(regular.netByPlayer, { Alex: 3, Casey: -1, Jordan: -1, Sam: -1 });
    for (const gameType of ['stableford', 'mod_stableford']) {
      const empty = players.map(p => ({ ...p, scores: Array(18).fill(0) }));
      assert.deepEqual(calculateSettlement(empty, course, [gameType], 1).transactions, []);
    }
  `], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
});

test('Modified Stableford scoreboard ranks with the same calculator as settlement', () => {
  const fs = require('node:fs');
  const games = fs.readFileSync(path.resolve(__dirname, '../app/contest/[id]/games.tsx'), 'utf8');
  expect(games).toMatch(/import \{ calcModStableford \} from "\.\.\/\.\.\/\.\.\/src\/engine\/calculators\/mod-stableford";/);
  expect(games).toContain('(gameId === "mod_stableford" ? calcModStableford : calcStableford)(allPlayers, contest.course)');
});
