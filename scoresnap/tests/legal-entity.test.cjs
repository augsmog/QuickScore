// AUG-1639: one legal entity operates SnapScore and owns its copyright. Owner decision 2026-11-27:
// "Autumn8me ... a real company that exists" and, for the legal pages, "Fix before, all autumn8".
// This fails if the terms, the privacy policy, the site pages, the staged App Store payload or the
// in-app legal text name anyone else as operator or owner.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const ENTITY = read('src/config/legal.ts').match(/export const LEGAL_ENTITY = "([^"]+)";/)[1];

// Every file a user, App Review or Apple reads operator, owner or contact wording from.
const FILES = [
  'docs/terms-of-service.md',
  'docs/privacy-policy.md',
  'site/index.html',
  'site/terms/index.html',
  'site/privacy/index.html',
  'site/support/index.html',
  'store/asc/en-US.payload.json',
  'docs/APP_STORE_LISTING.md',
  'src/web/public-pages.ts',
  'src/ui/paywall-copy.ts',
  'app/paywall.tsx',
  'app/settings.tsx',
  'supabase/functions/on-user-signup/lib.ts',
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Names that must never stand as operator, owner or contact.
const FORBIDDEN = [/august\s+industries/i, /john\s+august\s+jones/i, /john\s+jones/i, /augie\s+jones/i, /j\.\s*a\.\s*jones/i];
// Wording that names who runs or owns the app. What follows (or precedes) it must be the entity.
const AFTER = [/operated by\s+/gi, /owned by\s+/gi, /trademarks of\s+/gi];
const BEFORE = [/,\s+operator of SnapScore/gi];

function problems(text) {
  const found = [];
  const plain = text.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  for (const pattern of FORBIDDEN) { const hit = plain.match(pattern); if (hit) found.push(`names "${hit[0]}"`); }
  for (const pattern of AFTER) for (const hit of plain.matchAll(pattern)) {
    const rest = plain.slice(hit.index + hit[0].length, hit.index + hit[0].length + ENTITY.length);
    if (rest.toLowerCase() !== ENTITY.toLowerCase()) found.push(`"${hit[0].trim()}" is followed by "${rest}", not "${ENTITY}"`);
  }
  for (const pattern of BEFORE) for (const hit of plain.matchAll(pattern)) {
    const before = plain.slice(Math.max(0, hit.index - ENTITY.length), hit.index);
    if (before !== ENTITY) found.push(`"${hit[0].trim()}" is preceded by "${before}", not "${ENTITY}"`);
  }
  return found;
}

test('the legal entity is the one the owner named', () => {
  expect(ENTITY).toBe('Autumn8me, Inc.');
});

test.each(FILES)('%s names no other operator or owner', (rel) => {
  expect(problems(read(rel))).toEqual([]);
});

test('the checker catches the wording that was there before', () => {
  expect(problems('the App operated by August Industries ("we")')).not.toEqual([]);
  expect(problems('AUGUST INDUSTRIES DISCLAIMS ALL WARRANTIES')).not.toEqual([]);
  expect(problems('SnapScore is operated by John August Jones ("we", "us").')).not.toEqual([]);
  expect(problems('John August Jones, operator of SnapScore. Email: x')).not.toEqual([]);
  expect(problems('are owned by Some Other Company and are protected')).not.toEqual([]);
  expect(problems('are trademarks of Someone Else.')).not.toEqual([]);
  expect(problems('Jane Doe, operator of SnapScore.')).not.toEqual([]);
  expect(problems(`operated by ${ENTITY} ("we"). ${ENTITY}, operator of SnapScore. Owned by ${ENTITY}.`)).toEqual([]);
});

test('the terms and the privacy policy each say who operates SnapScore and who to contact', () => {
  const terms = read('docs/terms-of-service.md');
  const privacy = read('docs/privacy-policy.md');
  expect(terms).toContain(`operated by ${ENTITY} (`);
  expect(terms).toContain(`owned by ${ENTITY} and are protected by copyright`);
  expect(terms).toContain(`trademarks of ${ENTITY}.`);
  expect(terms).toContain(`${ENTITY.toUpperCase()} DISCLAIMS ALL WARRANTIES`);
  expect(terms).toContain(`${ENTITY.toUpperCase()} SHALL NOT BE LIABLE`);
  expect(terms).toMatch(new RegExp(`## 13\\. Contact Us[\\s\\S]*\\n${escape(ENTITY)}\\n`));
  expect(privacy).toContain(`SnapScore is operated by ${ENTITY} ("we", "us").`);
  expect(privacy).toMatch(new RegExp(`## Contact\\s+${escape(ENTITY)}, operator of SnapScore\\.`));
});

test('the site pages carry the same operator as the documents they are built from', () => {
  for (const rel of ['site/terms/index.html', 'site/privacy/index.html']) {
    const html = read(rel);
    expect(html).toContain(`operated by ${ENTITY} (`);
    expect(html.split(ENTITY).length - 1).toBeGreaterThanOrEqual(2);
  }
});

test('the staged App Store payload has a copyright line naming the entity', () => {
  const payload = JSON.parse(read('store/asc/en-US.payload.json'));
  expect(payload.appStoreVersion.copyright).toMatch(new RegExp(`^20\\d\\d ${escape(ENTITY)}$`));
  expect(payload.status).toBe('STAGED-NOT-APPLIED');
});
