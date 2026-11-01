const {execFileSync} = require('node:child_process');
test('staged launch copy matches exact strings, order and copy rules', () => {
 expect(() => execFileSync(process.execPath, ['scripts/lint-launch-copy.cjs'], {stdio:'pipe'})).not.toThrow();
});
