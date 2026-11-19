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

// The vault sweep (customer-desk-nopro-sweep-2026-11-11.md item 3) named four exact leftover
// strings reachable at /paywall?tier=td while pro_enabled is off: the "SNAPSCORE PRO" eyebrow, the
// Free row's "3 scans a month" cap (scanning is actually unlimited once Pro is free), the
// Tournament Director body still reading "Everything in Pro," and the Pro-on trial line
// (now "One Pro trial per Apple ID."). None may survive in the built view when the flag is off.
const LEFTOVERS = [copy.PAYWALL_COPY.eyebrow, copy.PAYWALL_COPY.freeBody, copy.PAYWALL_COPY.tdBody, copy.PAYWALL_COPY.oneTrial];
function strings(v) {
  return [v.eyebrow, v.oneTrial, ...v.rows.map(r => r.body)].filter(Boolean);
}
test('none of the four named Pro-era leftover strings survive in the built view while the flag is off', () => {
  const v = view('free', false);
  for (const leftover of LEFTOVERS) expect(strings(v)).not.toContain(leftover);
  expect(v.eyebrow).toBe(copy.PAYWALL_COPY.eyebrowNoPro);
  expect(v.rows.find(r => r.tier === 'free').body).toBe(copy.PAYWALL_COPY.freeBodyNoPro);
  expect(v.rows.find(r => r.tier === 'td').body).toBe(copy.PAYWALL_COPY.tdBodyNoPro);
  // t1517u: Tournament Director has no free trial, so no trial line renders at all while the flag is off.
  expect(v.oneTrial).toBe('');
  expect(copy.PAYWALL_COPY.oneTrialNoPro).toBeUndefined();
  expect(v.rows.every(r => !r.trial)).toBe(true);
  expect(v.cta).not.toMatch(/trial/i);
});
test('flag on keeps the original Pro-era strings byte-exact (figma fixture contract unaffected)', () => {
  const v = view('free', true);
  for (const leftover of LEFTOVERS) expect(strings(v)).toContain(leftover);
});
// t1517u follow-up: there is no Tournament Director trial anywhere, including dormant Pro-on copy.
test('Pro-on trial line is Pro-only and never mentions Tournament Director', () => {
  expect(copy.PAYWALL_COPY.oneTrial).toBe('One Pro trial per Apple ID.');
  expect(copy.PAYWALL_COPY.oneTrial).not.toMatch(/Tournament Director/i);
  const src = require('fs').readFileSync(require('path').join(process.cwd(), 'src/ui/paywall-copy.ts'), 'utf8');
  expect(src).not.toMatch(/One trial per Apple ID across Pro and Tournament Director/);
  const v = view('free', true);
  expect(v.oneTrial).toBe('One Pro trial per Apple ID.');
});

// Mount the actual app/paywall.tsx screen (same idiom as AC-PW tests in
// paywall-clubhouse-ledger.test.cjs) with a live proEnabled()=>false, the exact way a free user
// reaches /paywall?tier=td, and check the real rendered text -- not just the pure helper's output.
function mountPaywall({ proEnabledNow = false, target = 'td', ownerTier = 'free' } = {}) {
  const states = []; let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const Screen = load('app/paywall.tsx', {
    react: { useState: init => { const i = cursor++; if (!(i in states)) states[i] = init; return [states[i], v => { states[i] = v; }]; }, useEffect: () => {} },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', Alert: { alert: () => {} }, Linking: { openURL: () => {} }, StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useRouter: () => ({ back: () => {} }), useLocalSearchParams: () => ({ tier: target }) },
    '@expo-google-fonts/inter': { useFonts: () => [true] },
    '@/services/platform-alert': { showAlert: () => {} },
    '../src/ui/SafeScreen': { SafeScreen: 'SafeAreaView' },
    '../src/services/purchases': { getPackages: async () => ({ annual: null, monthly: null, td_annual: null, td_monthly: null }), purchasePackage: async () => true, restorePurchases: async () => true, syncProStatus: async () => {} },
    '../src/services/paywall-plans': plans, '../src/services/entitlements': { proEnabled: () => proEnabledNow },
    '../src/stores/scan-store': { useScanStore: f => f({ tier: ownerTier }) },
    '../src/config/support': load('src/config/support.ts'), '../src/config/posthog': { posthog: null },
    '../src/ui/paywall-tokens': load('src/ui/paywall-tokens.ts'), '../src/ui/paywall-icons': { PaywallIcon: 'Icon', PaywallRadio: 'Radio' },
    '../src/ui/paywall-copy': copy,
  }).default;
  cursor = 0;
  return Screen();
}
const nodesOf = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodesOf) : [n, ...nodesOf(n.props?.children)];
const textOf = n => n == null ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(textOf).join('') : textOf(n.props?.children);
test('the actual mounted /paywall?tier=td screen renders none of the four leftovers while the flag is off', () => {
  const rendered = textOf(nodesOf(mountPaywall()));
  for (const leftover of LEFTOVERS) expect(rendered).not.toContain(leftover);
  expect(rendered).toContain(copy.PAYWALL_COPY.eyebrowNoPro);
  expect(rendered).toContain(copy.PAYWALL_COPY.tdBodyNoPro);
  // The unchanged, already-approved legal boilerplate still says "after any eligible trial"; no trial offer, tag or line renders.
  expect(rendered).not.toMatch(/free trial|7-day|one trial|try .* free/i);
  expect(rendered).toContain('Tournament Director');
});
test('the actual mounted /paywall screen keeps every leftover string when the flag is on', () => {
  const rendered = textOf(nodesOf(mountPaywall({ proEnabledNow: true })));
  for (const leftover of LEFTOVERS) expect(rendered).toContain(leftover);
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

// t1517u: Tournament Director has no free trial. Even a stale App Store Connect / RevenueCat intro
// offer that reported the TD annual product as trial-eligible must never reach the paywall view.
test('TD never shows or offers a trial even when a caller reports its annual product eligible', () => {
  const eligible = { 'td-annual-id': true };
  const packages = { td_annual: { product: { identifier: 'td-annual-id', priceString: '$79.99' } }, td_monthly: null };
  for (const proEnabledNow of [false, true]) {
    const v = plans.buildPaywallView(packages, eligible, 'free', { tier: 'td', period: 'year' }, proEnabledNow);
    expect(v.rows.find(r => r.tier === 'td').trial).toBe('');
    expect(v.cta).not.toMatch(/trial/i);
    expect(v.billed).not.toMatch(/^Then/);
  }
});
