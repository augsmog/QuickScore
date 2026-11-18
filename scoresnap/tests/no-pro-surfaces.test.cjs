// AUG-1263: leftover Pro surfaces. The one leftover PRO badge is covered by
// tests/aug1263-pro-badge.test.cjs; this suite covers the other leftover found during the audit:
// the /paywall screen (reached via the TD hosting upsell, or "Manage plan" for an existing TD
// subscriber) always listed Pro as a purchasable plan, with a real price and a "Recommended" tag,
// even though Pro has nothing behind it while pro_enabled is off. An existing raw Pro subscriber
// (tier==='pro') still sees their own plan so they can manage/cancel it.
const fs = require('fs'), ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
function load(p, deps = {}) {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(read(p), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)(id => { if (id in deps) return deps[id]; throw new Error(id); }, m, m.exports);
  return m.exports;
}
const copy = load('src/ui/paywall-copy.ts');
const plans = load('src/services/paywall-plans.ts', {
  '../ui/paywall-copy': copy,
  'react-native-purchases': { __esModule: true, default: {}, INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 1 } },
});
const view = (tier, proEnabledNow, selectionTier = 'td') => plans.buildPaywallView(null, {}, tier, { tier: selectionTier, period: 'year' }, proEnabledNow);

test('a free user shopping for TD while pro_enabled is off never sees Pro as purchasable', () => {
  const v = view('free', false);
  expect(v.rows.map(r => r.tier)).toEqual(['free', 'td']);
  expect(v.rows.some(r => r.name === copy.PAYWALL_COPY.pro)).toBe(false);
  expect(v.rows.some(r => r.price.includes('24.99') || r.price.includes('3.99'))).toBe(false);
  expect(v.rows.some(r => r.tag === copy.PAYWALL_COPY.recommended)).toBe(false);
  // TD purchase path still works: the td row resolves, selects and drives the CTA normally.
  const td = v.rows.find(r => r.tier === 'td');
  expect(td.selected).toBe(true);
  expect(v.cta).toBe(copy.PAYWALL_COPY.unavailable); // no RevenueCat package passed in this fixture
});

test('an existing raw Pro subscriber still sees and can manage their own plan', () => {
  const v = view('pro', false, 'pro');
  expect(v.rows.map(r => r.tier)).toEqual(['free', 'pro', 'td']);
  const pro = v.rows.find(r => r.tier === 'pro');
  expect(pro.tag).toBe(copy.PAYWALL_COPY.current);
});

test('flag on (or omitted, matching every pre-AUG-1263 caller) keeps both plans unchanged', () => {
  expect(view('free', true).rows.map(r => r.tier)).toEqual(['free', 'pro', 'td']);
  expect(plans.buildPaywallView(null, {}, 'free', { tier: 'pro', period: 'year' }).rows.map(r => r.tier)).toEqual(['free', 'pro', 'td']);
});

test('a selection pointed at a hidden plan falls back instead of throwing', () => {
  expect(() => view('free', false, 'pro')).not.toThrow();
  const v = view('free', false, 'pro');
  expect(v.rows.find(r => r.selected)).toBeUndefined();
  expect(v.package).toBeNull();
});

test('the real screens wire the live flag through, not a hardcoded default', () => {
  const paywallScreen = read('app/paywall.tsx');
  expect(paywallScreen).toMatch(/import\s*\{\s*proEnabled\s*\}\s*from\s*['"]\.\.\/src\/services\/entitlements['"]/);
  expect(paywallScreen).toMatch(/buildPaywallView\(packages,\s*eligible,\s*tier,\s*selection,\s*proEnabled\(\)\)/);
  // The default selection must not point at a plan that render() is about to hide.
  expect(paywallScreen).toMatch(/target === ['"]td['"]\s*\|\|\s*!proEnabled\(\)\s*\?\s*['"]td['"]\s*:\s*['"]pro['"]/);
  const settlementScreen = read('app/contest/[id]/settlement.tsx');
  expect(settlementScreen).toContain('buildPaywallView(packages, eligible, tier, { tier: \'pro\', period: \'year\' }, proEnabled())');
});
