const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("prebuild release manifest merges to camera, network, and vibrate", () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const blocked = new Set((app.expo.android.blockedPermissions ?? []).map(normalizePermission));
  for (const name of [
    "android.permission.RECORD_AUDIO",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.SYSTEM_ALERT_WINDOW",
  ]) {
    if (!blocked.has(name)) throw new Error(`missing blocked permission ${name}`);
  }

  const camera = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-camera");
  if (!camera) throw new Error("expo-camera plugin missing");
  if (camera[1].recordAudioAndroid !== false) throw new Error("recordAudioAndroid must be false");
  if (camera[1].microphonePermission !== false) throw new Error("microphonePermission must be false");
  if (app.expo.ios.infoPlist.NSMicrophoneUsageDescription) {
    throw new Error("iOS microphone usage string is still set");
  }

  execFileSync("npx", ["expo", "prebuild", "--platform", "android", "--no-install", "--non-interactive", "--clean"], {
    cwd: root,
    env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
    stdio: "pipe",
  });

  const manifestPath = path.join(root, "android", "app", "src", "main", "AndroidManifest.xml");
  const manifest = fs.readFileSync(manifestPath, "utf8");
  const merged = new Set();
  const removed = new Set();
  collectPermissions(manifest, merged, removed);
  for (const library of libraryManifests(path.join(root, "node_modules"))) {
    collectPermissions(fs.readFileSync(library, "utf8"), merged, removed);
  }
  for (const name of removed) merged.delete(name);

  const actual = [...merged].sort();
  const expected = [
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.CAMERA",
    "android.permission.INTERNET",
    "android.permission.VIBRATE",
  ];
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(`prebuild merged permissions:\n${actual.join("\n")}\nmanifest:\n${manifest}`);
  }
}, 180000);

function normalizePermission(name) {
  return name.includes(".") ? name : `android.permission.${name}`;
}

function collectPermissions(text, merged, removed) {
  for (const match of text.matchAll(/<uses-permission\b([^>]*?)\/?>/g)) {
    const body = match[1];
    const name = body.match(/android:name="([^"]+)"/);
    if (!name) continue;
    const normalized = normalizePermission(name[1]);
    if (/tools:node="remove"/.test(body)) removed.add(normalized);
    else merged.add(normalized);
  }
}

function libraryManifests(dir) {
  const found = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "debug" || entry.name === "test" || entry.name === "androidTest") continue;
        stack.push(full);
      } else if (
        entry.name === "AndroidManifest.xml" &&
        full.includes(`${path.sep}android${path.sep}src${path.sep}main${path.sep}`)
      ) {
        found.push(full);
      }
    }
  }
  return found;
}
