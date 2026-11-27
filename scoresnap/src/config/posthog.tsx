import type { PropsWithChildren } from "react";
import { Platform } from "react-native";
import PostHog, { PostHogProvider } from "posthog-react-native";

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

export const isPostHogConfigured = Boolean(projectToken && host);

if (!isPostHogConfigured && __DEV__) {
  if (!projectToken) {
    console.error(
      "EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
    );
  }

  if (!host) {
    console.error(
      "EXPO_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_HOST is configured",
    );
  }
}

// On every event. The PostHog project is shared with other apps; this is how SnapScore's events are
// told from theirs. The web build registers the same `app` (src/services/analytics-web.ts).
export const POSTHOG_SUPER_PROPERTIES = { app: "snapscore", platform: Platform.OS };

// Nothing automatic. Left to its defaults the SDK sends a screen event on every navigation, two
// lifecycle events every time the phone is woken, and asks for feature flags at every start. None
// of those was chosen and none is in the reviewed event inventory (analytics-contract.ts). The app
// sends its own `app_opened` once per start (src/services/app-opened.ts) and uses no flags.
// tests/posthog-ios-events.test.cjs pins these settings and the full list of events.
export const posthog = isPostHogConfigured
  ? new PostHog(projectToken!, {
      host: host!,
      captureAppLifecycleEvents: false,
      preloadFeatureFlags: false,
      enableSessionReplay: false,
      logs: {
        serviceName: "scoresnap-mobile",
        environment: __DEV__ ? "development" : "production",
      },
      errorTracking: {
        autocapture: {
          uncaughtExceptions: false,
          unhandledRejections: false,
          nativeCrashes: false,
          androidNdkCrashes: false,
          console: [],
        },
      },
    })
  : null;

void posthog?.register(POSTHOG_SUPER_PROPERTIES);

export function PostHogAppProvider({ children }: PropsWithChildren) {
  if (!posthog) return children;

  // autocapture={false}, stated: with the setting absent the SDK captures screens.
  return <PostHogProvider client={posthog} autocapture={false}>{children}</PostHogProvider>;
}
