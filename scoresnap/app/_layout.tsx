import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import "../global.css";

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: "#0a1628" }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0a1628" },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="contest/new"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
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
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
      </Stack>
    </View>
  );
}
