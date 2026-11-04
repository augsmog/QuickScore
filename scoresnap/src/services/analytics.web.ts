import { createWebAnalytics } from "./analytics-web";

export const webAnalytics = createWebAnalytics({
  platform: "web",
  enabled: process.env.EXPO_PUBLIC_POSTHOG_ENABLED === "true",
  projectKey: process.env.EXPO_PUBLIC_POSTHOG_PROJECT_KEY ?? "",
});
