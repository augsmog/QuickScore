const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("merged Android permissions are camera, network, and vibrate only", () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const blocked = new Set((app.expo.android.blockedPermissions ?? []).map(normalizePermission));
  for (const name of [
    "android.permission.RECORD_AUDIO",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
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

  const merged = new Set((app.expo.android.permissions ?? []).map(normalizePermission));
  for (const manifest of libraryManifests(path.join(root, "node_modules"))) {
    const text = fs.readFileSync(manifest, "utf8");
    for (const match of text.matchAll(/<uses-permission\b([^>]*?)\/?>/g)) {
      const name = match[1].match(/android:name="([^"]+)"/);
      if (name) merged.add(normalizePermission(name[1]));
    }
  }
  for (const name of blocked) merged.delete(name);

  const actual = [...merged].sort();
  const expected = [
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.CAMERA",
    "android.permission.INTERNET",
    "android.permission.VIBRATE",
  ];
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(`merged permissions:\n${actual.join("\n")}`);
  }
});

function normalizePermission(name) {
  return name.includes(".") ? name : `android.permission.${name}`;
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
