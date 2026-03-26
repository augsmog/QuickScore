import { useState, useMemo } from "react";
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
import { useContestStore, Contest } from "../../src/stores/contest-store";
import { useScanStore } from "../../src/stores/scan-store";
import { useAuthStore } from "../../src/stores/auth-store";
import { restorePurchases, getCustomerInfo } from "../../src/services/purchases";
import { calculateSettlement } from "../../src/engine/settlement";

/** Compute real stats from contest data */
function computeRealStats(contests: Contest[]) {
  const completed = contests.filter((c) => c.status === "completed");

  // Collect all player scores from completed contests
  // We take the first player in each group as "your" scores (since we don't have user identity yet)
  const roundScores: { total: number; coursePar: number; courseName: string; date: string }[] = [];

  for (const contest of completed) {
    const coursePar = contest.course.holes.reduce((a, h) => a + h.par, 0);
    for (const group of contest.groups) {
      for (const player of group.players) {
        const playedHoles = player.scores.filter((s) => s > 0);
        if (playedHoles.length >= 9) {
          // Only count rounds with at least 9 holes scored
          const total = player.scores.reduce((a, s) => a + s, 0);
          roundScores.push({
            total,
            coursePar,
            courseName: contest.course.name,
            date: contest.createdAt,
          });
        }
      }
    }
  }

  const totalRounds = roundScores.length;
  const scoringAvg = totalRounds > 0
    ? roundScores.reduce((a, r) => a + r.total, 0) / totalRounds
    : 0;
  const bestRound = totalRounds > 0
    ? Math.min(...roundScores.map((r) => r.total))
    : 0;
  const avgVsPar = totalRounds > 0
    ? roundScores.reduce((a, r) => a + (r.total - r.coursePar), 0) / totalRounds
    : 0;

  // Course history — count rounds per course
  const courseMap: Record<string, number> = {};
  for (const r of roundScores) {
    courseMap[r.courseName] = (courseMap[r.courseName] || 0) + 1;
  }
  const courseHistory = Object.entries(courseMap)
    .map(([name, rounds]) => ({ name, rounds }))
    .sort((a, b) => b.rounds - a.rounds)
    .slice(0, 5);

  // Wagering history from settlement engine
  const wageringHistory: { title: string; amount: number; isWin: boolean }[] = [];
  for (const contest of completed.slice(-5)) {
    // Settle last 5 completed contests
    const allPlayers = contest.groups.flatMap((g) => g.players);
    if (allPlayers.length < 2) continue;
    try {
      const settlement = calculateSettlement(
        allPlayers,
        contest.course,
        contest.games,
        contest.betUnit,
        contest.auxiliaryData
      );
      // Show net for each player
      for (const [name, net] of Object.entries(settlement.netByPlayer)) {
        if (Math.abs(net) > 0) {
          wageringHistory.push({
            title: `${contest.games[0]?.replace("_", " ") || "Round"} — ${contest.course.name}`,
            amount: net,
            isWin: net > 0,
          });
        }
      }
    } catch {
      // Skip if settlement fails
    }
  }

  return {
    totalRounds,
    completedContests: completed.length,
    scoringAvg,
    bestRound,
    avgVsPar,
    courseHistory,
    wageringHistory: wageringHistory.slice(0, 5),
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const contests = useContestStore((s) => s.contests);
  const { scansUsed, isPro, getRemainingFreeScans } = useScanStore();
  const authUser = useAuthStore((s) => s.user);
  const freeRemaining = getRemainingFreeScans();
  const [showingCustomerCenter, setShowingCustomerCenter] = useState(false);

  const stats = useMemo(() => computeRealStats(contests), [contests]);
  const displayName = authUser?.name || (isPro ? "SnapScore Pro" : "Golfer");

  const handleManageSubscription = async () => {
    try {
      setShowingCustomerCenter(true);
      await RevenueCatUI.presentCustomerCenter();
    } catch (e) {
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
  const hasData = stats.totalRounds > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ========== PROFILE HERO ========== */}
        <View style={{ alignItems: "center", paddingTop: 24, paddingBottom: 28 }}>
          <Text
            style={{
              fontFamily: FONTS.headline,
              fontSize: 28,
              color: COLORS.text,
              marginBottom: 6,
              letterSpacing: -0.5,
            }}
          >
            {displayName}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 }}>
            <MapPin size={12} color={COLORS.textDim} />
            <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
              Member since {memberYear}
            </Text>
          </View>

          {/* Scoring Average circle (or empty state) */}
          <View
            style={{
              width: 110,
              height: 110,
              borderRadius: RADII.full,
              backgroundColor: hasData ? COLORS.primary : COLORS.surfaceHigh,
              alignItems: "center",
              justifyContent: "center",
              ...(hasData ? GLOW.primaryStrong : {}),
            }}
          >
            {hasData ? (
              <>
                <Text
                  style={{
                    fontFamily: FONTS.headline,
                    fontSize: 42,
                    color: COLORS.onPrimary,
                    letterSpacing: -2,
                  }}
                >
                  {Math.round(stats.scoringAvg)}
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.headlineMedium,
                    fontSize: 11,
                    color: COLORS.onPrimary,
                    marginTop: -4,
                  }}
                >
                  AVG SCORE
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: FONTS.headline,
                    fontSize: 24,
                    color: COLORS.textDim,
                  }}
                >
                  —
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.headlineMedium,
                    fontSize: 11,
                    color: COLORS.textDim,
                    marginTop: -2,
                  }}
                >
                  NO ROUNDS
                </Text>
              </>
            )}
          </View>
        </View>

        {/* ========== STATS GRID ========== */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          {[
            {
              value: hasData ? stats.scoringAvg.toFixed(1) : "—",
              label: "Scoring Avg",
              accent: COLORS.primary,
            },
            {
              value: hasData ? `${stats.avgVsPar >= 0 ? "+" : ""}${stats.avgVsPar.toFixed(1)}` : "—",
              label: "Avg vs Par",
              accent: COLORS.primary + "bb",
            },
            {
              value: hasData ? `${stats.bestRound}` : "—",
              label: "Best Round",
              accent: COLORS.primary + "88",
            },
            {
              value: `${stats.totalRounds}`,
              label: "Rounds Played",
              accent: COLORS.primary + "66",
            },
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
          {stats.wageringHistory.length > 0 ? (
            stats.wageringHistory.map((item, i) => (
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
                <Text style={{ fontSize: 22 }}>{item.isWin ? "+" : "-"}</Text>
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
                  {item.isWin ? "+" : ""}${Math.abs(item.amount).toFixed(0)}
                </Text>
              </View>
            ))
          ) : (
            <View
              style={{
                backgroundColor: COLORS.surfaceLow,
                borderRadius: RADII.lg,
                padding: 20,
                alignItems: "center",
              }}
            >
              <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
                Complete a round to see your wagering history
              </Text>
            </View>
          )}
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
            <View style={{ flexDirection: "row", gap: 20 }}>
              <View>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>Rounds</Text>
                <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text }}>{contests.length}</Text>
              </View>
              <View>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>Completed</Text>
                <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text }}>{stats.completedContests}</Text>
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
          {stats.courseHistory.length > 0 ? (
            stats.courseHistory.map((course, i) => (
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
                  {course.rounds} round{course.rounds !== 1 ? "s" : ""}
                </Text>
              </View>
            ))
          ) : (
            <View
              style={{
                backgroundColor: COLORS.surfaceLow,
                borderRadius: RADII.lg,
                padding: 20,
                alignItems: "center",
              }}
            >
              <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
                Your course history will appear here after your first round
              </Text>
            </View>
          )}
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
              Unlimited scorecard scans, all game modes, settlement tracking, and more.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              {["$2.99/mo", "$19.99/yr", "$29.99 forever"].map((price) => (
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
          { icon: <Settings size={20} color={COLORS.textDim} />, label: "Settings", onPress: () => router.push("/settings") },
          { icon: <BarChart3 size={20} color={COLORS.textDim} />, label: "Statistics", onPress: () => router.push("/statistics") },
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
