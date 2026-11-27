import Constants from "expo-constants";

/** "version (build)". A part that is not known is left out; nothing is ever typed in by hand. */
export function appVersionLabel(version: unknown, build: unknown): string {
  const v = typeof version === "string" ? version.trim() : "";
  const b = typeof build === "string" || typeof build === "number" ? String(build).trim() : "";
  if (v && b) return `${v} (${b})`;
  if (v) return v;
  if (b) return `Build ${b}`;
  return "Unknown";
}

// Version: the app config compiled into this build. Build number: read from the installed app,
// because EAS assigns it at build time and the config's own value is not the real one.
export const APP_VERSION_LABEL = appVersionLabel(
  Constants.expoConfig?.version,
  Constants.platform?.ios?.buildNumber ?? Constants.platform?.android?.versionCode,
);
