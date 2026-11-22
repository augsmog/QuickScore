export const COURSE_SEARCH_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_COURSE_SEARCH === "true";

// Manual contest joining and cross-device score sync
// When false: hides same-browser-only join codes and sharing UI
// When true: shows join codes and sharing UI (requires Supabase sync)
export const CROSS_DEVICE_SHARING_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING === "true";

// Separate release decisions: neither follows the Join-by-code switch.
export const LEAGUES_ENABLED = CROSS_DEVICE_SHARING_ENABLED &&
  process.env.EXPO_PUBLIC_FEATURE_LEAGUES === "true";
export const NATIVE_LINKS_ENABLED = CROSS_DEVICE_SHARING_ENABLED &&
  process.env.EXPO_PUBLIC_FEATURE_NATIVE_LINKS === "true";
