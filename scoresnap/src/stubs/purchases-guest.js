// Stands in for react-native-purchases (and its UI package) on the guest-only website.
// The real package loads Stripe's script the moment it is imported; a guest who only joins,
// scores and watches must not load payment code. Buying stays in the app. Wired in
// metro.config.js through scripts/guest-web-resolver.cjs, for that one build only.
const info = { entitlements: { active: {}, all: {} }, activeSubscriptions: [], allPurchasedProductIdentifiers: [] };
const unavailable = async () => { throw new Error('Purchases are not available on the website. Use the SnapScore app.'); };
const Purchases = {
  setLogLevel() {}, configure() {}, addCustomerInfoUpdateListener() {}, removeCustomerInfoUpdateListener() {},
  isAnonymous: async () => true,
  getCustomerInfo: async () => info,
  getOfferings: async () => ({ current: null, all: {} }),
  logIn: async () => ({ customerInfo: info, created: false }),
  logOut: async () => info,
  purchasePackage: unavailable, restorePurchases: unavailable,
  checkTrialOrIntroductoryPriceEligibility: async () => ({}),
};
module.exports = Purchases;
module.exports.default = Purchases;
module.exports.__esModule = true;
module.exports.LOG_LEVEL = {};
module.exports.PURCHASES_ERROR_CODE = {};
module.exports.INTRO_ELIGIBILITY_STATUS = {};
