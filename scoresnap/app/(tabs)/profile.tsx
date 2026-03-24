import { useState } from "react";
import { View, Text, ScrollView, Button, Alert } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  User,
  Settings,
  Crown,
  BarChart3,
  Camera,
  CreditCard,
  HelpCircle,
  MapPin,
  ChevronRight,
} from "lucide-react-native";
import * as Sentry from "@sentry/react-native";
import RevenueCatUI from "react-native-purchases-ui";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW } from "../../src/ui/theme";
import { AnimatedPressable } from "../../src/ui/AnimatedPressable";
import { useContestStore } from "../../src/stores/contest-store";
import { useScanStore } from "../../src/stores/scan-store";
import { restorePurchases, getCustomerInfo } from "../../src/services/purchases";

// Mock stats data — replace with real data when stats backend is available
const MOCK_STATS = {
  scoringAvg: 82.4,
  girPct: 44,
  puttsPerRound: 31.2,
  fwPct: 58,
  handicap: 12.4,
};

const MOCK_WAGERING_HISTORY = [
  { emoji: "🏆", title: "Skins Match — Oakmont", amount: 45, isWin: true },
  { emoji: "💸", title: "Nassau — Pebble Beach", amount: -20, isWin: false },
  { emoji: "🏆", title: "Wolf — Torrey Pines", amount: 30, isWin: true },
];

const MOCK_COURSES = [
  { name: "Torrey Pines South", rounds: 12 },
  { name: "Pebble Beach GL", rounds: 4 },
  { name: "Oakmont CC", rounds: 8 },
];

export default function ProfileScreen() {
  const router = useRouter();
  const contests = useContestStore((s) => s.contests);
  const completed = contests.filter((c) => c.status === "completed").length;
  const { scansUsed, isPro, getRemainingFreeScans } = useScanStore();
  const freeRemaining = getRemainingFreeScans();
  const [showingCustomerCenter, setShowingCustomerCenter] = useState(false);

  const handleManageSubscription = async () => {
    try {
      setShowingCustomerCenter(true);
      await RevenueCatUI.presentCustomerCenter();
    } catch (e) {
      // Customer Center not available — show manual info
      const info = await getCustomerInfo();
      if (info) {
        const activeEntitlements = Object.keys(info.entitlements.active);
        const managementURL = info.managementURL;

        if (managementURL) {
          Alert.alert(
            "Manage Subscription",
            `Active: ${activeEntitlements.join(", ") || "None"}\n\nTo manage your subscription, visit your device settings.`,
            [{ text: "OK" }]
          );
        } else {
          Alert.alert(
            "No Active Subscription",
            "You don't have an active subscription to manage."
          );
        }
      }
    } finally {
      setShowingCustomerCenter(false);
    }
  };

  const memberYear = new Date().getFullYear();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ========== PROFILE HERO ========== */}
        <View style={{ alignItems: "center", paddingTop: 24, paddingBottom: 28 }}>
          {/* Course HCP label */}
          <Text
            style={{
              ...TYPOGRAPHY.labelSm,
              color: COLORS.textDim,
              marginBottom: 8,
            }}
          >
            YR COURSE HCP
          </Text>

          {/* Player name */}
          <Text
            style={{
              fontFamily: FONTS.headline,
              fontSize: 28,
              color: COLORS.text,
              marginBottom: 6,
              letterSpacing: -0.5,
            }}
          >
            {isPro ? "SnapScore Pro" : "Golfer"}
          </Text>

          {/* Location + member since */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 }}>
            <MapPin size={12} color={COLORS.textDim} />
            <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
              Local Course
            </Text>
            <Text style={{ color: COLORS.surfaceHighest, fontSize: 13 }}>·</Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
              Member since {memberYear}
            </Text>
          </View>

          {/* Handicap circle */}
          <View
            style={{
              width: 110,
              height: 110,
              borderRadius: RADII.full,
              backgroundColor: COLORS.primary,
              alignItems: "center",
              justifyContent: "center",
              ...GLOW.primaryStrong,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.headline,
                fontSize: 48,
                color: COLORS.onPrimary,
                letterSpacing: -2,
              }}
            >
              {MOCK_STATS.handicap.toFixed(1).split(".")[0]}
            </Text>
            <Text
              style={{
                fontFamily: FONTS.headlineMedium,
                fontSize: 16,
                color: COLORS.onPrimary,
                marginTop: -6,
              }}
            >
              .{MOCK_STATS.handicap.toFixed(1).split(".")[1]}
            </Text>
          </View>
        </View>

        {/* ========== STATS BENTO GRID ========== */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          {[
            { value: MOCK_STATS.scoringAvg.toFixed(1), label: "Scoring Avg", accent: COLORS.primary },
            { value: `${MOCK_STATS.girPct}%`, label: "GIR %", accent: COLORS.primary + "bb" },
            { value: MOCK_STATS.puttsPerRound.toFixed(1), label: "Putts/Round", accent: COLORS.primary + "88" },
            { value: `${MOCK_STATS.fwPct}%`, label: "FW%", accent: COLORS.primary + "66" },
          ].map((stat) => (
            <View
              key={stat.label}
              style={{
                flex: 1,
                minWidth: "45%",
                backgroundColor: COLORS.surfaceLow,
                borderRadius: RADII.lg,
                borderLeftWidth: 3,
                borderLeftColor: stat.accent,
                padding: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: FONTS.headline,
                  fontSize: 26,
                  color: COLORS.text,
                  marginBottom: 4,
                }}
              >
                {stat.value}
              </Text>
              <Text
                style={{
                  fontFamily: FONTS.medium,
                  fontSize: 12,
                  color: COLORS.textDim,
                }}
              >
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        {/* ========== WAGERING HISTORY ========== */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              ...TYPOGRAPHY.label,
              color: COLORS.textDim,
              marginBottom: 12,
            }}
          >
            WAGERING HISTORY
          </Text>
          {MOCK_WAGERING_HISTORY.map((item, i) => (
            <View
              key={i}
              style={{
                backgroundColor: COLORS.surfaceLow,
                borderRadius: RADII.lg,
                padding: 14,
                marginBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
                  {item.title}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: FONTS.headline,
                  fontSize: 18,
                  color: item.isWin ? COLORS.primary : COLORS.error,
                }}
              >
                {item.isWin ? "+" : ""}{item.amount < 0 ? `-$${Math.abs(item.amount)}` : `$${item.amount}`}
              </Text>
            </View>
          ))}
        </View>

        {/* ========== SCAN USAGE ========== */}
        <View
          style={{
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            padding: 16,
            marginBottom: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: RADII.md,
              backgroundColor: isPro ? COLORS.primary + "22" : freeRemaining > 0 ? COLORS.primary + "22" : COLORS.warn + "22",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Camera size={22} color={isPro ? COLORS.primary : freeRemaining > 0 ? COLORS.primary : COLORS.warn} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
              Scorecard Scans
            </Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
              {isPro
                ? "Unlimited scans (Pro)"
                : freeRemaining > 0
                ? `${freeRemaining} free scan remaining`
                : `${scansUsed} scan${scansUsed !== 1 ? "s" : ""} used · Upgrade for more`}
            </Text>
          </View>
          {!isPro && freeRemaining === 0 && (
            <AnimatedPressable
              onPress={() => router.push("/paywall")}
              style={{
                backgroundColor: COLORS.gold + "22",
                borderRadius: RADII.md,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: COLORS.gold, fontFamily: FONTS.bold, fontSize: 11 }}>Upgrade</Text>
            </AnimatedPressable>
          )}
        </View>

        {/* ========== THE BAG ========== */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 9,
              fontFamily: FONTS.bold,
              color: COLORS.primary,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            THE BAG
          </Text>
          <View
            style={{
              backgroundColor: COLORS.surfaceLow,
              borderRadius: RADII.lg,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
                Course Handicap
              </Text>
              <Text style={{ fontFamily: FONTS.headline, fontSize: 18, color: COLORS.primary }}>
                {MOCK_STATS.handicap.toFixed(1)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 20 }}>
              <View>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>Rounds</Text>
                <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text }}>{contests.length}</Text>
              </View>
              <View>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>Completed</Text>
                <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text }}>{completed}</Text>
              </View>
              <View>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>Scans</Text>
                <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text }}>{scansUsed}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ========== COURSE HISTORY ========== */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              ...TYPOGRAPHY.label,
              color: COLORS.textDim,
              marginBottom: 12,
            }}
          >
            COURSE HISTORY
          </Text>
          {MOCK_COURSES.map((course, i) => (
            <View
              key={i}
              style={{
                backgroundColor: COLORS.surfaceLow,
                borderRadius: RADII.lg,
                padding: 14,
                marginBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.primary + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MapPin size={15} color={COLORS.primary} />
                </View>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
                  {course.name}
                </Text>
              </View>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textDim }}>
                {course.rounds} rounds
              </Text>
            </View>
          ))}
        </View>

        {/* ========== PRO UPGRADE / MANAGE SUBSCRIPTION ========== */}
        {isPro ? (
          <AnimatedPressable
            onPress={handleManageSubscription}
            style={{
              backgroundColor: COLORS.gold + "15",
              borderRadius: RADII.xl,
              padding: 20,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: RADII.md,
                backgroundColor: COLORS.gold + "22",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CreditCard size={22} color={COLORS.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.gold, fontFamily: FONTS.bold, fontSize: 15 }}>
                Manage Subscription
              </Text>
              <Text style={{ color: COLORS.textDim, fontFamily: FONTS.regular, fontSize: 12, marginTop: 2 }}>
                View plan, billing, or cancel
              </Text>
            </View>
            <ChevronRight size={18} color={COLORS.textDim} />
          </AnimatedPressable>
        ) : (
          <AnimatedPressable
            onPress={() => router.push("/paywall")}
            style={{
              backgroundColor: COLORS.gold + "15",
              borderRadius: RADII.xl,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <Crown size={24} color={COLORS.gold} />
              <Text style={{ color: COLORS.gold, fontFamily: FONTS.bold, fontSize: 16 }}>
                Upgrade to SnapScore Pro
              </Text>
            </View>
            <Text style={{ color: COLORS.textDim, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19 }}>
              Unlimited scorecard scans, all 25+ game types, settlement tracking, and more.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              {["$4.99/mo", "$29.99/yr", "$49.99 forever"].map((price) => (
                <View
                  key={price}
                  style={{
                    backgroundColor: COLORS.gold + "22",
                    borderRadius: RADII.md,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: COLORS.gold, fontFamily: FONTS.bold, fontSize: 12 }}>
                    {price}
                  </Text>
                </View>
              ))}
            </View>
          </AnimatedPressable>
        )}

        {/* ========== SETTINGS LINKS ========== */}
        {[
          { icon: <Settings size={20} color={COLORS.textDim} />, label: "Settings", onPress: () => {} },
          { icon: <BarChart3 size={20} color={COLORS.textDim} />, label: "Statistics", onPress: () => {} },
          { icon: <HelpCircle size={20} color={COLORS.textDim} />, label: "Help & Support", onPress: () => {} },
        ].map((item) => (
          <AnimatedPressable
            key={item.label}
            onPress={item.onPress}
            style={{
              backgroundColor: COLORS.surfaceLow,
              borderRadius: RADII.lg,
              padding: 16,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            {item.icon}
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text, flex: 1 }}>
              {item.label}
            </Text>
            <ChevronRight size={16} color={COLORS.textDim} />
          </AnimatedPressable>
        ))}

        {/* Sentry Test (dev only) */}
        {__DEV__ && (
          <View style={{ marginTop: 8, marginBottom: 8 }}>
            <Button
              title="Send Test Error to Sentry"
              color={COLORS.error}
              onPress={() => {
                Sentry.captureException(new Error("First error"));
              }}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
