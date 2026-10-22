export const COURSE_SEARCH_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_COURSE_SEARCH === "true" &&
  !!process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY;
