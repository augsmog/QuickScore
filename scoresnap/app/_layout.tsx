import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { ErrorBoundary } from "../src/ui/ErrorBoundary";
import { useOnboardingStore } from "../src/stores/onboarding-store";
import { useAuthStore } from "../src/stores/auth-store";
import { COLORS } from "../src/ui/theme";
import "../global.css";

export default function RootLayout() {
  const hasCompletedOnboarding = useOnboardingStore(
    (s) => s.hasCompletedOnboarding
  );
  const { isInitialized, session } = useAuthStore();
  const initialize = useAuthStore((s) => s.initialize);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Initialize auth (will fail gracefully if Supabase not configured)
    initialize().catch(() => {});
    // Small delay to let Zustand stores rehydrate from AsyncStorage
    const t = setTimeout(() => setHydrated(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Wait for stores to rehydrate
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

  // Determine initial route
  const initialRoute = !hasCompletedOnboarding
    ? "onboarding"
    : !session
    ? "auth/sign-in"
    : "(tabs)";

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
          initialRouteName={initialRoute}
        >
          <Stack.Screen
            name="onboarding"
            options={{ animation: "fade" }}
          />
          <Stack.Screen
            name="auth/sign-in"
            options={{ animation: "fade" }}
          />
          <Stack.Screen name="(tabs)" />
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
