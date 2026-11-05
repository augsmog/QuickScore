const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('src/ui/compact-viewport.ts', 'utf8');
const moduleRecord = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(moduleRecord, moduleRecord.exports);
const { isCompactViewport } = moduleRecord.exports;

test('compact layout covers iPhone SE and iPhone 15 Pro browser widths', () => {
  expect(isCompactViewport({ width: 375, height: 667 })).toBe(true);
  expect(isCompactViewport({ width: 393, height: 852 })).toBe(true);
});

test('compact layout preserves wider phone spacing and short landscape handling', () => {
  expect(isCompactViewport({ width: 430, height: 932 })).toBe(false);
  expect(isCompactViewport({ width: 844, height: 390 })).toBe(true);
});
