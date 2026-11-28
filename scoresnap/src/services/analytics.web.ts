import { createWebAnalytics } from "./analytics-web";

export const webAnalytics = createWebAnalytics({
  platform: "web",
  // Off on the guest-only website whatever the build sets: web guests are not tracked (AUG-1777).
  enabled: process.env.EXPO_PUBLIC_POSTHOG_ENABLED === "true" && process.env.EXPO_PUBLIC_WEB_GUEST_ONLY !== "true",
  projectKey: process.env.EXPO_PUBLIC_POSTHOG_PROJECT_KEY ?? "",
});
