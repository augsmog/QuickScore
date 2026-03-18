import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Share2, Check } from "lucide-react-native";
import { COLORS } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { calculateSettlement } from "../../../src/engine/settlement";
import { formatMoney } from "../../../src/utils/formatters";

export default function SettlementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );

  if (!contest) return null;

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const hasScores = allPlayers.some((p) => p.scores.some((s) => s > 0));

  if (!hasScores) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-5xl mb-4">💰</Text>
        <Text className="text-text-dim text-base font-semibold text-center">
          Complete the round to see settlement
        </Text>
      </View>
    );
  }

  const settlement = calculateSettlement(
    allPlayers,
    contest.course,
    contest.games,
    contest.betUnit
  );

  return (
    <ScrollView className="flex-1 px-5 pt-3" showsVerticalScrollIndicator={false}>
      {/* Summary Card */}
      <View
        className="rounded-2xl p-4 mb-4"
        style={{
          backgroundColor: COLORS.accent + "12",
          borderColor: COLORS.accent + "33",
          borderWidth: 1,
        }}
      >
        <View className="flex-row items-center gap-2 mb-3">
          <Text className="text-base" style={{ color: COLORS.accent }}>
            💰
          </Text>
          <Text
            className="font-bold text-sm"
            style={{ color: COLORS.accent }}
          >
            Settlement Summary
          </Text>
        </View>
        <Text className="text-text-dim text-xs mb-3">
          Based on {contest.games.length} active game
          {contest.games.length !== 1 ? "s" : ""} at ${contest.betUnit}/unit
        </Text>

        {/* Net positions */}
        {Object.entries(settlement.netByPlayer)
          .sort(([, a], [, b]) => b - a)
          .map(([name, net]) => {
            const player = allPlayers.find((p) => p.name === name);
            return (
              <View
                key={name}
                className="flex-row justify-between items-center py-2"
                style={{
                  borderTopColor: COLORS.border + "22",
                  borderTopWidth: 1,
                }}
              >
                <View className="flex-row items-center gap-2">
                  {player?.team && contest.hasTeams && (
                    <View
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          player.team === "A"
                            ? COLORS.accent
                            : COLORS.blue,
                      }}
                    />
                  )}
                  <Text className="text-text-primary text-sm">{name}</Text>
                </View>
                <Text
                  className="font-bold text-base"
                  style={{
                    color:
                      net > 0
                        ? COLORS.accent
                        : net < 0
                        ? COLORS.danger
                        : COLORS.textDim,
                  }}
                >
                  {net > 0 ? "+" : ""}
                  {net === 0 ? "Even" : formatMoney(net)}
                </Text>
              </View>
            );
          })}
      </View>

      {/* Individual Transactions */}
      {settlement.transactions.length > 0 && (
        <View>
          <Text className="text-text-dim text-xs font-semibold uppercase tracking-wider mb-2">
            Transactions
          </Text>
          {settlement.transactions.map((t, i) => (
            <View
              key={i}
              className="rounded-xl p-3 mb-2 flex-row items-center justify-between"
              style={{
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <View className="flex-1">
                <Text className="text-text-primary text-sm">
                  <Text className="font-semibold">{t.from}</Text>
                  <Text className="text-text-dim"> owes </Text>
                  <Text className="font-semibold">{t.to}</Text>
                </Text>
                <Text className="text-text-dim text-xs mt-0.5">
                  {t.gameType.replace(/_/g, " ")}
                </Text>
              </View>
              <Text
                className="font-bold text-sm"
                style={{ color: COLORS.accent }}
              >
                {formatMoney(t.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Action Buttons */}
      <View className="flex-row gap-3 mt-4 mb-6">
        <Pressable
          className="flex-1 rounded-xl py-3 items-center flex-row justify-center gap-2"
          style={{ backgroundColor: COLORS.blue }}
        >
          <Share2 size={16} color="#fff" />
          <Text className="font-bold text-sm" style={{ color: "#fff" }}>
            Share Results
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
