const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const doc = fs.readFileSync(path.join(__dirname, '../docs/COMMUNITY_SEEDING_PLAN.md'), 'utf8');
const msgs = {};
for (const m of doc.matchAll(/<!-- msg:(\w+) -->\n([\s\S]*?)\n<!-- \/msg -->/g)) msgs[m[1]] = m[2];

test('all three outreach drafts exist', () => {
  for (const k of ['creator', 'community', 'followup']) assert.ok(msgs[k], k + ' missing');
});
test('drafts follow launch-copy rules', () => {
  for (const [name, text] of Object.entries(msgs)) {
    assert.doesNotMatch(text, /\b(?:bets?|betting|wager\w*|gambl\w*|payout\w*|unlock\w*|winnings|every score|always|easiest)\b/i, name);
    assert.doesNotMatch(text, /\p{Extended_Pictographic}|!/u, name);
    assert.doesNotMatch(text.replaceAll('50+ game modes', ''), /\b\d+\s*\+?\s*(?:game|mode|ways to play)s?\b/i, name);
  }
});
test('doc is a draft, gated on reviews, and sends nothing', () => {
  assert.match(doc, /Status: DRAFT/);
  assert.match(doc, /5 or more real App Store reviews/);
  assert.match(doc, /sent by the owner by hand/);
  assert.match(doc, /https:\/\/snapscore\.autumn8\.me/);
});
