const base = require('./app.json').expo;
// Entitlements require a new native build. Host association files must be served
// by the public website with the release team's ID/signing fingerprints.
module.exports = () => {
  if (process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING !== 'true') return base;
  const origin = new URL(process.env.EXPO_PUBLIC_WEB_URL || 'https://snapscore.autumn8.me');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.pathname !== '/') {
    throw Error('EXPO_PUBLIC_WEB_URL must be a public HTTPS origin');
  }
  return {
    ...base,
    ios: { ...base.ios, associatedDomains: [`applinks:${origin.hostname}`] },
    android: { ...base.android, intentFilters: [{ action: 'VIEW', autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: ['/r/', '/join/'].map(pathPrefix => ({ scheme: 'https', host: origin.hostname, pathPrefix })),
    }] },
  };
};
