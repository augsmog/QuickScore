const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '../supabase/functions');
test('stripe-webhook alert sender is off scoresnap.app and configurable (AUG-273)', () => {
  const src = fs.readFileSync(path.join(dir, 'stripe-webhook/index.ts'), 'utf8');
  expect(src).toMatch(/Deno\.env\.get\("ALERT_EMAIL_FROM"\) \|\| "SnapScore <alerts@snapscore\.autumn8\.me>"/);
  expect(src).toMatch(/from: ALERT_EMAIL_FROM/);
});
test('no edge function hardcodes a scoresnap.app sender (AUG-273)', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const hits = walk(dir).filter(f => /\.ts$/.test(f) && /@scoresnap\.app/.test(fs.readFileSync(f, 'utf8')));
  expect(hits).toEqual([]);
});
