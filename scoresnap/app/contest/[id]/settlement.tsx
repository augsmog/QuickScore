import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  Alert,
  Linking,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  Share2,
  CheckCircle,
  ExternalLink,
  DollarSign,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { calculateSettlement } from "../../../src/engine/settlement";
import { formatMoney } from "../../../src/utils/formatters";

export default function SettlementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const [settledTransactions, setSettledTransactions] = useState<
    Set<number>
  >(new Set());

  if (!contest) return null;

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const hasScores = allPlayers.some((p) => p.scores.some((s) => s > 0));

  if (!hasScores) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text style={{ fontSize: 48, marginBottom: 16 }}>💰</Text>
        <Text
          style={{
            color: COLORS.textDim,
            fontSize: 16,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
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

  // Generate shareable text
  const generateShareText = (): string => {
    const lines: string[] = [];
    lines.push(`🏌️ ${contest.name}`);
    lines.push(`📍 ${contest.course.name}`);
    lines.push(`💰 ${contest.games.length} game${contest.games.length !== 1 ? "s" : ""} at $${contest.betUnit}/unit`);
    lines.push("");
    lines.push("📊 Results:");

    Object.entries(settlement.netByPlayer)
      .sort(([, a], [, b]) => b - a)
      .forEach(([name, net]) => {
        const emoji =
          net > 0 ? "🟢" : net < 0 ? "🔴" : "⚪";
        const amount =
          net === 0
            ? "Even"
            : `${net > 0 ? "+" : ""}${formatMoney(net)}`;
        lines.push(`${emoji} ${name}: ${amount}`);
      });

    if (settlement.transactions.length > 0) {
      lines.push("");
      lines.push("💸 Transactions:");
      settlement.transactions.forEach((t) => {
        lines.push(`  ${t.from} → ${t.to}: ${formatMoney(t.amount)}`);
      });
    }

    lines.push("");
    lines.push("— via SnapScore ⛳");
    return lines.join("\n");
  };

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const message = generateShareText();
      await Share.share({
        message,
        title: `${contest.name} — Settlement`,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  }, [contest, settlement]);

  const handleSettleVenmo = useCallback(
    (fromName: string, amount: number) => {
      // Venmo deep link: venmo://paycharge?txn=pay&amount=X&note=Y
      const note = encodeURIComponent(
        `${contest.name} - ${contest.course.name}`
      );
      const url = `venmo://paycharge?txn=pay&amount=${amount}&note=${note}`;
      Linking.canOpenURL(url).then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert(
            "Venmo Not Installed",
            "Open Venmo manually to settle up."
          );
        }
      });
    },
    [contest]
  );

  const handleSettleCashApp = useCallback(
    (amount: number) => {
      const note = encodeURIComponent(
        `${contest.name} - ${contest.course.name}`
      );
      const url = `cashapp://cash.app/pay?amount=${amount}&note=${note}`;
      Linking.canOpenURL(url).then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert(
            "Cash App Not Installed",
            "Open Cash App manually to settle up."
          );
        }
      });
    },
    [contest]
  );

  const toggleSettled = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSettledTransactions((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    },
    []
  );

  return (
    <ScrollView
      className="flex-1 px-5 pt-3"
      showsVerticalScrollIndicator={false}
    >
      {/* Winner Celebration Hero */}
      {(() => {
        const sortedNet = Object.entries(settlement.netByPlayer).sort(
          ([, a], [, b]) => b - a
        );
        const [topName, topNet] = sortedNet[0] || ["", 0];
        if (topNet > 0) {
          return (
            <View
              style={{
                backgroundColor: COLORS.accent + "12",
                borderColor: COLORS.accent + "33",
                borderWidth: 1,
                borderRadius: 20,
                padding: 20,
                marginBottom: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 40, marginBottom: 4 }}>🏆</Text>
              <Text
                style={{
                  color: COLORS.accent,
                  fontSize: 36,
                  fontWeight: "800",
                  letterSpacing: -1,
                }}
              >
                +{formatMoney(topNet)}
              </Text>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: 16,
                  fontWeight: "700",
                  marginTop: 4,
                }}
              >
                {topName} cleaned up
              </Text>
              <Text
                style={{
                  color: COLORS.textDim,
                  fontSize: 13,
                  marginTop: 2,
                }}
              >
                Biggest winner this round
              </Text>
            </View>
          );
        }
        return null;
      })()}

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
          <DollarSign size={16} color={COLORS.accent} />
          <Text
            className="font-bold text-sm"
            style={{ color: COLORS.accent }}
          >
            Settlement Summary
          </Text>
        </View>
        <Text style={{ color: COLORS.textDim, fontSize: 12, marginBottom: 12 }}>
          Based on {contest.games.length} active game
          {contest.games.length !== 1 ? "s" : ""} at ${contest.betUnit}
          /unit
        </Text>

        {/* Net positions */}
        {Object.entries(settlement.netByPlayer)
          .sort(([, a], [, b]) => b - a)
          .map(([name, net]) => {
            const player = allPlayers.find((p) => p.name === name);
            return (
              <View
                key={name}
                className="flex-row justify-between items-center py-2.5"
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
                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: 14,
                    }}
                  >
                    {name}
                  </Text>
                </View>
                <Text
                  style={{
                    fontWeight: "800",
                    fontSize: 18,
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
          <Text
            style={{
              color: COLORS.textDim,
              fontSize: 11,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 8,
            }}
          >
            Transactions
          </Text>
          {settlement.transactions.map((t, i) => {
            const isSettled = settledTransactions.has(i);
            return (
              <View
                key={i}
                className="rounded-xl p-3 mb-2"
                style={{
                  backgroundColor: isSettled
                    ? COLORS.accent + "08"
                    : COLORS.card,
                  borderColor: isSettled
                    ? COLORS.accent + "33"
                    : COLORS.border,
                  borderWidth: 1,
                  opacity: isSettled ? 0.7 : 1,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text
                      style={{
                        color: COLORS.text,
                        fontSize: 14,
                        textDecorationLine: isSettled
                          ? "line-through"
                          : "none",
                      }}
                    >
                      <Text style={{ fontWeight: "600" }}>{t.from}</Text>
                      <Text style={{ color: COLORS.textDim }}>
                        {" "}
                        owes{" "}
                      </Text>
                      <Text style={{ fontWeight: "600" }}>{t.to}</Text>
                    </Text>
                    <Text
                      style={{
                        color: COLORS.textDim,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {t.gameType.replace(/_/g, " ")}
                    </Text>
                  </View>
                  <Text
                    className="font-bold text-sm"
                    style={{ color: COLORS.accent, marginRight: 8 }}
                  >
                    {formatMoney(t.amount)}
                  </Text>
                </View>

                {/* Actions row */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 8,
                    paddingTop: 8,
                    borderTopColor: COLORS.border + "44",
                    borderTopWidth: 1,
                  }}
                >
                  {/* Mark as settled */}
                  <Pressable
                    onPress={() => toggleSettled(i)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: isSettled
                        ? COLORS.accent + "22"
                        : COLORS.bg,
                    }}
                  >
                    <CheckCircle
                      size={12}
                      color={isSettled ? COLORS.accent : COLORS.textDim}
                    />
                    <Text
                      style={{
                        color: isSettled
                          ? COLORS.accent
                          : COLORS.textDim,
                        fontSize: 11,
                        fontWeight: "600",
                      }}
                    >
                      {isSettled ? "Settled" : "Mark Settled"}
                    </Text>
                  </Pressable>

                  {/* Venmo link */}
                  <Pressable
                    onPress={() =>
                      handleSettleVenmo(t.from, t.amount)
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: "#3d95ce18",
                    }}
                  >
                    <ExternalLink size={10} color="#3d95ce" />
                    <Text
                      style={{
                        color: "#3d95ce",
                        fontSize: 11,
                        fontWeight: "600",
                      }}
                    >
                      Venmo
                    </Text>
                  </Pressable>

                  {/* Cash App link */}
                  <Pressable
                    onPress={() => handleSettleCashApp(t.amount)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: "#00d64b18",
                    }}
                  >
                    <ExternalLink size={10} color="#00d64b" />
                    <Text
                      style={{
                        color: "#00d64b",
                        fontSize: 11,
                        fontWeight: "600",
                      }}
                    >
                      Cash App
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Action Buttons */}
      <View className="flex-row gap-3 mt-4 mb-6">
        <Pressable
          onPress={handleShare}
          className="flex-1 rounded-xl py-3.5 items-center flex-row justify-center gap-2"
          style={{
            backgroundColor: COLORS.blue,
            shadowColor: COLORS.blue,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
          }}
        >
          <Share2 size={16} color="#fff" />
          <Text
            className="font-bold text-sm"
            style={{ color: "#fff" }}
          >
            Share Results
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
