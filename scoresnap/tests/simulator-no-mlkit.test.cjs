// Simulator-only ML Kit exclusion (arm64 simulator builds). Store builds must be untouched.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const FLAG = "EXPO_PUBLIC_SIMULATOR_NO_MLKIT";
const MLKIT = "@react-native-ml-kit/text-recognition";
const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));

// Autolinking require()s this file in plain Node at pod-install time, so evaluate it the
// same way (no Babel/Jest transform) with a controlled process.env.
function loadRnConfig(flag) {
  const code = fs.readFileSync(path.join(root, "react-native.config.js"), "utf8");
  const mod = { exports: {} };
  const fakeProcess = { env: flag === undefined ? {} : { [FLAG]: flag } };
  new Function("require", "module", "exports", "process", code)(require, mod, mod.exports, fakeProcess);
  return mod.exports;
}

function loadMlKit(flag) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, "src/services/ml-kit-ocr.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const fakeProcess = { env: flag === undefined ? {} : { [FLAG]: flag } };
  new Function("require", "module", "exports", "process", code)(
    (id) => (id === MLKIT ? { recognize: async () => ({ text: "", blocks: [] }) } : {}),
    mod, mod.exports, fakeProcess,
  );
  return mod.exports;
}

const SIM_PROFILES = ["simulator", "simulator-offline"];

test("only the simulator profiles set the no-ML-Kit flag", () => {
  for (const name of SIM_PROFILES) {
    expect(eas.build[name].env[FLAG]).toBe("1");
    expect(eas.build[name].ios.simulator).toBe(true);
    expect(eas.build[name].distribution).toBe("internal");
    expect(eas.build[name].channel).toBeUndefined();
    expect(eas.build[name].autoIncrement).toBeUndefined();
  }
  for (const name of Object.keys(eas.build).filter((n) => !SIM_PROFILES.includes(n))) {
    expect((eas.build[name].env || {})[FLAG]).toBeUndefined();
  }
});

test("simulator-offline is a local-only E2E fixture build, never production env", () => {
  const off = eas.build["simulator-offline"];
  expect(off.environment).toBeUndefined();
  expect(off.env.EXPO_PUBLIC_OFFLINE_MODE).toBe("true");
  expect(off.env.EXPO_PUBLIC_DEMO_MODE).toBe("false");
  expect(off.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING).toBe("false");
  // No EAS environment means no Sentry auth token; skip the debug-file upload instead of failing the build.
  expect(off.env.SENTRY_DISABLE_AUTO_UPLOAD).toBe("true");
  for (const name of Object.keys(eas.build).filter((n) => n !== "simulator-offline")) {
    expect((eas.build[name].env || {}).SENTRY_DISABLE_AUTO_UPLOAD).toBeUndefined();
  }
});

test("production and TestFlight profiles are byte-for-byte what they were", () => {
  expect(eas.build.production).toEqual({
    autoIncrement: true, channel: "production", environment: "production",
    env: { EXPO_PUBLIC_FEATURE_COURSE_SEARCH: "true" },
  });
  expect(eas.build.testflight).toEqual({
    distribution: "store", ios: { buildConfiguration: "Release" }, autoIncrement: true,
    channel: "testflight", environment: "production",
    env: { EXPO_PUBLIC_FEATURE_COURSE_SEARCH: "true" },
  });
});

test("preview and development profiles are byte-for-byte what they were", () => {
  expect(eas.build.preview).toEqual({ distribution: "internal", ios: { simulator: true } });
  expect(eas.build.development).toEqual({
    developmentClient: true, distribution: "internal", env: { APP_VARIANT: "development" },
  });
  expect(Object.keys(eas.build).sort()).toEqual(
    ["development", "preview", "production", "simulator", "simulator-offline", "testflight"],
  );
});

test("react-native.config.js is a no-op unless the flag is exactly 1", () => {
  for (const v of [undefined, "", "0", "true"]) {
    expect(loadRnConfig(v)).toEqual({ dependencies: {} });
  }
});

test("with the flag, ML Kit is removed from iOS autolinking only", () => {
  const cfg = loadRnConfig("1");
  expect(cfg.dependencies[MLKIT]).toEqual({ platforms: { ios: null } });
  expect(Object.keys(cfg.dependencies)).toEqual([MLKIT]);
});

test("ML Kit stays available in store builds and is skipped in simulator builds", async () => {
  expect(await loadMlKit(undefined).isMLKitAvailable()).toBe(true);
  expect(await loadMlKit("1").isMLKitAvailable()).toBe(false);
});

test("scan screen falls back to text entry with a simulator notice", () => {
  const src = fs.readFileSync(path.join(root, "app/scan/index.tsx"), "utf8");
  expect(src).toMatch(/phase === "text-entry" \|\| OFFLINE_MODE \|\| NATIVE_OCR_DISABLED/);
  expect(src).toContain('testID="scan-unavailable-simulator"');
  const cfg = fs.readFileSync(path.join(root, "src/config/native-ocr.ts"), "utf8");
  expect(cfg).toContain('process.env.EXPO_PUBLIC_SIMULATOR_NO_MLKIT === "1"');
  expect(cfg).toMatch(/Scanning is unavailable in simulator builds/);
});
