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

test("only the simulator profile sets the no-ML-Kit flag", () => {
  expect(eas.build.simulator.env[FLAG]).toBe("1");
  expect(eas.build.simulator.ios.simulator).toBe(true);
  for (const name of Object.keys(eas.build).filter((n) => n !== "simulator")) {
    expect((eas.build[name].env || {})[FLAG]).toBeUndefined();
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
