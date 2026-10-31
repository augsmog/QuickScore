const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = globalThis.test || require('node:test');

test('welcome email advertises exactly one game count: 50+ game modes', () => {
  // Read the template without importing the handler or invoking external services.
  const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/on-user-signup/index.ts'), 'utf8');
  const html = source.match(/async function sendWelcomeEmail\b[\s\S]*?html: `([\s\S]*?)`,/)[1];
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
  assert.equal(text.split('50+ game modes').length - 1, 1);
  const gameCounts = text.match(/\b(?:\d[\d,]*(?:\+|\s*(?:to|–|-)\s*\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\s+(?:games?(?:\s+(?:modes?|variants?))?|modes?|variants?)\b/gi) || [];
  assert.deepEqual(gameCounts, ['50+ game modes']);
  assert.ok(text.includes('50+ game modes, stats tracking, and league play.'));
});
