const fs = require('node:fs');
const path = require('node:path');
const eas = require('../eas.json');

describe('EAS store profiles and Associated Domains entitlement', () => {
  const sharingFlag = 'EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING';
  const appConfigSource = fs.readFileSync(path.join(__dirname, '../app.config.js'), 'utf8');
  const flagGatesAssociatedDomains =
    /if\s*\(\s*process\.env\.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING\s*!==\s*['"]true['"]\s*\)\s*return\s+base/.test(appConfigSource) &&
    /associatedDomains\s*:/.test(appConfigSource);

  test.each(['testflight', 'production'])(
    '%s cannot enable sharing while app.config.js emits Associated Domains',
    profileName => {
      const profileFlag = eas.build[profileName]?.env?.[sharingFlag];

      // Enabling the flag is allowed only once the App Store profile contains
      // the entitlement, or app.config.js stops emitting Associated Domains.
      if (flagGatesAssociatedDomains) expect(profileFlag).not.toBe('true');
    },
  );
});
