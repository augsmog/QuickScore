import { useState } from "react";
import { View, Text, ScrollView, Pressable, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Lock, DollarSign, CheckCircle, Share2, FileText } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { calculateContestSettlement } from "../../../src/engine/contest-results";
import { skinsLabel } from "../../../src/engine/calculators/skins";
import { useScanStore } from "../../../src/stores/scan-store";
import { useContestStore } from "../../../src/stores/contest-store";
import { canSeeSettlement } from "../../../src/services/entitlements";
import { RecapCard } from "../../../src/ui/recap/RecapCard";
import { buildRecapModel } from "../../../src/ui/recap/model";
import { LiveShare } from "../../../src/ui/LiveShare";
import { settlementLeader } from "../../../src/ui/copy";
import { PAYWALL_COPY } from "../../../src/ui/paywall-copy";
import { COLORS, FONTS, TYPOGRAPHY, RADII } from "../../../src/ui/theme";

const formatMoney = (amount: number) => `$${Math.abs(amount).toFixed(2)}`;
const formatNet = (amount: number) => `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatMoney(amount)}`;
const primaryButton = {
  minHeight: 52,
  borderRadius: RADII.full,
  backgroundColor: COLORS.primary,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  flexDirection: "row" as const,
  gap: 8,
  paddingHorizontal: 16,
};
const outlinedButton = {
  ...primaryButton,
  backgroundColor: "transparent",
  borderWidth: 1,
  borderColor: COLORS.border,
};
const sectionLabel = { ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 12 };

export default function SettlementScreen() {
  const tier = useScanStore(s => s.tier);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const contest = useContestStore(s => s.contests.find(c => c.id === id));
  if (canSeeSettlement(tier)) return <SettlementScreenContent />;

  const players = contest
    ? (contest.rounds?.find(r => r.number === contest.currentRound)?.groups ?? contest.groups).flatMap(g => g.players)
    : [];
  return (
    <ScrollView testID="settle-free" style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Lock size={20} color={COLORS.textDim} />
      <Text style={{ fontFamily: FONTS.headline, fontSize: 22, color: COLORS.text }}>Settle up is part of SnapScore Pro.</Text>
      <Text style={{ color: COLORS.textDim, fontSize: 15 }}>See who owes what, game by game, when the round ends.</Text>
      <View style={{ backgroundColor: COLORS.surfaceLow, borderRadius: RADII.lg, padding: 20 }}>
        <Text style={sectionLabel}>SETTLEMENT PREVIEW</Text>
        {players.slice(1, 4).map((player, index) => (
          <View key={index} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 12 }}>
            <Text style={{ color: COLORS.text, flex: 1 }}>{players[0].name} → {player.name}</Text>
            <Text style={{ color: COLORS.textDim }}>$ •••</Text>
          </View>
        ))}
      </View>
      <Pressable testID="settle-free-trial" accessibilityRole="button" onPress={() => router.push('/paywall')} style={primaryButton}>
        <Text style={{ color: COLORS.onPrimary, fontFamily: FONTS.bold, fontSize: 16 }}>Try Pro free for 7 days</Text>
      </Pressable>
      <Text style={{ color: COLORS.textDim, fontSize: 13, textAlign: "center" }}>{PAYWALL_COPY.yearlyRenew}</Text>
      {contest && <>
        <Pressable testID="settle-free-share" accessibilityRole="button" onPress={() => Share.share({ message: [contest.name, ...players.map(p => `${p.name}: ${p.scores.filter(s => s > 0).join(", ")}`)].join("\n") })} style={outlinedButton}>
          <Text style={{ color: COLORS.primary, fontFamily: FONTS.semibold }}>Share results (free)</Text>
        </Pressable>
        <LiveShare contest={contest} />
      </>}
      <Pressable accessibilityRole="link" onPress={() => router.push('/paywall')} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: COLORS.primary }}>See all plans</Text>
      </Pressable>
    </ScrollView>
  );
}

function SettlementScreenContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore(s => s.contests.find(c => c.id === id));
  const [liveUrl, setLiveUrl] = useState<string>();
  const [settledTransactions, setSettledTransactions] = useState<Map<number, string>>(new Map());

  if (!contest) return null;
  const allPlayers = contest.groups.flatMap(g => g.players);
  const hasScores = allPlayers.some(p => p.scores.some(s => s > 0));
  if (!hasScores) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: COLORS.bg, gap: 16 }}>
        <DollarSign size={40} color={COLORS.textDim} />
        <Text style={{ color: COLORS.textDim, fontSize: 16, fontFamily: FONTS.semibold, textAlign: "center" }}>Complete the round to see settlement</Text>
      </View>
    );
  }
  const settlement = calculateContestSettlement(contest);
  if (settlement.pending) return <View style={{padding:24}}><Text style={{color:COLORS.text}}>Settlement pending. Confirm every score and required side-game event on every hole before settling. Skip leaves inputs pending.</Text></View>;

  const sortedNet = Object.entries(settlement.netByPlayer).sort(([, a], [, b]) => b - a);
  const sessionTotal = sortedNet.filter(([, net]) => net > 0).reduce((sum, [, net]) => sum + Math.round(net * 100), 0) / 100;
  const topWinner = sortedNet[0];

  const generateShareText = (): string => {
    const lines = [contest.name, contest.course.name, `${contest.games.length} game${contest.games.length !== 1 ? "s" : ""} at $${contest.betUnit}/unit`, ""];
    if (contest.games.some(g => g === "skins" || g === "skins_carry")) lines.push(skinsLabel(contest.gameConfig));
    lines.push("Results:");
    sortedNet.forEach(([name, net]) => lines.push(`${name}: ${net === 0 ? "Even" : formatNet(net)}`));
    if (settlement.transactions.length > 0) {
      lines.push("", "Transactions:");
      settlement.transactions.forEach(t => lines.push(`  ${t.from} → ${t.to}: ${formatMoney(t.amount)}`));
    }
    lines.push("");
    if (liveUrl && contest.liveShareEnabled) lines.push(liveUrl);
    lines.push("— via SnapScore");
    return lines.join("\n");
  };
  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({ message: generateShareText(), title: `${contest.name} — Settle up` });
    } catch (error) {
      console.error("Share error:", error);
    }
  };
  const toggleSettled = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setSettledTransactions(prev => {
      const next = new Map(prev);
      if (next.has(index)) next.delete(index);
      else next.set(index, time);
      return next;
    });
  };

  return (
    <ScrollView testID="settlement-scroll" style={{ flex: 1, minHeight: 0, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {contest.gameConfig?.rulesVersion !== 1 && <Text style={{color:COLORS.warn,marginBottom:12}}>This contest used rules that were not applied to settlement amounts. Review rules before recalculating. Legacy outcomes are preserved; supported variations apply only to new contests.</Text>}
      <View style={{ backgroundColor: COLORS.surfaceLow, borderRadius: RADII.lg, padding: 20, marginBottom: 24 }}>
        <Text style={sectionLabel}>{contest.status === "completed" ? "ROUND RESULTS · FINAL" : "ROUND RESULTS · LIVE"}</Text>
        {topWinner && <>
          <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>{settlementLeader(topWinner[0], contest.status === "completed")}</Text>
          {topWinner[1] > 0 && <Text testID="settlement-hero-amount" style={{ fontFamily: FONTS.score, fontSize: 32, color: COLORS.primary }}>{formatNet(topWinner[1])}</Text>}
        </>}
        <Text style={{ ...sectionLabel, marginTop: 16 }}>SESSION TOTAL</Text>
        <Text testID="settlement-session-total" style={{ fontFamily: FONTS.score, fontSize: 24, color: COLORS.primary }}>{formatMoney(sessionTotal)}</Text>
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text style={sectionLabel}>WHO OWES WHAT</Text>
        {settlement.transactions.map((t, i) => {
          const settledAt = settledTransactions.get(i);
          return (
            <View key={i} style={{ backgroundColor: COLORS.surfaceLow, borderRadius: RADII.lg, padding: 16, marginBottom: 10, opacity: settledAt ? 0.6 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <Text style={{ flex: 1, color: COLORS.text, fontFamily: FONTS.semibold }}>{t.from} → {t.to}</Text>
                <Text style={{ color: COLORS.text, fontFamily: FONTS.score, fontSize: 18 }}>{formatMoney(t.amount)}</Text>
              </View>
              <Text style={{ color: COLORS.textDim, fontSize: 12, marginBottom: 8 }}>{t.gameType.replace(/_/g, " ")}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={settledAt ? `Unsettle ${t.from} to ${t.to}` : `Mark settled ${t.from} to ${t.to}`} onPress={() => toggleSettled(i)} style={{ ...outlinedButton, minHeight: 44, alignSelf: "flex-start", borderWidth: settledAt ? 0 : 1 }}>
                {settledAt && <CheckCircle size={16} color={COLORS.primary} />}
                <Text style={{ color: settledAt ? COLORS.primary : COLORS.text, fontFamily: FONTS.semibold }}>{settledAt ? `Settled ${settledAt}` : "Mark settled"}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text style={sectionLabel}>NET BY PLAYER</Text>
        {sortedNet.map(([name, net]) => (
          <View key={name} testID={`settlement-player-${name}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 14 }}>
            <Text style={{ flex: 1, color: COLORS.text, fontFamily: FONTS.medium }}>{name}</Text>
            <Text style={{ fontFamily: FONTS.score, fontSize: 18, color: net > 0 ? COLORS.primary : net < 0 ? COLORS.error : COLORS.textDim }}>{net === 0 ? "Even" : formatNet(net)}</Text>
          </View>
        ))}
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text style={sectionLabel}>BY GAME</Text>
        {contest.games.map((gameType, gi) => {
          const isSkins = gameType === "skins" || gameType === "skins_carry";
          const gameName = isSkins ? skinsLabel(contest.gameConfig) : gameType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          return (
            <View key={gi} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, backgroundColor: COLORS.surfaceLow, borderRadius: RADII.lg, padding: 16, marginBottom: 8 }}>
              <Text testID={isSkins ? "settlement-skins-mode" : undefined} style={{ flex: 1, color: COLORS.text, fontFamily: FONTS.semibold }}>{gameName}</Text>
              <View style={{ flex: 1, alignItems: "flex-end", gap: 4 }}>
                <Text style={{ color: COLORS.textDim, fontSize: 12 }}>18 Holes</Text>
                <Text style={{ color: COLORS.text, fontFamily: FONTS.score }}>${contest.betUnit}/unit</Text>
                {topWinner && topWinner[1] > 0 && <Text style={{ color: COLORS.primary, fontSize: 12, textAlign: "right" }}>Leader: {topWinner[0]}</Text>}
              </View>
            </View>
          );
        })}
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

      <View style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={handleShare} style={primaryButton}>
          <Share2 size={18} color={COLORS.onPrimary} />
          <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.onPrimary }}>Share results</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={handleShare} style={outlinedButton}>
          <FileText size={18} color={COLORS.primary} />
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.primary }}>Export scorecard (PDF)</Text>
        </Pressable>
        <Text style={{ color: COLORS.textDim, fontSize: 12, textAlign: "center" }}>SnapScore doesn’t hold or move money. Your group settles up directly.</Text>
      </View>
    </ScrollView>
  );
}
