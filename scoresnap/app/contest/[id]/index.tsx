import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { COLORS, scoreColor } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { calcStrokePlay } from "../../../src/engine/calculators/stroke-play";
import { formatToPar } from "../../../src/utils/formatters";

export default function LeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );

  if (!contest) return null;

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const hasScores = allPlayers.some((p) =>
    p.scores.some((s) => s > 0)
  );

  if (!hasScores) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-5xl mb-4">🏌️</Text>
        <Text className="text-text-dim text-base font-semibold text-center">
          No scores yet
        </Text>
        <Text className="text-text-dim text-sm text-center mt-2">
          Enter scores on the Scorecard tab or scan a scorecard to get started.
        </Text>
      </View>
    );
  }

  const results = calcStrokePlay(allPlayers, contest.course);
  const RANK_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze];

  return (
    <ScrollView className="flex-1 px-5 pt-3" showsVerticalScrollIndicator={false}>
      {results.map((r, i) => {
        const player = allPlayers.find((p) => p.id === r.playerId);
        return (
          <View
            key={r.playerId}
            className="flex-row items-center gap-3 rounded-xl p-3.5 mb-2"
            style={{
              backgroundColor: COLORS.card,
              borderColor: i === 0 ? COLORS.gold + "44" : COLORS.border,
              borderWidth: 1,
            }}
          >
            {/* Rank */}
            <View
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{
                backgroundColor:
                  i < 3 ? RANK_COLORS[i] + "22" : COLORS.bg,
              }}
            >
              <Text
                className="text-sm font-extrabold"
                style={{
                  color: i < 3 ? RANK_COLORS[i] : COLORS.textDim,
                }}
              >
                {i + 1}
              </Text>
            </View>

            {/* Player Info */}
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                {player?.team && contest.hasTeams && (
                  <View
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        player.team === "A" ? COLORS.accent : COLORS.blue,
                    }}
                  />
                )}
                <Text className="text-text-primary font-semibold text-sm">
                  {r.name}
                </Text>
              </View>
              <Text className="text-text-dim text-xs mt-0.5">
                F9: {r.front} · B9: {r.back}
              </Text>
            </View>

            {/* Score */}
            <View className="items-end">
              <Text className="text-text-primary text-xl font-extrabold">
                {r.total}
              </Text>
              <Text
                className="text-xs font-semibold"
                style={{
                  color:
                    r.toPar > 0
                      ? COLORS.warn
                      : r.toPar < 0
                      ? COLORS.accent
                      : COLORS.textDim,
                }}
              >
                {formatToPar(r.toPar)}
              </Text>
            </View>
          </View>
        );
      })}
      <View className="h-4" />
    </ScrollView>
  );
}
