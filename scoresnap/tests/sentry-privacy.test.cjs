const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

jest.setTimeout(60000);

test("Sentry PII is off and replay masks are explicitly enabled", () => {
  execFileSync(process.execPath, ["--import", "tsx", "tests/sentry-privacy.scenario.ts"], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
});

test("Android manifest does not request unused RECORD_AUDIO", () => {
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, "../app.json"), "utf8"));
  const permissions = app.expo.android.permissions;
  assertNoAudio(permissions);
  const camera = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-camera");
  if (!camera) throw new Error("expo-camera plugin missing");
  if (camera[1].recordAudioAndroid !== false) throw new Error("recordAudioAndroid must be false");
  if (!permissions.includes("android.permission.CAMERA")) throw new Error("camera permission missing");
});

function assertNoAudio(permissions) {
  if (permissions.some((permission) => permission.includes("RECORD_AUDIO"))) {
    throw new Error(`RECORD_AUDIO still declared: ${permissions.join(", ")}`);
  }
}
