// AUG-68: offline preflight for "attach the 4 subscriptions and submit 1.0". No network, no ASC calls.
// Pins the product ids/prices that must exist in App Store Connect and match code + StoreKit fixtures.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const EXPECTED = {
  'snapscore.td.annual': ['P1Y', '79.99'],
  'snapscore.td.monthly': ['P1M', '12.99'],
  'snapscore.pro.annual': ['P1Y', '24.99'],
  'snapscore.pro.monthly': ['P1M', '3.99'],
};
const products = (f) => {
  const c = JSON.parse(read(f));
  expect(c.subscriptionGroups).toHaveLength(1); // one group: TD level 1, Pro level 2
  return Object.fromEntries(c.subscriptionGroups[0].subscriptions.map((s) => [s.productID, [s.recurringSubscriptionPeriod, s.displayPrice]]));
};

test('Pro-enabled StoreKit fixture is exactly the four ASC subscriptions with expected period and price', () => {
  expect(products('e2e/storekit/SnapScore.pro-enabled.storekit')).toEqual(EXPECTED);
});
test('shipping StoreKit fixture is the TD subset of the four (Pro flag off by default)', () => {
  const ship = products('e2e/storekit/SnapScore.storekit');
  for (const [id, v] of Object.entries(ship)) expect(EXPECTED[id]).toEqual(v);
  expect(Object.keys(ship).sort()).toEqual(['snapscore.td.annual', 'snapscore.td.monthly']);
});
test('purchases.ts documents all four product ids and the group order', () => {
  const s = read('src/services/purchases.ts');
  for (const id of Object.keys(EXPECTED)) expect(s).toContain(id);
  expect(s).toContain('TD level 1');
  expect(s).toContain('Pro level 2');
});
test('submit profile targets the ASC app the subscriptions must be attached to', () => {
  const eas = JSON.parse(read('eas.json'));
  expect(eas.submit.production.ios.ascAppId).toBe('6761034352');
});
