const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const doc = fs.readFileSync(path.join(__dirname, '../docs/SOCIAL_ACCOUNTS_KIT.md'), 'utf8');
const LIMITS = { instagram: 150, tiktok: 80, x: 160, youtube: 1000 };
const bios = {};
for (const m of doc.matchAll(/<!-- bio:(\w+) -->\n([\s\S]*?)\n<!-- \/bio -->/g)) bios[m[1]] = m[2];

test('every platform has a bio within its limit', () => {
  for (const [name, max] of Object.entries(LIMITS)) {
    assert.ok(bios[name], name + ' bio missing');
    assert.ok(bios[name].length <= max, `${name} bio ${bios[name].length}/${max}`);
  }
});
test('bios follow launch-copy rules', () => {
  for (const [name, text] of Object.entries(bios)) {
    assert.doesNotMatch(text, /\b(?:bets?|betting|wager\w*|gambl\w*|payout\w*|unlock\w*|winnings|every score|always|easiest)\b/i, name);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}|!/u, name);
    assert.doesNotMatch(text.replaceAll('50+ game modes', ''), /\b\d+\s*\+?\s*(?:game|mode|ways to play)s?\b/i, name);
  }
});
test('doc is marked draft and links the real site', () => {
  assert.match(doc, /Status: DRAFT/);
  assert.match(doc, /https:\/\/snapscore\.autumn8\.me/);
});
