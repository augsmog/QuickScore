const { withNativeWind } = require("nativewind/metro");
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Web: zustand's ESM build uses import.meta, which Metro's non-module web bundle rejects.
// Pin zustand to its CJS builds on web.
const path = require("node:path");
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && /^zustand(\/[a-z/]+)?$/.test(moduleName)) {
    const sub = moduleName === "zustand" ? "index" : moduleName.slice("zustand/".length);
    return {
      type: "sourceFile",
      filePath: path.join(__dirname, "node_modules", "zustand", `${sub}.js`),
    };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
