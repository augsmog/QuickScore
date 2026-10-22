// Offline mode (web previews, friend testing): skips sign-in and onboarding.
// Explicit opt-in only: build with EXPO_PUBLIC_OFFLINE_MODE=true.
export const OFFLINE_MODE = process.env.EXPO_PUBLIC_OFFLINE_MODE === "true";
