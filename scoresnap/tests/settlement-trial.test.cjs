const fs = require('fs'), ts = require('typescript');
function load(path, deps) {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText)(id => { if (!(id in deps)) throw Error(id); return deps[id]; }, m, m.exports);
  return m.exports;
}
const jsx = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const text = n => n == null ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const annual = (priceString = '$24.99') => ({ identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'pro.annual', subscriptionPeriod: 'P1Y', price: 24.99, currencyCode: 'USD', priceString, introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7 } } });
const trial = tree => nodes(tree).some(n => n.props?.testID === 'settle-free-trial');
function screen(packages = { annual: annual() }, status = 1) {
  let state = null, effect, dependencies, cleanup, pendingEffect, revision = 0, current = true, writes = 0;
  const auth = { user: { id: 'account-a' }, isAnonymous: false, isInitialized: true, isLoading: false }, scan = { tier: 'free' };
  const check = jest.fn(async () => ({ 'pro.annual': { status } }));
  const getPackages = jest.fn(async () => packages), push = jest.fn();
  const waitForPurchaseIdentity = jest.fn(async () => revision);
  const copy = load('src/ui/paywall-copy.ts', {});
  const plans = load('src/services/paywall-plans.ts', {
    'react-native-purchases': { __esModule: true, default: { checkTrialOrIntroductoryPriceEligibility: check }, INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 1 } },
    '../ui/paywall-copy': copy,
  });
  const deps = {
    react: { useState: () => [state, v => { state = v; writes++; }], useEffect: (f, d) => {
      if (!dependencies || d.some((v, i) => v !== dependencies[i])) { effect = f; pendingEffect = true; dependencies = d; }
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable' },
    'expo-router': { useRouter: () => ({ push }), useLocalSearchParams: () => ({ id: 'c' }) }, 'lucide-react-native': {}, 'expo-haptics': {},
  };
  const extras = {
    'services/purchases': { getPackages, waitForPurchaseIdentity, isPurchaseIdentityCurrent: r => current && r === revision },
    'services/paywall-plans': plans, 'services/scorecard-pdf': {}, 'services/share-scorecard-pdf': {}, 'engine/contest-results': {}, 'engine/calculators/skins': {},
    'stores/auth-store': { useAuthStore: f => f(auth) }, 'stores/scan-store': { useScanStore: f => f(scan) },
    'stores/contest-store': { useContestStore: f => f({ contests: [] }) }, 'services/entitlements': { canSeeSettlement: tier => tier !== 'free' },
    'ui/recap/RecapCard': {}, 'ui/recap/model': {}, 'ui/LiveShare': {}, 'ui/copy': {}, 'ui/theme': { COLORS: {}, FONTS: {}, TYPOGRAPHY: {}, RADII: {} },
  };
  for (const [k, v] of Object.entries(extras)) deps['../../../src/' + k] = v;
  deps.zustand = { useStore: (store, selector) => selector(store.getState()) };
  deps['../../../src/stores/settlement-store'] = { settlementMarks: { getState: () => ({ ready: true, ledgers: {} }) } };
  deps['../../../src/stores/settlement-marks'] = { settlementScope: (a,c) => JSON.stringify([a,c]), settlementRevision: () => 'revision', settlementTransactionKeys: rows => rows.map((_,i) => String(i)) };
  const Screen = load('app/contest/[id]/settlement.tsx', deps).default;
  return { render: () => Screen(), commit: () => { if (pendingEffect) { cleanup?.(); cleanup = effect(); pendingEffect = false; } },
    unmount: () => cleanup?.(), auth, scan, check, getPackages, push, waitForPurchaseIdentity,
    invalidate: () => { revision++; }, notReady: () => { current = false; }, writes: () => writes };
}
const fallback = tree => { expect(trial(tree)).toBe(false); expect(text(tree)).toContain('See all plans'); expect(text(tree)).not.toMatch(/7 days|Then |Renews yearly/); };
async function start(s) { fallback(s.render()); s.commit(); await flush(); return s.render(); }

test.each(['$24.99', '€29,99', '￥3,000', '24,99 €'])('eligible annual trial uses loaded localized price %s and unchanged navigation', async price => {
  const s = screen({ annual: annual(price) }); const tree = await start(s);
  expect(trial(tree)).toBe(true); expect(text(tree)).toContain(`Then ${price}/year. Cancel anytime.`);
  expect(text(tree)).not.toContain('Renews yearly'); expect(s.check).toHaveBeenCalledWith(['pro.annual']);
  nodes(tree).find(n => n.props?.testID === 'settle-free-trial').props.onPress();
  nodes(tree).find(n => n.props?.accessibilityRole === 'link').props.onPress();
  expect(s.push.mock.calls).toEqual([['/paywall'], ['/paywall']]);
});
test.each([0, 2, 3, undefined])('ineligible or unknown status %s never promises a trial', async status => { const s = screen(undefined, null); s.check.mockResolvedValue({ 'pro.annual': { status } }); fallback(await start(s)); });
test('missing eligibility entry falls back', async () => { const s = screen(); s.check.mockResolvedValue({}); fallback(await start(s)); });
test('rejected eligibility falls back', async () => { const s = screen(); s.check.mockRejectedValue(Error('offline')); fallback(await start(s)); });
test.each([null, { product: { identifier: 'pro.annual' } }, annual(''), annual('  '), annual(null)])('missing offering or price %j never checks eligibility or promises trial', async pkg => {
  const s = screen({ annual: pkg }); fallback(await start(s)); expect(s.check).not.toHaveBeenCalled();
});
test('rejected offering falls back', async () => { const s = screen(); s.getPackages.mockRejectedValue(Error('offline')); fallback(await start(s)); });
test.each([{ price: 1, periodUnit: 'DAY', periodNumberOfUnits: 7 }, { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 3 }, null])('nonmatching introductory offer never promises seven days', async introPrice => {
  const pkg = annual(); pkg.product.introPrice = introPrice; fallback(await start(screen({ annual: pkg })));
});
test('pending offering then eligibility stays on plans until both resolve', async () => {
  const offer = deferred(), eligible = deferred(), s = screen(); s.getPackages.mockReturnValue(offer.promise); s.check.mockReturnValue(eligible.promise);
  fallback(await start(s)); offer.resolve({ annual: annual('£19.99') }); await flush(); fallback(s.render());
  eligible.resolve({ 'pro.annual': { status: 1 } }); await flush(); expect(text(s.render())).toContain('Then £19.99/year.');
});
test.each(['offering', 'eligibility'])('unmounted teaser ignores delayed %s and performs no state writes', async stage => {
  const delay = deferred(), s = screen();
  (stage === 'offering' ? s.getPackages : s.check).mockReturnValue(delay.promise);
  await start(s); s.unmount(); const before = s.writes();
  delay.resolve(stage === 'offering' ? { annual: annual() } : { 'pro.annual': { status: 1 } }); await flush();
  expect(s.writes()).toBe(before); fallback(s.render());
});
test('account change hides loaded offer even before effects run', async () => {
  const s = screen(); expect(trial(await start(s))).toBe(true);
  s.auth.user = { id: 'account-b' }; fallback(s.render()); s.check.mockResolvedValue({ 'pro.annual': { status: 0 } }); s.commit(); await flush(); fallback(s.render());
});
test.each(['offering', 'eligibility'])('old account delayed %s cannot overwrite newer offer', async stage => {
  const delay = deferred(), s = screen();
  (stage === 'offering' ? s.getPackages : s.check).mockReturnValueOnce(delay.promise);
  await start(s); s.auth.user = { id: 'account-b' }; s.invalidate(); s.getPackages.mockResolvedValue({ annual: annual('€39,99') }); s.render(); s.commit(); await flush();
  expect(text(s.render())).toContain('Then €39,99/year.');
  delay.resolve(stage === 'offering' ? { annual: annual('$1.00') } : { 'pro.annual': { status: 1 } }); await flush();
  expect(text(s.render())).toContain('Then €39,99/year.'); expect(text(s.render())).not.toContain('$1.00');
});
test('identity transition invalidates in-flight and loaded offers', async () => {
  const s = screen(); expect(trial(await start(s))).toBe(true); s.invalidate(); fallback(s.render());
  const t = screen(), delay = deferred(); t.check.mockReturnValue(delay.promise); await start(t); t.invalidate(); delay.resolve({ 'pro.annual': { status: 1 } }); await flush(); fallback(t.render());
});
test('unready purchase identity does not load offerings', async () => { const s = screen(); s.waitForPurchaseIdentity.mockResolvedValue(null); fallback(await start(s)); expect(s.getPackages).not.toHaveBeenCalled(); });
test('anonymous transition clears loaded offer', async () => { const s = screen(); await start(s); s.auth.isAnonymous = true; fallback(s.render()); });
test('fallback link retains paywall navigation', async () => { const s = screen({ annual: null }); const tree = await start(s); nodes(tree).find(n => n.props?.accessibilityRole === 'link').props.onPress(); expect(s.push).toHaveBeenCalledWith('/paywall'); });

test.each([{ subscriptionPeriod: 'P1M' }, { subscriptionPeriod: null }])('nonannual product metadata %j fails closed', async fields => {
  const pkg = annual(); Object.assign(pkg.product, fields); const s = screen({ annual: pkg }); fallback(await start(s)); expect(s.check).not.toHaveBeenCalled();
});
test.each(['MONTHLY', undefined])('nonannual package type %s fails closed', async packageType => { const pkg = annual(); pkg.packageType = packageType; fallback(await start(screen({ annual: pkg }))); });
test('uninitialized or loading auth cannot show a promise', async () => { const s = screen(); s.auth.isInitialized = false; fallback(await start(s)); expect(s.getPackages).not.toHaveBeenCalled(); s.auth.isInitialized = true; s.render(); s.commit(); await flush(); expect(trial(s.render())).toBe(true); s.auth.isLoading = true; fallback(s.render()); });

test.each([{ price: undefined }, { price: NaN }, { price: Infinity }, { price: 0 }, { price: -1 }, { currencyCode: undefined }, { currencyCode: ' ' }])('invalid base price/currency metadata %j fails closed', async fields => {
  const pkg = annual(); Object.assign(pkg.product, fields); const s = screen({ annual: pkg }); fallback(await start(s)); expect(s.check).not.toHaveBeenCalled();
});
