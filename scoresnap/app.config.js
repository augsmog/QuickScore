const base = require('./app.json').expo;
// Join by code does not require native association entitlements.
// Future activation requires a separately reviewed signed-build association packet
// (AASA + Android signing fingerprints + hosted verification). None is present.
module.exports = () => {
  if (process.env.EXPO_PUBLIC_FEATURE_NATIVE_LINKS === 'true') {
    throw Error('NATIVE_LINK_ASSOCIATIONS_UNVERIFIED: signed association evidence required before enabling native links');
  }
  if (base.ios?.associatedDomains?.length || base.android?.intentFilters?.length) {
    throw Error('NATIVE_LINK_ASSOCIATIONS_UNVERIFIED: unexpected native association in base config');
  }
  return base;
};
