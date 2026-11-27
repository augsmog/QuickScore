export const COURSE_SEARCH_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_COURSE_SEARCH === "true";

// Manual contest joining and cross-device score sync
// When false: hides same-browser-only join codes and sharing UI
// When true: shows join codes and sharing UI (requires Supabase sync)
export const CROSS_DEVICE_SHARING_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING === "true";

// Carrying a guest's rounds into the account they sign in to. Its own release decision: it needs
// database objects (supabase/proposed/20261103071000_account_handoff.sql) that are NOT in
// production. With Join by code on and this riding on the same switch, build 33 showed every
// signed-in user "Round handoff paused" on Home and Settings. Off unless set.
export const ACCOUNT_HANDOFF_ENABLED = CROSS_DEVICE_SHARING_ENABLED &&
  process.env.EXPO_PUBLIC_FEATURE_ACCOUNT_HANDOFF === "true";

// Separate release decisions: neither follows the Join-by-code switch.
export const LEAGUES_ENABLED = CROSS_DEVICE_SHARING_ENABLED &&
  process.env.EXPO_PUBLIC_FEATURE_LEAGUES === "true";
export const NATIVE_LINKS_ENABLED = CROSS_DEVICE_SHARING_ENABLED &&
  process.env.EXPO_PUBLIC_FEATURE_NATIVE_LINKS === "true";
