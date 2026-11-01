const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
const files = ['app/onboarding.tsx', 'app/(tabs)/index.tsx', 'app/paywall.tsx', 'src/ui/paywall-copy.ts', 'docs/APP_STORE_LISTING.md'];
function copy(file) {
 const raw = read(file);
 if (file.endsWith('.md')) return raw;
 const source = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
 const values = [];
 function walk(n) {
  if (ts.isImportDeclaration(n)) return;
  if (ts.isStringLiteralLike(n) || ts.isJsxText(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) values.push(n.text);
  ts.forEachChild(n, walk);
 }
 walk(source);
 return values.join('\n');
}
for (const file of files) {
 const text = copy(file);
 assert.doesNotMatch(text, /\b(?:bets?|betting|wager\w*|gambl\w*|payout\w*|unlock\w*|side-bet)\b/i, file);
 assert.doesNotMatch(text, /\p{Extended_Pictographic}|!/u, file);
 assert.doesNotMatch(text.replaceAll('50+ game modes', ''), /\b\d+\s*\+?\s*(?:game|mode|ways to play)s?\b/i, file);
}
const expected = require('../tests/fixtures/launch-copy.json');
for (const [file, strings] of Object.entries(expected)) {
 const text = copy(file);
 let previous = -1;
 for (const string of strings) {
  const at = text.indexOf(string, previous + 1);
  assert.ok(at > previous, file + ': missing or out of order: ' + string);
  previous = at;
 }
}
const listing = read('docs/APP_STORE_LISTING.md');
for (const [heading, max] of [['Subtitle',30],['Keywords',100],['Promotional Text',170]]) {
 const value = listing.split('## ' + heading)[1].split('\n')[1];
 assert.ok(value.length <= max, heading);
}
console.log('Launch copy lint passed');
