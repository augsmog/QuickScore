import { RoundStatusSheet } from "../../../src/ui/RoundStatusSheet";
import { useLiveSharePublisher } from "../../../src/ui/LiveShare";
import { onlineEnabled } from "../../../src/services/cross-device";
import { useOnlineStore } from "../../../src/stores/online-store";
import { useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, Camera, Edit3, Calendar, Flag } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, RADII } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { AnimatedPressable } from "../../../src/ui/AnimatedPressable";
import LeaderboardScreen from "./index";
import ScorecardScreen from "./scorecard";
import GamesScreen from "./games";
import SettlementScreen from "./settlement";

const TABS = [
  { key: "scorecard", label: "Scorecard", Screen: ScorecardScreen },
  { key: "leaderboard", label: "Leaderboard", Screen: LeaderboardScreen },
  { key: "games", label: "Games", Screen: GamesScreen },
  { key: "settlement", label: "Settle up", Screen: SettlementScreen },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ContestLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const remote = useOnlineStore((s) => s.events[id]);
  const [statusOpen, setStatusOpen] = useState(false);
  const closeStatus = useCallback(() => setStatusOpen(false), []);
  const [activeTab, setActiveTab] = useState<TabKey>("scorecard");
  // Live scoreboard keeps publishing while the round is open, sheet open or not.
  useLiveSharePublisher(contest);

  const handleTabPress = useCallback(
    (tabKey: TabKey) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (tabKey === activeTab) return;
      setActiveTab(tabKey);
    },
    [activeTab]
  );

  if (!contest) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Flag size={40} color={COLORS.textDim} style={{ marginBottom: 16 }} />
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
            Contest Not Found
          </Text>
          <Text style={{ color: COLORS.textDim, fontSize: 14, textAlign: "center", marginBottom: 20 }}>
            This contest may have been deleted or doesn't exist.
          </Text>
          <AnimatedPressable
            onPress={() => router.canGoBack() ? router.back() : router.replace("/")}
            style={{
              backgroundColor: COLORS.accent,
              borderRadius: RADII.md,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ color: COLORS.onPrimary, fontWeight: "700", fontSize: 15 }}>Go Back</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    );
  }

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const ActiveScreen = TABS.find((t) => t.key === activeTab)!.Screen;

  return (
    <SafeAreaView testID="contest-screen" style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* Header */}
      <View testID="contest-header" style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={{
              borderRadius: RADII.sm,
              padding: 8,
              minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center",
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <ChevronLeft size={20} color={COLORS.textDim} />
          </AnimatedPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontFamily: FONTS.headline, fontSize: 18 }}>
              {contest.name}
            </Text>
            <Text style={{ color: COLORS.textDim, fontFamily: FONTS.regular, fontSize: 13 }}>
              {contest.course.name} · {allPlayers.length} players
              {contest.isTournament && ` · Round ${contest.currentRound || 1}`}
              {contest.status === "completed" && " · Final"}
            </Text>
          </View>
          {contest.status === "active" && contest.isTournament && (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Rounds"
              onPress={() => router.push(`/contest/${id}/tournament-rounds` as any)}
              style={{
                borderRadius: RADII.sm,
                padding: 8,
                minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center",
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <Calendar size={16} color={COLORS.textDim} />
            </AnimatedPressable>
          )}
          {contest.status === "active" && (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Edit round"
              onPress={() => router.push(`/contest/${id}/edit` as any)}
              style={{
                borderRadius: RADII.sm,
                padding: 8,
                minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center",
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <Edit3 size={16} color={COLORS.textDim} />
              <Text style={{ fontSize: 11, color: COLORS.textDim }}>Edit</Text>
            </AnimatedPressable>
          )}
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Scan scorecard"
            onPress={() => router.push(`/scan?contestId=${id}`)}
            style={{
              borderRadius: RADII.sm,
              padding: 8,
              minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center",
              backgroundColor: COLORS.accentGlow,
              borderColor: COLORS.accent + "44",
              borderWidth: 1,
            }}
          >
            <Camera size={18} color={COLORS.accent} />
            <Text style={{ fontSize: 11, color: COLORS.textDim }}>Scan</Text>
          </AnimatedPressable>
        </View>

        {/* Final rounds keep sharing, join code and sync reachable through the same sheet. */}
        <Pressable
            testID="round-status-chip"
            accessibilityRole="button"
            accessibilityLabel={contest.status === "completed" ? "Share and sync" : "Round status"}
            onPress={() => setStatusOpen(true)}
            style={{ minHeight: 44, borderRadius: RADII.full, backgroundColor: COLORS.surfaceLow,
              flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8,
              paddingHorizontal: 12, marginBottom: 12 }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary }} />
            <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
              {contest.status === "completed"
                ? "Share and sync"
                : onlineEnabled && remote ? "Current online snapshot" : "Saved on this phone"}
            </Text>
            <ChevronRight size={14} color={COLORS.textDim} />
          </Pressable>

        {/* Team Score Banner */}
        {contest.hasTeams && contest.teamAName && contest.teamBName && (
          <View
            style={{
              borderRadius: RADII.md,
              padding: 12,
              flexDirection: "row",
              marginBottom: 12,
              backgroundColor: COLORS.card,
            }}
          >
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: COLORS.accent }}>
                {contest.teamAName}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "800", marginTop: 4 }}>
                {allPlayers
                  .filter((p) => p.team === "A")
                  .reduce((s, p) => s + p.scores.reduce((a, b) => a + b, 0), 0)}
              </Text>
            </View>
            <View style={{ width: 1, marginHorizontal: 8, backgroundColor: COLORS.border }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: COLORS.blue }}>
                {contest.teamBName}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "800", marginTop: 4 }}>
                {allPlayers
                  .filter((p) => p.team === "B")
                  .reduce((s, p) => s + p.scores.reduce((a, b) => a + b, 0), 0)}
              </Text>
            </View>
          </View>
        )}

        {/* Tabs — local state, tonal layering */}
        <View
          style={{
            flexDirection: "row",
            borderRadius: RADII.md,
            padding: 4,
            backgroundColor: COLORS.surfaceLow,
          }}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              testID={`round-tab-${tab.key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.key }}
              onPress={() => handleTabPress(tab.key)}
              style={{
                flex: 1,
                borderRadius: RADII.sm,
                paddingVertical: 12,
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 2,
                alignItems: "center",
                backgroundColor:
                  activeTab === tab.key ? COLORS.surfaceHighest : "transparent",
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  fontSize: 13,
                  fontFamily: FONTS.bold,
                  color: activeTab === tab.key ? COLORS.primary : COLORS.textDim,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Active screen — rendered directly, no Slot/router */}
      <ActiveScreen />
      <RoundStatusSheet contest={contest} visible={statusOpen} onClose={closeStatus} />
    </SafeAreaView>
  );
}
