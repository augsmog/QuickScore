export const COURSE_SEARCH_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_COURSE_SEARCH === "true";

// Cross-device sharing for tournaments, leagues, and contests
// When false: hides same-browser-only join codes and sharing UI
// When true: shows join codes and sharing UI (requires Supabase sync)
export const CROSS_DEVICE_SHARING_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING === "true";
