import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Minus, Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, scoreColor } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const updateScore = useContestStore((s) => s.updateScore);

  const [currentHole, setCurrentHole] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState(0);

  if (!contest) return null;

  const group = contest.groups[selectedGroup];
  if (!group) return null;

  const par = contest.course.holes[currentHole - 1]?.par || 4;

  const handleScoreChange = useCallback(
    (playerId: string, delta: number) => {
      const player = group.players.find((p) => p.id === playerId);
      if (!player) return;
      const current = player.scores[currentHole - 1] || 0;
      const newScore = Math.max(0, current + delta);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateScore(contest.id, group.id, playerId, currentHole, newScore);
    },
    [contest.id, group.id, currentHole, group.players, updateScore]
  );

  return (
    <View className="flex-1">
      {/* Group Selector (if multiple groups) */}
      {contest.groups.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-5 pt-2 pb-1"
        >
          {contest.groups.map((g, gi) => (
            <Pressable
              key={g.id}
              onPress={() => setSelectedGroup(gi)}
              className="mr-2 rounded-lg px-3 py-1.5"
              style={{
                backgroundColor:
                  gi === selectedGroup ? COLORS.accent : COLORS.card,
                borderColor:
                  gi === selectedGroup ? COLORS.accent : COLORS.border,
                borderWidth: 1,
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{
                  color: gi === selectedGroup ? "#000" : COLORS.textDim,
                }}
              >
                {g.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Hole Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-3 pt-2 pb-3"
      >
        {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => {
          const isActive = hole === currentHole;
          const isFront = hole <= 9;
          return (
            <Pressable
              key={hole}
              onPress={() => {
                setCurrentHole(hole);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="w-10 h-10 rounded-lg items-center justify-center mx-0.5"
              style={{
                backgroundColor: isActive
                  ? COLORS.accent
                  : COLORS.card,
                borderColor: isActive
                  ? COLORS.accent
                  : hole === 10
                  ? COLORS.warn + "44"
                  : COLORS.border,
                borderWidth: isActive ? 0 : 1,
              }}
            >
              <Text
                className="text-sm font-bold"
                style={{
                  color: isActive ? "#000" : COLORS.text,
                }}
              >
                {hole}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Current Hole Info */}
      <View className="items-center mb-4">
        <Text className="text-text-dim text-xs">HOLE {currentHole}</Text>
        <Text className="text-text-primary text-3xl font-extrabold">
          Par {par}
        </Text>
        <Text className="text-text-dim text-xs">
          {contest.course.holes[currentHole - 1]?.yards || ""} yards ·
          HCP {contest.course.holes[currentHole - 1]?.hcp || ""}
        </Text>
      </View>

      {/* Score Entry */}
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {group.players.map((player) => {
          const score = player.scores[currentHole - 1] || 0;
          const diff = score > 0 ? score - par : 0;
          const color = score > 0 ? scoreColor(score, par) : COLORS.textDim;
          const total = player.scores.reduce((a, b) => a + b, 0);

          return (
            <View
              key={player.id}
              className="rounded-xl p-4 mb-3"
              style={{
                backgroundColor: COLORS.card,
                borderColor:
                  score > 0 ? color + "33" : COLORS.border,
                borderWidth: 1,
              }}
            >
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-2">
                  {player.team && contest.hasTeams && (
                    <View
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          player.team === "A" ? COLORS.accent : COLORS.blue,
                      }}
                    />
                  )}
                  <Text className="text-text-primary font-semibold text-sm">
                    {player.name}
                  </Text>
                  <Text className="text-text-dim text-xs">
                    ({player.handicap} hcp)
                  </Text>
                </View>
                {total > 0 && (
                  <Text className="text-text-dim text-xs">
                    Total: {total}
                  </Text>
                )}
              </View>

              <View className="flex-row items-center justify-center gap-5">
                <Pressable
                  onPress={() => handleScoreChange(player.id, -1)}
                  className="w-14 h-14 rounded-2xl items-center justify-center"
                  style={{
                    backgroundColor: COLORS.bg,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                  }}
                >
                  <Minus size={24} color={COLORS.text} />
                </Pressable>

                <View className="items-center min-w-16">
                  <Text
                    className="text-4xl font-extrabold"
                    style={{ color: score > 0 ? color : COLORS.textDim }}
                  >
                    {score || "–"}
                  </Text>
                  {score > 0 && (
                    <Text
                      className="text-xs font-semibold mt-0.5"
                      style={{ color }}
                    >
                      {diff === 0
                        ? "Par"
                        : diff > 0
                        ? `+${diff}`
                        : `${diff}`}
                    </Text>
                  )}
                </View>

                <Pressable
                  onPress={() => handleScoreChange(player.id, 1)}
                  className="w-14 h-14 rounded-2xl items-center justify-center"
                  style={{
                    backgroundColor: COLORS.accent,
                  }}
                >
                  <Plus size={24} color="#000" />
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* Quick Nav */}
        <View className="flex-row gap-3 mt-2 mb-6">
          {currentHole > 1 && (
            <Pressable
              onPress={() => {
                setCurrentHole(currentHole - 1);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="flex-1 rounded-xl py-3 items-center"
              style={{
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <Text className="text-text-dim font-semibold text-sm">
                ← Hole {currentHole - 1}
              </Text>
            </Pressable>
          )}
          {currentHole < 18 && (
            <Pressable
              onPress={() => {
                setCurrentHole(currentHole + 1);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="flex-1 rounded-xl py-3 items-center"
              style={{ backgroundColor: COLORS.blue }}
            >
              <Text className="font-semibold text-sm" style={{ color: "#fff" }}>
                Hole {currentHole + 1} →
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
