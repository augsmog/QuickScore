import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Slot, useLocalSearchParams, useRouter, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Camera } from "lucide-react-native";
import { COLORS } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";

const TABS = [
  { key: "index", label: "Leaderboard" },
  { key: "scorecard", label: "Scorecard" },
  { key: "games", label: "Games" },
  { key: "settlement", label: "Settlement" },
] as const;

export default function ContestLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const segments = useSegments();
  // Derive active tab from URL segments instead of local state
  const lastSegment = segments[segments.length - 1];
  const activeTab = ["scorecard", "games", "settlement"].includes(lastSegment || "")
    ? lastSegment!
    : "index";

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
          <Pressable
            onPress={() => router.back()}
            style={{
              backgroundColor: COLORS.accent,
              borderRadius: 14,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const allPlayers = contest.groups.flatMap((g) => g.players);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      {/* Header */}
      <View className="px-5 pt-2 pb-3">
        <View className="flex-row items-center gap-3 mb-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-xl p-2"
            style={{
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <ChevronLeft size={20} color={COLORS.textDim} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-text-primary font-bold text-lg">
              {contest.name}
            </Text>
            <Text className="text-text-dim text-xs">
              {contest.course.name} · {allPlayers.length} players
            </Text>
          </View>
          <Pressable
            onPress={() => router.push(`/scan?contestId=${id}`)}
            className="rounded-xl p-2"
            style={{
              backgroundColor: COLORS.accentGlow,
              borderColor: COLORS.accent + "44",
              borderWidth: 1,
            }}
          >
            <Camera size={18} color={COLORS.accent} />
          </Pressable>
        </View>

        {/* Team Score Banner */}
        {contest.hasTeams && contest.teamAName && contest.teamBName && (
          <View
            className="rounded-xl p-3 flex-row mb-3"
            style={{ backgroundColor: COLORS.card }}
          >
            <View className="flex-1 items-center">
              <Text
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: COLORS.accent }}
              >
                {contest.teamAName}
              </Text>
              <Text className="text-text-primary text-2xl font-extrabold mt-1">
                {allPlayers
                  .filter((p) => p.team === "A")
                  .reduce(
                    (s, p) => s + p.scores.reduce((a, b) => a + b, 0),
                    0
                  )}
              </Text>
            </View>
            <View
              className="w-px mx-2"
              style={{ backgroundColor: COLORS.border }}
            />
            <View className="flex-1 items-center">
              <Text
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: COLORS.blue }}
              >
                {contest.teamBName}
              </Text>
              <Text className="text-text-primary text-2xl font-extrabold mt-1">
                {allPlayers
                  .filter((p) => p.team === "B")
                  .reduce(
                    (s, p) => s + p.scores.reduce((a, b) => a + b, 0),
                    0
                  )}
              </Text>
            </View>
          </View>
        )}

        {/* Tabs */}
        <View
          className="flex-row rounded-xl p-1"
          style={{ backgroundColor: COLORS.card }}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => {
                if (tab.key === "index") {
                  router.replace(`/contest/${id}`);
                } else {
                  router.replace(`/contest/${id}/${tab.key}`);
                }
              }}
              className="flex-1 rounded-lg py-2 items-center"
              style={{
                backgroundColor:
                  activeTab === tab.key ? COLORS.accentGlow : "transparent",
                borderColor:
                  activeTab === tab.key
                    ? COLORS.accent + "44"
                    : "transparent",
                borderWidth: 1,
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{
                  color:
                    activeTab === tab.key ? COLORS.accent : COLORS.textDim,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Slot />
    </SafeAreaView>
  );
}
