// The guest-only website build (EXPO_PUBLIC_WEB_GUEST_ONLY=true, web) must not bundle payment
// code: importing react-native-purchases on web loads js.stripe.com. Every other build,
// including the iPhone app and the ordinary web build, resolves these packages as usual.
const path = require('path');
const STUBBED = new Set(['react-native-purchases', 'react-native-purchases-ui']);
const STUB = path.resolve(__dirname, '..', 'src', 'stubs', 'purchases-guest.js');

/** The stub's path when this import must be replaced; otherwise null. */
function guestStubFor(moduleName, platform, env = process.env) {
  return env.EXPO_PUBLIC_WEB_GUEST_ONLY === 'true' && platform === 'web' && STUBBED.has(moduleName) ? STUB : null;
}

/** Adds the rule in front of whatever resolver the config already has. */
function withGuestWebStubs(config, env = process.env) {
  const previous = config.resolver && config.resolver.resolveRequest;
  config.resolver = { ...config.resolver, resolveRequest(context, moduleName, platform) {
    const stub = guestStubFor(moduleName, platform, env);
    if (stub) return { type: 'sourceFile', filePath: stub };
    return (previous || context.resolveRequest)(context, moduleName, platform);
  } };
  return config;
}
module.exports = { guestStubFor, withGuestWebStubs, STUB };
