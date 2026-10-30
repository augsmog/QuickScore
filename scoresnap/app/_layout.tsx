import { CAPTCHA_MODE } from "../src/config/captcha";
import { TurnstileHost } from "../src/components/TurnstileHost";
import { isPublicShare } from "../src/config/public-share";
import { OFFLINE_MODE } from "../src/config/offline";
import { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments, useNavigationContainerRef } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { ErrorBoundary } from "../src/ui/ErrorBoundary";
import { useOnboardingStore } from "../src/stores/onboarding-store";
import { useAuthStore } from "../src/stores/auth-store";
import { initPurchases } from "../src/services/purchases";
import { COLORS } from "../src/ui/theme";
import "../global.css";
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { assertNoDefaultPii, assertReplayMask, scrubSentryEvent, sentryReplayMask, sentrySendDefaultPii } from "../src/config/sentry-privacy";

SplashScreen.preventAutoHideAsync();

assertNoDefaultPii(sentrySendDefaultPii);
assertReplayMask(sentryReplayMask);

const routingInstrumentation = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  enabled: !isPublicShare,
  dsn: 'https://e878c1d1d9a18b64ad7ddc2f6d2b5986@o4511068999385088.ingest.us.sentry.io/4511069003776000',

  // Release & environment tracking
  release: Constants.expoConfig?.version
    ? `com.scoresnap.app@${Constants.expoConfig.version}`
    : undefined,
  dist: Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode?.toString(),
  environment: __DEV__ ? "development" : "production",

  sendDefaultPii: sentrySendDefaultPii,
  enableLogs: true,

  // Performance tracing — capture 20% of transactions
  tracesSampleRate: 0.2,
  enableAutoPerformanceTracing: true,
  enableAppStartTracking: true,
  enableStallTracking: true,

  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,

  integrations: [
    Sentry.mobileReplayIntegration(sentryReplayMask),
    Sentry.feedbackIntegration(),
    routingInstrumentation,
  ],

  // Filter out noise. User context keeps an id and drops email and name.
  beforeSend(event) {
    const scrubbed = scrubSentryEvent(event);
    if (__DEV__ && !scrubbed.tags?.["force_send"]) return null;
    return scrubbed;
  },

  // Breadcrumb filtering — keep navigation, user actions, network
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === "console" && breadcrumb.level === "debug") return null;
    return breadcrumb;
  },
});

function useProtectedRoute() {
  const hasCompletedOnboarding = useOnboardingStore(
    (s) => s.hasCompletedOnboarding
  );
  const { session, skipSignIn, isAnonymous } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (__DEV__ && segments[0] === "dev") return;

    // In offline mode, auto-create anonymous session and skip auth
    if (OFFLINE_MODE && hasCompletedOnboarding && !session) {
      skipSignIn();
      return;
    }

    // GS-5: browser guests join without onboarding or an account.
    if (segments[0] === "join" || segments[0] === "r") return;

    const inOnboarding = segments[0] === "onboarding";
    const inAuth = segments[0] === "auth";

    if (!hasCompletedOnboarding && !inOnboarding) {
      router.replace("/onboarding");
    } else if (hasCompletedOnboarding && !session && !inAuth && !OFFLINE_MODE) {
      router.replace("/auth/sign-in");
    } else if (hasCompletedOnboarding && session && !isAnonymous && (inOnboarding || inAuth)) {
      router.replace("/");
    }
  }, [hasCompletedOnboarding, session, isAnonymous, segments]);
}

export default Sentry.wrap(function RootLayout() {
  const ref = useNavigationContainerRef();

  useEffect(() => {
    if (ref?.current) {
      routingInstrumentation.registerNavigationContainer(ref);
    }
  }, [ref]);

  const initialize = useAuthStore((s) => s.initialize);
  const [hydrated, setHydrated] = useState(false);

  const [fontsLoaded] = useFonts({
    Marcellus_400Regular: require("../assets/fonts/Marcellus_400Regular.ttf"),
    MarcellusSC_400Regular: require("../assets/fonts/MarcellusSC_400Regular.ttf"),
    SourceSans3_400Regular: require("../assets/fonts/SourceSans3_400Regular.ttf"),
    SourceSans3_500Medium: require("../assets/fonts/SourceSans3_500Medium.ttf"),
    SourceSans3_600SemiBold: require("../assets/fonts/SourceSans3_600SemiBold.ttf"),
    SourceSans3_700Bold: require("../assets/fonts/SourceSans3_700Bold.ttf"),
    SourceSans3_800ExtraBold: require("../assets/fonts/SourceSans3_800ExtraBold.ttf"),
  });

  useEffect(() => {
    initialize().catch((e) => Sentry.captureException(e, { tags: { init: "auth" } }));
    initPurchases().catch((e) => Sentry.captureException(e, { tags: { init: "purchases" } }));
    const t = setTimeout(() => setHydrated(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fontsLoaded && hydrated) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, hydrated]);

  if (!hydrated || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <StatusBar style="dark" />
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return <RootLayoutNav />;
});

function RootLayoutNav() {
  useProtectedRoute();

  return (
    <ErrorBoundary>
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <StatusBar style="dark" />
        {CAPTCHA_MODE !== "off" && <TurnstileHost />}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.bg },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{ animation: "fade" }}
          />
          <Stack.Screen
            name="onboarding"
            options={{ animation: "fade" }}
          />
          <Stack.Screen
            name="auth/sign-in"
            options={{ animation: "fade" }}
          />
          <Stack.Screen
            name="contest/new"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen name="contest/[id]" />
          <Stack.Screen
            name="scan/index"
            options={{ presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="scan/review"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="paywall"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
        </Stack>
      </View>
    </ErrorBoundary>
  );
}
