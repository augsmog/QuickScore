const { withNativeWind } = require("nativewind/metro");
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");
const fs = require("fs");
const path = require("path");

const config = getSentryExpoConfig(__dirname);

// The box nightly harness shares a lockfile-matched dependency tree outside the
// checkout. Keep this opt-in so normal app builds use Metro's default paths.
if (process.env.SNAPSCORE_NIGHTLY_NODE_MODULES) {
  // Metro sees paths reached through symlinks as separate module identities.
  // Canonicalize the shared tree so it agrees with the project's node_modules link.
  const sharedNodeModules = fs.realpathSync(process.env.SNAPSCORE_NIGHTLY_NODE_MODULES);
  config.watchFolders = [...(config.watchFolders || []), sharedNodeModules];
  config.resolver = {
    ...config.resolver,
    nodeModulesPaths: [sharedNodeModules, path.resolve(__dirname, "node_modules")],
    extraNodeModules: {
      ...(config.resolver?.extraNodeModules || {}),
      react: path.join(sharedNodeModules, "react")
    }
  };
}

module.exports = withNativeWind(config, { input: "./global.css" });
