import { calculateContestSettlement } from "../../../src/engine/contest-results";
import { useScanStore } from "../../../src/stores/scan-store";
import { canSeeSettlement } from "../../../src/services/entitlements";
import { PaywallTeaser } from "../../../src/ui/PaywallTeaser";
import { RecapCard } from "../../../src/ui/recap/RecapCard";
import { buildRecapModel } from "../../../src/ui/recap/model";
import { LiveShare } from "../../../src/ui/LiveShare";
import { skinsLabel } from "../../../src/engine/calculators/skins";
import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  Alert,
} from "react-native";
import { settlementLeader } from "../../../src/ui/copy";
import { useLocalSearchParams } from "expo-router";
import {
  Share2,
  CheckCircle,
  DollarSign,
  ArrowRight,
  FileText,
  Trophy,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { calculateSettlement } from "../../../src/engine/settlement";
const formatMoney = (amount: number) => `$${Math.abs(amount).toFixed(2)}`;

export default function SettlementScreen() {
  const tier = useScanStore(s => s.tier);
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore(s => s.contests.find(c => c.id === id));
  return canSeeSettlement(tier) ? <SettlementScreenContent /> : <PaywallTeaser feature="Settlement">
    {contest && <Pressable onPress={() => Share.share({message: [contest.name, ...(contest.rounds?.find(r => r.number === contest.currentRound)?.groups ?? contest.groups).flatMap(g => g.players.map(p => `${p.name}: ${p.scores.filter(s => s > 0).join(", ")}`))].join("\n")})}>
      <Text style={{color:COLORS.primary}}>Share results — free</Text>
    </Pressable>}
    {contest && <LiveShare contest={contest} />}
  </PaywallTeaser>;
}

function SettlementScreenContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const [liveUrl, setLiveUrl] = useState<string>();
  const [settledTransactions, setSettledTransactions] = useState<
    Set<number>
  >(new Set());

  if (!contest) return null;

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const hasScores = allPlayers.some((p) => p.scores.some((s) => s > 0));

  if (!hasScores) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          backgroundColor: COLORS.bg,
        }}
      >
        <Text style={{ fontSize: 48, marginBottom: 16 }}>💰</Text>
        <Text
          style={{
            color: COLORS.textDim,
            fontSize: 16,
            fontFamily: FONTS.semibold,
            textAlign: "center",
          }}
        >
          Complete the round to see settlement
        </Text>
      </View>
    );
  }

  const settlement = calculateContestSettlement(contest);
  if (settlement.pending) return <View style={{padding:24}}><Text style={{color:COLORS.text}}>Settlement pending. Confirm every score and required side-game event on every hole before settling. Skip leaves inputs pending.</Text></View>;


  const sortedNet = Object.entries(settlement.netByPlayer).sort(
    ([, a], [, b]) => b - a
  );

  const sessionTotal = sortedNet
    .filter(([, net]) => net > 0)
    .reduce((sum, [, net]) => sum + Math.round(net * 100), 0) / 100;

  // Generate shareable text
  const generateShareText = (): string => {
    const lines: string[] = [];
    lines.push(`🏌️ ${contest.name}`);
    lines.push(`📍 ${contest.course.name}`);
    lines.push(`💰 ${contest.games.length} game${contest.games.length !== 1 ? "s" : ""} at $${contest.betUnit}/unit`);
    lines.push("");
    if (contest.games.some((g) => g === "skins" || g === "skins_carry")) lines.push(skinsLabel(contest.gameConfig));
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
    if (liveUrl && contest.liveShareEnabled) lines.push(liveUrl);
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
  }, [contest, settlement, liveUrl]);

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

  const topWinner = sortedNet[0];
  const runnersUp = sortedNet.slice(1, 3).filter(([, net]) => net > 0);
  const featuredNames = new Set([...(topWinner && topWinner[1] > 0 ? [topWinner[0]] : []), ...runnersUp.map(([name]) => name)]);

  return (
    <ScrollView
      testID="settlement-scroll"
      style={{ flex: 1, minHeight: 0, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {contest.games.some((g) => g === "skins" || g === "skins_carry") && <Text testID="settlement-skins-mode" style={{ color: COLORS.text, marginBottom: 12 }}>{skinsLabel(contest.gameConfig)}</Text>}
      {contest.gameConfig?.rulesVersion !== 1 && <Text style={{color:COLORS.warn,marginBottom:12}}>This contest used rules that were not applied to settlement amounts. Review rules before recalculating. Legacy outcomes are preserved; supported variations apply only to new contests.</Text>}
      {/* ========== NET WINNERS HERO ========== */}
      <View style={{ marginBottom: 24 }}>
        {/* Section header row */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              ...TYPOGRAPHY.headline,
              color: COLORS.text,
            }}
          >
            Net for the Round
          </Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                ...TYPOGRAPHY.labelSm,
                color: COLORS.textDim,
                marginBottom: 2,
              }}
            >
              TOTAL TO SETTLE
            </Text>
            <Text testID="settlement-session-total"
              style={{
                fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                fontSize: 28,
                color: COLORS.primary,
                letterSpacing: -0.5,
              }}
            >
              {formatMoney(sessionTotal)}
            </Text>
          </View>
        </View>

        {/* Top winner — full-width card */}
        {topWinner && topWinner[1] > 0 && (
          <View testID={`settlement-player-${topWinner[0]}`}
            style={{
              backgroundColor: COLORS.surfaceHigh,
              borderRadius: RADII.xl,
              borderLeftWidth: 4,
              borderLeftColor: COLORS.primary,
              padding: 20,
              marginBottom: 12,
              ...GLOW.primary,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                {/* Avatar circle */}
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: RADII.full,
                    backgroundColor: COLORS.primary + "22",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                      fontSize: 20,
                      color: COLORS.primary,
                    }}
                  >
                    {topWinner[0].charAt(0)}
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      ...TYPOGRAPHY.labelSm,
                      color: COLORS.gold,
                      marginBottom: 2,
                    }}
                  >
                    1ST PLACE
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                      fontSize: 18,
                      color: COLORS.text,
                    }}
                  >
                    {topWinner[0]}
                  </Text>
                </View>
              </View>
            </View>
            <Text style={{ textAlign: "center", color: COLORS.text, fontFamily: FONTS.semibold }}>
              {settlementLeader(topWinner[0], contest.status === "completed")}
            </Text>
            <Text testID="settlement-hero-amount"
                style={{
                  textAlign: "center",
                  fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                  fontSize: 32,
                  color: COLORS.primary,
                  letterSpacing: -1,
                }}
              >
                +{formatMoney(topWinner[1])}
              </Text>

          </View>
        )}

        {/* 2nd/3rd place side-by-side */}
        {runnersUp.length > 0 && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            {runnersUp.map(([name, net], idx) => (
              <View
                key={name}
                testID={`settlement-player-${name}`}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.surfaceMid,
                  borderRadius: RADII.lg,
                  padding: 16,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: RADII.full,
                      backgroundColor: COLORS.secondaryContainer,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                        fontSize: 14,
                        color: COLORS.text,
                      }}
                    >
                      {name.charAt(0)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      ...TYPOGRAPHY.labelSm,
                      color: COLORS.textDim,
                    }}
                  >
                    {idx === 0 ? "2ND" : "3RD"}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: FONTS.semibold,
                    fontSize: 14,
                    color: COLORS.text,
                    marginBottom: 4,
                  }}
                >
                  {name}
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                    fontSize: 22,
                    color: COLORS.primary,
                  }}
                >
                  +{formatMoney(net)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Remaining players (losers / even) */}
        {sortedNet.filter(([name]) => !featuredNames.has(name)).map(([name, net]) => (
          <View
            key={name}
            testID={`settlement-player-${name}`}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: 4,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: RADII.full,
                  backgroundColor: COLORS.surfaceHigh,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.medium,
                    fontSize: 12,
                    color: COLORS.textDim,
                  }}
                >
                  {name.charAt(0)}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: FONTS.medium,
                  fontSize: 14,
                  color: COLORS.text,
                }}
              >
                {name}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                fontSize: 18,
                color: net < 0 ? COLORS.error : COLORS.textDim,
              }}
            >
              {net === 0 ? "Even" : `${net < 0 ? "-" : "+"}${formatMoney(net)}`}
            </Text>
          </View>
        ))}
      </View>

      {/* ========== SETTLEMENT LEDGER ========== */}
      {settlement.transactions.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              ...TYPOGRAPHY.headline,
              color: COLORS.text,
              marginBottom: 14,
            }}
          >
            Settlement Ledger
          </Text>

          {settlement.transactions.map((t, i) => {
            const isSettled = settledTransactions.has(i);
            return (
              <View
                key={i}
                style={{
                  backgroundColor: COLORS.surfaceLow,
                  borderRadius: RADII.lg,
                  padding: 16,
                  marginBottom: 10,
                  opacity: isSettled ? 0.6 : 1,
                }}
              >
                {/* Transaction row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    {/* From avatar */}
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: RADII.full,
                        backgroundColor: COLORS.error + "22",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontFamily: FONTS.bold, fontSize: 13, color: COLORS.error }}>
                        {t.from.charAt(0)}
                      </Text>
                    </View>
                    {/* Arrow */}
                    <ArrowRight size={14} color={COLORS.textDim} />
                    {/* To avatar */}
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: RADII.full,
                        backgroundColor: COLORS.primary + "22",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontFamily: FONTS.bold, fontSize: 13, color: COLORS.primary }}>
                        {t.to.charAt(0)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 4 }}>
                      <Text
                        style={{
                          fontFamily: FONTS.medium,
                          fontSize: 14,
                          color: COLORS.text,
                          textDecorationLine: isSettled ? "line-through" : "none",
                        }}
                      >
                        <Text style={{ fontFamily: FONTS.semibold }}>{t.from}</Text>
                        <Text style={{ color: COLORS.textDim }}> owes </Text>
                        <Text style={{ fontFamily: FONTS.semibold }}>{t.to}</Text>
                      </Text>
                      <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                        {t.gameType.replace(/_/g, " ")}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                      fontSize: 18,
                      color: COLORS.primary,
                    }}
                  >
                    {formatMoney(t.amount)}
                  </Text>
                </View>

                {/* Settle-up check */}
                <Pressable
                  onPress={() => toggleSettled(i)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: RADII.md,
                    backgroundColor: isSettled
                      ? COLORS.primary + "22"
                      : COLORS.surfaceHighest,
                    alignSelf: "flex-start",
                  }}
                >
                  <CheckCircle
                    size={14}
                    color={isSettled ? COLORS.primary : COLORS.textDim}
                  />
                  <Text
                    style={{
                      color: isSettled ? COLORS.primary : COLORS.textDim,
                      fontFamily: FONTS.semibold,
                      fontSize: 12,
                    }}
                  >
                    {isSettled ? "Settled" : "Mark Settled"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* ========== GAME DETAILS (horizontal scroll) ========== */}
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            ...TYPOGRAPHY.label,
            color: COLORS.textDim,
            marginBottom: 12,
          }}
        >
          Game Details
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {contest.games.map((gameType, gi) => {
            const gameName = gameType === "skins" || gameType === "skins_carry" ? skinsLabel(contest.gameConfig) : gameType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

            return (
              <View
                key={gi}
                style={{
                  backgroundColor: COLORS.surfaceHighest,
                  borderRadius: RADII.xl,
                  padding: 18,
                  width: 200,
                }}
              >
                {/* Game name badge */}
                <View
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: COLORS.primary + "18",
                    borderRadius: RADII.md,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.semibold,
                      fontSize: 11,
                      color: COLORS.primary,
                    }}
                  >
                    {gameName}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: FONTS.regular,
                    fontSize: 12,
                    color: COLORS.textDim,
                    marginBottom: 4,
                  }}
                >
                  18 Holes
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                    fontSize: 24,
                    color: COLORS.text,
                    marginBottom: 8,
                  }}
                >
                  ${contest.betUnit}/unit
                </Text>
                {/* Leader (first positive net player) */}
                {sortedNet[0] && sortedNet[0][1] > 0 && (
                  <Text
                    style={{
                      fontFamily: FONTS.medium,
                      fontSize: 12,
                      color: COLORS.primary,
                    }}
                  >
                    Leader: {sortedNet[0][0]}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ gap: 12, marginBottom: 24 }}>
        <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>Recap card</Text>
        <RecapCard model={buildRecapModel(settlement, {
          title: contest.name, course: contest.course.name, games: contest.games,
          scorecard: { course: contest.course, players: allPlayers },
          gameConfig: contest.gameConfig, completed: contest.status === "completed",
          liveUrl: contest.liveShareEnabled ? liveUrl : undefined,
        })} />
        <Text style={{ color: COLORS.textDim, fontSize: 12 }}>Screenshot this card to share your round.</Text>
        <LiveShare contest={contest} onLinkChange={setLiveUrl} />
      </View>

      {/* ========== BOTTOM ACTIONS ========== */}
      <View style={{ gap: 12 }}>
        {/* Share Results — primary CTA */}
        <Pressable
          onPress={handleShare}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: COLORS.primary,
            borderRadius: RADII.lg,
            paddingVertical: 16,
            ...GLOW.primary,
          }}
        >
          <Share2 size={18} color={COLORS.onPrimary} />
          <Text
            style={{
              fontFamily: FONTS.bold,
              fontSize: 16,
              color: COLORS.onPrimary,
            }}
          >
            Share Results
          </Text>
        </Pressable>

        {/* Export Scorecard — ghost button */}
        <Pressable
          onPress={handleShare}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 14,
            borderRadius: RADII.lg,
          }}
        >
          <FileText size={16} color={COLORS.primary} />
          <Text
            style={{
              fontFamily: FONTS.semibold,
              fontSize: 14,
              color: COLORS.primary,
            }}
          >
            Export Scorecard (PDF)
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
