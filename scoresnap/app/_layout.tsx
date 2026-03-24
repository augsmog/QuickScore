import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import * as SplashScreen from "expo-splash-screen";
import { ErrorBoundary } from "../src/ui/ErrorBoundary";
import { useOnboardingStore } from "../src/stores/onboarding-store";
import { useAuthStore } from "../src/stores/auth-store";
import { initPurchases } from "../src/services/purchases";
import { COLORS } from "../src/ui/theme";
import "../global.css";
import * as Sentry from '@sentry/react-native';

SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: 'https://e878c1d1d9a18b64ad7ddc2f6d2b5986@o4511068999385088.ingest.us.sentry.io/4511069003776000',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

function useProtectedRoute() {
  const hasCompletedOnboarding = useOnboardingStore(
    (s) => s.hasCompletedOnboarding
  );
  const { session } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inOnboarding = segments[0] === "onboarding";
    const inAuth = segments[0] === "auth";

    if (!hasCompletedOnboarding && !inOnboarding) {
      router.replace("/onboarding");
    } else if (hasCompletedOnboarding && !session && !inAuth) {
      router.replace("/auth/sign-in");
    } else if (hasCompletedOnboarding && session && (inOnboarding || inAuth)) {
      router.replace("/");
    }
  }, [hasCompletedOnboarding, session, segments]);
}

export default Sentry.wrap(function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const [hydrated, setHydrated] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    initialize().catch(() => {});
    initPurchases().catch(() => {});
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
        <StatusBar style="light" />
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
        <StatusBar style="light" />
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
