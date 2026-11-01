import { useStore } from "zustand";
import { settlementMarks } from "../../../src/stores/settlement-store";
import { settlementRevision, settlementScope, settlementTransactionKeys } from "../../../src/stores/settlement-marks";
import { getPackages, waitForPurchaseIdentity, isPurchaseIdentityCurrent } from "../../../src/services/purchases";
import { eligibleAnnualTrials, buildPaywallView } from "../../../src/services/paywall-plans";
import { buildScorecardPdf } from "../../../src/services/scorecard-pdf";
import { shareScorecardPdf } from "../../../src/services/share-scorecard-pdf";
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Lock, DollarSign, CheckCircle, Share2, FileText } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { calculateContestSettlement } from "../../../src/engine/contest-results";
import { skinsLabel } from "../../../src/engine/calculators/skins";
import { useAuthStore } from "../../../src/stores/auth-store";
import { useScanStore } from "../../../src/stores/scan-store";
import { type Contest, useContestStore } from "../../../src/stores/contest-store";
import { canSeeSettlement } from "../../../src/services/entitlements";
import { RecapCard } from "../../../src/ui/recap/RecapCard";
import { buildRecapModel } from "../../../src/ui/recap/model";
import { LiveShare } from "../../../src/ui/LiveShare";
import { settlementLeader } from "../../../src/ui/copy";
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
  const accountId = useAuthStore(s => s.user?.id ?? null);
  const isAnonymous = useAuthStore(s => s.isAnonymous);
  const authReady = useAuthStore(s => s.isInitialized && !s.isLoading);
  const purchaseActor = isAnonymous ? null : accountId;
  const [trialOffer, setTrialOffer] = useState<{
    accountId: string | null; isAnonymous: boolean; revision: number; billed: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    setTrialOffer(null);
    if (authReady && !canSeeSettlement(tier)) {
      (async () => {
        try {
          const revision = await waitForPurchaseIdentity(purchaseActor);
          if (!live || revision === null) return;
          const packages = await getPackages();
          const annual = packages.annual;
          // Unlike the paywall's browsing rows, a trial promise must not use a fallback price.
          if (!live || annual?.identifier !== '$rc_annual' || annual.packageType !== 'ANNUAL' ||
              annual.product.subscriptionPeriod !== 'P1Y' || !annual.product.identifier ||
              !Number.isFinite(annual.product.price) || annual.product.price <= 0 ||
              typeof annual.product.currencyCode !== 'string' || !annual.product.currencyCode.trim() ||
              typeof annual.product.priceString !== 'string' || !annual.product.priceString.trim()) return;
          const eligible = await eligibleAnnualTrials(packages);
          if (live && isPurchaseIdentityCurrent(revision, purchaseActor) && eligible[annual.product.identifier] === true) {
            const view = buildPaywallView(packages, eligible, tier, { tier: 'pro', period: 'year' });
            setTrialOffer({ accountId, isAnonymous, revision, billed: view.billed });
          }
        } catch { /* Keep the existing plans path when purchases are unavailable. */ }
      })();
    }
    return () => { live = false; };
  }, [tier, accountId, isAnonymous, authReady, purchaseActor]);
  const trialAvailable = authReady && trialOffer !== null && trialOffer.accountId === accountId &&
    trialOffer.isAnonymous === isAnonymous && isPurchaseIdentityCurrent(trialOffer.revision, purchaseActor);
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
      {trialAvailable && <>
      <Pressable testID="settle-free-trial" accessibilityRole="button" onPress={() => router.push('/paywall')} style={primaryButton}>
        <Text style={{ color: COLORS.onPrimary, fontFamily: FONTS.bold, fontSize: 16 }}>Try Pro free for 7 days</Text>
      </Pressable>
      <Text style={{ color: COLORS.textDim, fontSize: 13, textAlign: "center" }}>{trialOffer?.billed}</Text>
      </>}
      {contest && <>
        <Pressable testID="settle-free-share" accessibilityRole="button" onPress={() => Share.share({ message: [contest.name, ...(contest.rounds?.find(r => r.number === contest.currentRound)?.groups ?? contest.groups).flatMap(g => g.players.map(p => `${p.name}: ${p.scores.filter(s => s > 0).join(", ")}`))].join("\n") })} style={outlinedButton}>
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
  const accountId = useAuthStore(s => s.user?.id ?? s.remoteUserId ?? null);
  const scope = settlementScope(accountId, id);
  const ready = useStore(settlementMarks, s => s.ready);
  const ledger = useStore(settlementMarks, s => s.ledgers[scope]);

  if (!contest) return null;
  const allPlayers = contest.groups.flatMap(g => g.players);
  const hasScores = allPlayers.some(p => p.scores.some(s => s > 0));
  if (!hasScores && contest.gameConfig?.rulesVersion !== 1) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: COLORS.bg, gap: 16 }}>
        <DollarSign size={40} color={COLORS.textDim} />
        <Text style={{ color: COLORS.textDim, fontSize: 16, fontFamily: FONTS.semibold, textAlign: "center" }}>Complete the round to see settlement</Text>
      </View>
    );
  }
  const settlement = calculateContestSettlement(contest);
  const revision = settlementRevision(contest);
  const transactionKeys = settlementTransactionKeys(settlement.transactions);
  if (settlement.pending) return (
    <ScrollView testID="settlement-pending" style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 24, gap: 24 }}>
      <Text style={{color:COLORS.text}}>Settlement pending. Confirm every score and required side-game event on every hole before settling. Skip leaves inputs pending.</Text>
      <SettlementByGame contest={contest} />
    </ScrollView>
  );

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
  const handleExport = async () => {
    const rounds = contest.isTournament && contest.rounds?.length ? contest.rounds
      : [{ course: contest.course, groups: contest.groups, date: contest.createdAt }];
    const lines = [contest.name];
    for (const round of rounds) {
      const course = round.course ?? contest.course;
      lines.push(course.name, round.date ?? contest.createdAt);
      for (const group of round.groups) for (const player of group.players) {
        lines.push(player.name);
        // Split the table into nine-hole blocks to keep every column readable.
        for (let start = 0; start < course.holes.length; start += 9) {
          lines.push(course.holes.slice(start, start + 9).map(h => String(h.num).padStart(6)).join(""));
          lines.push(course.holes.slice(start, start + 9).map((_, i) => String(player.scores[start + i] || "—").padStart(6)).join(""));
        }
        lines.push(String(player.scores.reduce((sum, score) => sum + score, 0)));
      }
    }
    lines.push(...generateShareText().split("\n"));
    try { await shareScorecardPdf(buildScorecardPdf(lines)); }
    catch (error) { console.error("Share error:", error); }
  };
  const toggleSettled = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    settlementMarks.getState().toggle(scope, contest.id, revision, key);
  };

  return (
    <ScrollView testID="settlement-scroll" style={{ flex: 1, minHeight: 0, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {contest.gameConfig?.rulesVersion !== 1 && <Text style={{color:COLORS.warn,marginBottom:12}}>This contest used rules that were not applied to settlement amounts. Review rules before recalculating. Legacy outcomes are preserved; supported variations apply only to new contests.</Text>}
      <View style={{ backgroundColor: COLORS.surfaceLow, borderRadius: RADII.lg, padding: 20, marginBottom: 24 }}>
        <Text style={sectionLabel}>{contest.status === "completed" ? "ROUND RESULTS · FINAL" : "ROUND RESULTS · LIVE"}</Text>
        {topWinner && topWinner[1] > 0 ? <>
          <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>{settlementLeader(topWinner[0], contest.status === "completed")}</Text>
          <Text testID="settlement-hero-amount" style={{ fontFamily: FONTS.score, fontSize: 32, color: COLORS.primary }}>{formatNet(topWinner[1])}</Text>
        </> : topWinner && <Text testID="settlement-all-even" style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>Everyone is even</Text>}
        <Text style={{ ...sectionLabel, marginTop: 16 }}>TOTAL TO SETTLE</Text>
        <Text testID="settlement-session-total" style={{ fontFamily: FONTS.score, fontSize: 24, color: COLORS.primary }}>{formatMoney(sessionTotal)}</Text>
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text style={sectionLabel}>WHO OWES WHAT</Text>
        {settlement.transactions.map((t, i) => {
          const transactionKey = transactionKeys[i];
          const timestamp = ledger?.revision === revision ? ledger.marks[transactionKey] : undefined;
          const settledAt = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : undefined;
          return (
            <View key={transactionKey} style={{ backgroundColor: COLORS.surfaceLow, borderRadius: RADII.lg, padding: 16, marginBottom: 10, opacity: settledAt ? 0.6 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <Text style={{ flex: 1, color: COLORS.text, fontFamily: FONTS.semibold }}>{t.from} → {t.to}</Text>
                <Text style={{ color: COLORS.text, fontFamily: FONTS.score, fontSize: 18 }}>{formatMoney(t.amount)}</Text>
              </View>
              <Text style={{ color: COLORS.textDim, fontSize: 12, marginBottom: 8 }}>{t.gameType.replace(/_/g, " ")}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={settledAt ? `Unsettle ${t.from} to ${t.to}` : `Mark settled ${t.from} to ${t.to}`} disabled={!ready || accountId === null} onPress={() => toggleSettled(transactionKey)} style={{ ...outlinedButton, minHeight: 44, alignSelf: "flex-start", borderWidth: settledAt ? 0 : 1 }}>
                {settledAt && <CheckCircle size={16} color={COLORS.primary} />}
                <Text style={{ color: settledAt ? COLORS.primary : COLORS.text, fontFamily: FONTS.semibold }}>{settledAt ? `Settled ${settledAt}` : "Mark settled"}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text style={sectionLabel}>Net for the Round</Text>
        {sortedNet.map(([name, net]) => (
          <View key={name} testID={`settlement-player-${name}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 14 }}>
            <Text style={{ flex: 1, color: COLORS.text, fontFamily: FONTS.medium }}>{name}</Text>
            <Text style={{ fontFamily: FONTS.score, fontSize: 18, color: net > 0 ? COLORS.primary : net < 0 ? COLORS.error : COLORS.textDim }}>{net === 0 ? "Even" : formatNet(net)}</Text>
          </View>
        ))}
      </View>

      <SettlementByGame contest={contest} />

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
        <Pressable accessibilityRole="button" onPress={handleExport} style={outlinedButton}>
          <FileText size={18} color={COLORS.primary} />
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.primary }}>Export scorecard (PDF)</Text>
        </Pressable>
        <Text style={{ color: COLORS.textDim, fontSize: 12, textAlign: "center" }}>SnapScore doesn’t hold or move money. Your group settles up directly.</Text>
      </View>
    </ScrollView>
  );
}

/** Match the engine's scope: versioned tournaments settle all constituent rounds,
 * while legacy contests use the stored aggregate card. Group repeated IDs but pass
 * all occurrences: legacy cent allocation batches same-game transactions together.
 */
function SettlementByGame({ contest }: { contest: Contest }) {
  const rounds = contest.gameConfig?.rulesVersion === 1 && contest.isTournament && contest.rounds?.length
    ? contest.rounds
    : [{ course: contest.course, groups: contest.groups }];
  const holeCount = rounds.reduce((total, round) => total + (round.course ?? contest.course).holes.length, 0);
  // The engine adds round-only names only when they transact. Keep tied/pending
  // participants visible too, without changing its name-keyed ledger contract.
  const players = rounds.flatMap(round => round.groups.flatMap(group => group.players));
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={sectionLabel}>BY GAME</Text>
      {[...new Set(contest.games)].map((gameType, gi) => {
        const result = calculateContestSettlement(contest, contest.games.filter(game => game === gameType));
        const netByPlayer = { ...Object.fromEntries(players.map(player => [player.name, 0])), ...result.netByPlayer };
        const isSkins = gameType === "skins" || gameType === "skins_carry";
        const gameName = isSkins ? skinsLabel(contest.gameConfig) : gameType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        return (
          <View key={`${gameType}-${gi}`} testID={`settlement-game-${gi}`} style={{ gap: 12, backgroundColor: COLORS.surfaceLow, borderRadius: RADII.lg, padding: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <Text testID={isSkins ? "settlement-skins-mode" : undefined} style={{ flex: 1, color: COLORS.text, fontFamily: FONTS.semibold }}>{gameName}</Text>
              <Text style={{ color: COLORS.textDim, fontSize: 12 }}>{holeCount} Holes</Text>
            </View>
            {Object.entries(netByPlayer).sort(([, a], [, b]) => b - a).map(([name, net]) => (
              <View key={name} testID={`settlement-game-${gi}-player-${name}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <Text style={{ flex: 1, color: COLORS.text, fontFamily: FONTS.medium }}>{name}</Text>
                <Text style={{ fontFamily: FONTS.score, color: result.pending ? COLORS.textDim : net > 0 ? COLORS.primary : net < 0 ? COLORS.error : COLORS.textDim }}>{result.pending ? "Pending" : net === 0 ? "Even" : formatNet(net)}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
