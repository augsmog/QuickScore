import { SafeScreen } from "../../src/ui/SafeScreen";
import { signedRoundAmount } from "../../src/ui/copy";
import { calculateContestSettlement } from "../../src/engine/contest-results";
import { useState, useMemo } from "react";
import { View, Text, ScrollView, Button, Alert } from "react-native";
import { useRouter } from "expo-router";
import {
  Settings,
  Crown,
  BarChart3,
  Camera,
  CreditCard,
  HelpCircle,
  MapPin,
  ChevronRight,
  Clock,
  Trophy,
} from "lucide-react-native";
import * as Sentry from "@sentry/react-native";
import RevenueCatUI from "react-native-purchases-ui";
import { COLORS, FONTS, TYPOGRAPHY, RADII } from "../../src/ui/theme";
import { AnimatedPressable } from "../../src/ui/AnimatedPressable";
import { useContestStore, Contest } from "../../src/stores/contest-store";
import { useScanStore } from "../../src/stores/scan-store";
import { useAuthStore } from "../../src/stores/auth-store";
import { restorePurchases, getCustomerInfo } from "../../src/services/purchases";
import { openSupport } from "../../src/config/support-links";

/** Compute real stats from contest data */
function computeRealStats(contests: Contest[], account?: { id: string; name?: string } | null) {
  const completed = contests.filter((c) => c.status === "completed");

  // Collect all player scores from completed contests
  const roundScores: { total: number; coursePar: number; courseName: string; date: string }[] = [];

  // One scoring round per completed contest: the signed-in player (by id, then name), else the first player.
  const yourPlayer = (contest: Contest) => {
    const players = contest.groups.flatMap((group) => group.players);
    return players.find((p) => p.id === account?.id)
      ?? players.find((p) => account?.name && p.name === account.name)
      ?? players[0];
  };
  for (const contest of completed) {
    const coursePar = contest.course.holes.reduce((a, h) => a + h.par, 0);
    const player = yourPlayer(contest);
    if (!player) continue;
    const playedHoles = player.scores.filter((s) => s > 0);
    if (playedHoles.length >= 9) {
      // Only count rounds with at least 9 holes scored
      const total = player.scores.reduce((a, s) => a + s, 0);
      roundScores.push({ total, coursePar, courseName: contest.course.name, date: contest.createdAt });
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

  // One result per completed round, newest first. Legacy rounds use the first player.
  const roundResults = completed
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .flatMap((contest) => {
      const players = contest.groups.flatMap((group) => group.players);
      const player = yourPlayer(contest);
      if (!player) return [];
      try {
        const settlement = calculateContestSettlement(contest);
        if (settlement.pending) return [];
        return [{
          id: contest.id,
          courseName: contest.course.name,
          date: new Date(contest.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          games: contest.games.map((game) => game.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())).join(", "),
          playerCount: players.length,
          amount: settlement.netByPlayer[player.name] ?? 0,
        }];
      } catch {
        return [];
      }
    });

  return {
    totalRounds,
    completedContests: completed.length,
    scoringAvg,
    bestRound,
    avgVsPar,
    courseHistory,
    roundResults: roundResults.slice(0, 5),
    netToDateCents: roundResults.reduce((sum, item) => sum + Math.round(item.amount * 100), 0),
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const contests = useContestStore((s) => s.contests);
  const { scansUsed, isPro, getRemainingFreeScans } = useScanStore();
  const authUser = useAuthStore((s) => s.user);
  const freeRemaining = getRemainingFreeScans();
  const [showingCustomerCenter, setShowingCustomerCenter] = useState(false);

  const stats = useMemo(() => computeRealStats(contests, authUser), [contests, authUser]);
  const name = authUser?.name?.trim();
  const displayName = name && name !== "Golfer" ? name : null;
  const initials = displayName?.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "—";
  const netToDate = stats.netToDateCents / 100;
  const amountColor = (amount: number) => Math.round(amount * 100) === 0 ? COLORS.textDim : amount > 0 ? COLORS.primary : COLORS.error;

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
    <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 24, paddingBottom: 28 }}>
          <View style={{ width: 64, height: 64, borderRadius: RADII.full, backgroundColor: COLORS.surfaceHighest, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.primary }}>{initials}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {displayName && (
              <Text style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.text }}>{displayName}</Text>
            )}
            <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>Member since {memberYear}</Text>
            <View testID="profile-plan-badge" accessibilityLabel={`Plan: ${isPro ? "Pro" : "Free"}`} style={{ alignSelf: "flex-start", borderRadius: RADII.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: isPro ? COLORS.primary : COLORS.outline, backgroundColor: COLORS.surface }}>
              <Text style={{ fontFamily: FONTS.semibold, fontSize: 12, color: isPro ? COLORS.primary : COLORS.textDim }}>{isPro ? "Pro" : "Free"}</Text>
            </View>
          </View>
          <AnimatedPressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            testID="profile-settings-gear"
            style={{ width: 44, height: 44, borderRadius: RADII.full, borderWidth: 1, borderColor: COLORS.outline, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" }}
          >
            <Settings size={22} color={COLORS.text} />
          </AnimatedPressable>
        </View>

        <View style={{ marginBottom: 28 }}>
          <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>SCORING</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 12 }}>
            <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 48, color: COLORS.text }}>{hasData ? stats.scoringAvg.toFixed(1) : "—"}</Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textDim }}>Scoring average</Text>
          </View>
          <View style={{ flexDirection: "row", borderWidth: 1, borderColor: COLORS.outline, borderRadius: RADII.md, paddingVertical: 16 }}>
            {[
              { label: "Avg vs par", value: hasData ? `${stats.avgVsPar >= 0 ? "+" : "−"}${Math.abs(stats.avgVsPar).toFixed(1)}` : "—" },
              { label: "Best round", value: hasData ? String(stats.bestRound) : "—" },
              { label: "Rounds played", value: hasData ? String(stats.totalRounds) : "—" },
            ].map((stat) => (
              <View key={stat.label} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 24, color: COLORS.text }}>{stat.value}</Text>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textDim }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 12 }}>ROUND RESULTS</Text>
          {stats.roundResults.length > 0 ? stats.roundResults.map((item) => (
            <AnimatedPressable key={item.id} accessibilityRole="button" onPress={() => router.push(`/contest/${item.id}`)}
              style={{ minHeight: 64, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.outline, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text }}>{item.courseName}</Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>{item.date} · {item.games} · {item.playerCount} players</Text>
              </View>
              <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 18, color: amountColor(item.amount) }}>
                {Math.round(item.amount * 100) === 0 ? "$0.00" : signedRoundAmount(item.amount)}
              </Text>
              <ChevronRight size={18} color={COLORS.textDim} />
            </AnimatedPressable>
          )) : (
            <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim, paddingVertical: 20 }}>Finish a round to see your results here.</Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 18 }}>
            <Text style={{ flex: 1, fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text }}>Net to date</Text>
            <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 18, color: amountColor(netToDate) }}>{netToDate === 0 ? "$0.00" : signedRoundAmount(netToDate)}</Text>
            <View style={{ width: 18 }} />
          </View>
          <AnimatedPressable accessibilityRole="button" onPress={() => router.push("/(tabs)/contests")}
            style={{ minHeight: 52, borderRadius: RADII.md, backgroundColor: COLORS.surfaceHighest, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.primary }}>See all rounds</Text>
          </AnimatedPressable>
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
                ? `${freeRemaining} of 3 free scans left this month`
                : "0 of 3 free scans left this month · Manual entry available"}
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

        {/* ========== PLAYING HISTORY ========== */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              ...TYPOGRAPHY.label,
              color: COLORS.textDim,
              marginBottom: 12,
            }}
          >
            PLAYING HISTORY
          </Text>
          {contests.filter((c) => c.status === "completed").length > 0 ? (
            contests
              .filter((c) => c.status === "completed")
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 10)
              .map((contest) => {
                const allPlayers = contest.groups.flatMap((g) => g.players);
                const gameLabels = contest.games
                  .slice(0, 2)
                  .map((g) => g.replace(/_/g, " "))
                  .join(", ");
                const extra = contest.games.length > 2 ? ` +${contest.games.length - 2}` : "";
                const dateStr = new Date(contest.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <AnimatedPressable
                    key={contest.id}
                    onPress={() => router.push(`/contest/${contest.id}`)}
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
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: RADII.md,
                        backgroundColor: COLORS.primary + "15",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trophy size={18} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: FONTS.semibold,
                          fontSize: 14,
                          color: COLORS.text,
                          marginBottom: 2,
                        }}
                        numberOfLines={1}
                      >
                        {contest.course.name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FONTS.regular,
                          fontSize: 12,
                          color: COLORS.textDim,
                        }}
                        numberOfLines={1}
                      >
                        {gameLabels}{extra} · {allPlayers.length} player{allPlayers.length !== 1 ? "s" : ""} · {dateStr}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={COLORS.textDim} />
                  </AnimatedPressable>
                );
              })
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
                Completed rounds will appear here
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
              {["$3.99/mo", "$24.99/yr"].map((price) => (
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
          { icon: <Settings size={20} color={COLORS.textDim} />, label: "Account settings", onPress: () => router.push("/settings") },
          { icon: <BarChart3 size={20} color={COLORS.textDim} />, label: "Statistics", onPress: () => router.push("/statistics") },
          { icon: <HelpCircle size={20} color={COLORS.textDim} />, label: "Help & Support", onPress: openSupport },
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
    </SafeScreen>
  );
}
