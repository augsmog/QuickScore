import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { ErrorBoundary } from "../src/ui/ErrorBoundary";
import { useOnboardingStore } from "../src/stores/onboarding-store";
import { useAuthStore } from "../src/stores/auth-store";
import { initPurchases } from "../src/services/purchases";
import { COLORS } from "../src/ui/theme";
import "../global.css";

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

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    initialize().catch(() => {});
    // Initialize RevenueCat for in-app purchases
    initPurchases().catch(() => {});
    const t = setTimeout(() => setHydrated(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (!hydrated) {
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
}

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
