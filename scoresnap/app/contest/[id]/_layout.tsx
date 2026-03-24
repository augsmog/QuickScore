import { useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Camera, Edit3 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, RADII } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { AnimatedPressable } from "../../../src/ui/AnimatedPressable";
import LeaderboardScreen from "./index";
import ScorecardScreen from "./scorecard";
import GamesScreen from "./games";
import SettlementScreen from "./settlement";

const TABS = [
  { key: "leaderboard", label: "Leaderboard", Screen: LeaderboardScreen },
  { key: "scorecard", label: "Scorecard", Screen: ScorecardScreen },
  { key: "games", label: "Games", Screen: GamesScreen },
  { key: "settlement", label: "Settlement", Screen: SettlementScreen },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ContestLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const [activeTab, setActiveTab] = useState<TabKey>("leaderboard");

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
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
            Contest Not Found
          </Text>
          <Text style={{ color: COLORS.textDim, fontSize: 14, textAlign: "center", marginBottom: 20 }}>
            This contest may have been deleted or doesn't exist.
          </Text>
          <AnimatedPressable
            onPress={() => router.back()}
            style={{
              backgroundColor: COLORS.accent,
              borderRadius: RADII.md,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>Go Back</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    );
  }

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const ActiveScreen = TABS.find((t) => t.key === activeTab)!.Screen;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <AnimatedPressable
            onPress={() => router.back()}
            style={{
              borderRadius: RADII.sm,
              padding: 8,
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <ChevronLeft size={20} color={COLORS.textDim} />
          </AnimatedPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 18 }}>
              {contest.name}
            </Text>
            <Text style={{ color: COLORS.textDim, fontSize: 13 }}>
              {contest.course.name} · {allPlayers.length} players
            </Text>
          </View>
          {contest.status === "active" && (
            <AnimatedPressable
              onPress={() => router.push(`/contest/${id}/edit` as any)}
              style={{
                borderRadius: RADII.sm,
                padding: 8,
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <Edit3 size={16} color={COLORS.textDim} />
            </AnimatedPressable>
          )}
          <AnimatedPressable
            onPress={() => router.push(`/scan?contestId=${id}`)}
            style={{
              borderRadius: RADII.sm,
              padding: 8,
              backgroundColor: COLORS.accentGlow,
              borderColor: COLORS.accent + "44",
              borderWidth: 1,
            }}
          >
            <Camera size={18} color={COLORS.accent} />
          </AnimatedPressable>
        </View>

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

        {/* Tabs — local state, no URL routing */}
        <View
          style={{
            flexDirection: "row",
            borderRadius: RADII.md,
            padding: 4,
            backgroundColor: COLORS.card,
          }}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => handleTabPress(tab.key)}
              style={{
                flex: 1,
                borderRadius: RADII.sm,
                paddingVertical: 8,
                alignItems: "center",
                backgroundColor:
                  activeTab === tab.key ? COLORS.accentGlow : "transparent",
                borderColor:
                  activeTab === tab.key ? COLORS.accent + "44" : "transparent",
                borderWidth: 1,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: activeTab === tab.key ? COLORS.accent : COLORS.textDim,
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
    </SafeAreaView>
  );
}
