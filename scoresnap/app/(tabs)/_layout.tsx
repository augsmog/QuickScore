import { Tabs } from "expo-router";
import { View, StyleSheet } from "react-native";
import { Home, Trophy, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, FONTS } from "../../src/ui/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "rgba(12,19,34,0.80)",
          borderTopWidth: 0,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 10,
          height: 68 + Math.max(insets.bottom - 8, 0),
          shadowColor: COLORS.primary,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.04,
          shadowRadius: 24,
          elevation: 0,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: "rgba(220,226,248,0.60)",
        tabBarLabelStyle: {
          fontFamily: FONTS.headline,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarBackground: () => (
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: "rgba(12,19,34,0.80)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: "hidden",
            }}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={
                focused
                  ? {
                      backgroundColor: "rgba(91,243,147,0.10)",
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 5,
                    }
                  : undefined
              }
            >
              <Home size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="contests"
        options={{
          title: "Contests",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={
                focused
                  ? {
                      backgroundColor: "rgba(91,243,147,0.10)",
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 5,
                    }
                  : undefined
              }
            >
              <Trophy size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={
                focused
                  ? {
                      backgroundColor: "rgba(91,243,147,0.10)",
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 5,
                    }
                  : undefined
              }
            >
              <User size={22} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
