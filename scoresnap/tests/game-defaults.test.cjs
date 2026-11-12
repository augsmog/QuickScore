const runNode = require('./helpers/run-node.cjs');
const path = require('node:path');
test('all 30 base calculators and empty-config settlements match pre-change 1dee94d bytes', () => {
 const actual = runNode(['--import','tsx','tests/fixtures/game-defaults-runner.ts'],{cwd:path.resolve(__dirname,'..')});
 expect(actual.trim()).toBe(require('node:fs').readFileSync(path.join(__dirname,'fixtures/game-defaults-1dee94d.json'),'utf8').trim());
});
