const base = require('./app.json').expo;
// Join by code does not require native association entitlements.
// Future activation requires a separately reviewed signed-build association packet
// (AASA + Android signing fingerprints + hosted verification). None is present.
module.exports = () => {
  const nativeLinks = process.env.EXPO_PUBLIC_FEATURE_NATIVE_LINKS;
  if (nativeLinks !== undefined && nativeLinks !== 'false') {
    throw Error('NATIVE_LINK_ASSOCIATIONS_UNVERIFIED: signed association evidence required before enabling native links');
  }
  if (base.ios?.associatedDomains !== undefined || base.android?.intentFilters !== undefined) {
    throw Error('NATIVE_LINK_ASSOCIATIONS_UNVERIFIED: unexpected native association in base config');
  }
  return base;
};
