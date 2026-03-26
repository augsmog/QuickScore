import { useMemo, useState, useRef } from "react";
import { View, Text, ScrollView, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Flag,
  Flame,
  Minus,
} from "lucide-react-native";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW, scoreColor, scoreName } from "../src/ui/theme";
import { AnimatedPressable } from "../src/ui/AnimatedPressable";
import { useContestStore, Contest } from "../src/stores/contest-store";
import { HoleInfo } from "../src/engine/types";

const SCREEN_W = Dimensions.get("window").width;

// ─── Analytics engine ─────────────────────────────────────────

interface RoundData {
  date: string;
  courseName: string;
  scores: number[];
  course: { holes: HoleInfo[] };
  total: number;
  coursePar: number;
  front: number;
  back: number;
}

interface HoleStats {
  avgScore: number;
  par: number;
  birdieOrBetter: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  totalPlayed: number;
}

interface Analytics {
  rounds: RoundData[];
  totalRounds: number;

  // Scoring
  scoringAvg: number;
  bestRound: number;
  worstRound: number;
  avgVsPar: number;
  bestVsPar: number;
  frontAvg: number;
  backAvg: number;

  // Trends (last 5 vs prior 5)
  recentAvg: number;
  priorAvg: number;
  trending: "up" | "down" | "flat";

  // Score distribution
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubles: number;
  triplePlus: number;
  totalHolesPlayed: number;

  // Par-specific averages
  par3Avg: number;
  par4Avg: number;
  par5Avg: number;

  // Streaks
  currentParOrBetterStreak: number;
  bestParOrBetterStreak: number;

  // GIR / Scoring by hole
  holeStats: HoleStats[];

  // Wagering
  totalWon: number;
  totalLost: number;
  netWinnings: number;
  winRate: number;
  gamesPlayed: number;
}

function computeAnalytics(contests: Contest[]): Analytics {
  const completed = contests.filter((c) => c.status === "completed");
  const rounds: RoundData[] = [];

  for (const contest of completed) {
    const coursePar = contest.course.holes.reduce((a, h) => a + h.par, 0);
    for (const group of contest.groups) {
      for (const player of group.players) {
        const playedHoles = player.scores.filter((s) => s > 0);
        if (playedHoles.length >= 9) {
          const total = player.scores.reduce((a, s) => a + s, 0);
          const front = player.scores.slice(0, 9).reduce((a, s) => a + s, 0);
          const back = player.scores.slice(9).reduce((a, s) => a + s, 0);
          rounds.push({
            date: contest.createdAt,
            courseName: contest.course.name,
            scores: [...player.scores],
            course: contest.course,
            total,
            coursePar,
            front,
            back,
          });
        }
      }
    }
  }

  // Sort by date ascending
  rounds.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const n = rounds.length;
  if (n === 0) {
    return {
      rounds: [],
      totalRounds: 0,
      scoringAvg: 0,
      bestRound: 0,
      worstRound: 0,
      avgVsPar: 0,
      bestVsPar: 0,
      frontAvg: 0,
      backAvg: 0,
      recentAvg: 0,
      priorAvg: 0,
      trending: "flat",
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doubles: 0,
      triplePlus: 0,
      totalHolesPlayed: 0,
      par3Avg: 0,
      par4Avg: 0,
      par5Avg: 0,
      currentParOrBetterStreak: 0,
      bestParOrBetterStreak: 0,
      holeStats: [],
      totalWon: 0,
      totalLost: 0,
      netWinnings: 0,
      winRate: 0,
      gamesPlayed: 0,
    };
  }

  const totals = rounds.map((r) => r.total);
  const scoringAvg = totals.reduce((a, b) => a + b, 0) / n;
  const bestRound = Math.min(...totals);
  const worstRound = Math.max(...totals);
  const vsPars = rounds.map((r) => r.total - r.coursePar);
  const avgVsPar = vsPars.reduce((a, b) => a + b, 0) / n;
  const bestVsPar = Math.min(...vsPars);
  const frontAvg = rounds.reduce((a, r) => a + r.front, 0) / n;
  const backAvg = rounds.reduce((a, r) => a + r.back, 0) / n;

  // Trends
  const recent5 = rounds.slice(-5);
  const prior5 = rounds.slice(-10, -5);
  const recentAvg = recent5.length > 0
    ? recent5.reduce((a, r) => a + r.total, 0) / recent5.length
    : scoringAvg;
  const priorAvg = prior5.length > 0
    ? prior5.reduce((a, r) => a + r.total, 0) / prior5.length
    : scoringAvg;
  const trending: "up" | "down" | "flat" =
    recentAvg < priorAvg - 0.5 ? "up" : recentAvg > priorAvg + 0.5 ? "down" : "flat";

  // Score distribution
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0, triplePlus = 0;
  let totalHolesPlayed = 0;
  let par3Total = 0, par3Count = 0;
  let par4Total = 0, par4Count = 0;
  let par5Total = 0, par5Count = 0;

  // Streak tracking
  let currentStreak = 0, bestStreak = 0, tempStreak = 0;

  // Hole-by-hole stats (18 holes) — track cumulative par to handle different courses
  const holeAccum: { totalScore: number; count: number; totalPar: number; bOB: number; parCount: number; bogCount: number; dbCount: number }[] =
    Array.from({ length: 18 }, () => ({ totalScore: 0, count: 0, totalPar: 0, bOB: 0, parCount: 0, bogCount: 0, dbCount: 0 }));

  for (const round of rounds) {
    for (let i = 0; i < 18; i++) {
      const score = round.scores[i];
      const hole = round.course.holes[i];
      if (!score || score <= 0 || !hole) continue;

      totalHolesPlayed++;
      const diff = score - hole.par;

      if (diff <= -2) eagles++;
      else if (diff === -1) birdies++;
      else if (diff === 0) pars++;
      else if (diff === 1) bogeys++;
      else if (diff === 2) doubles++;
      else triplePlus++;

      // Par-specific
      if (hole.par === 3) { par3Total += score; par3Count++; }
      else if (hole.par === 4) { par4Total += score; par4Count++; }
      else if (hole.par === 5) { par5Total += score; par5Count++; }

      // Streaks
      if (diff <= 0) {
        tempStreak++;
        if (tempStreak > bestStreak) bestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }

      // Hole accumulation — sum par per round so avg par adapts across courses
      holeAccum[i].totalScore += score;
      holeAccum[i].count++;
      holeAccum[i].totalPar += hole.par;
      if (diff <= -1) holeAccum[i].bOB++;
      if (diff === 0) holeAccum[i].parCount++;
      if (diff === 1) holeAccum[i].bogCount++;
      if (diff >= 2) holeAccum[i].dbCount++;
    }
  }
  currentStreak = tempStreak;

  const holeStats: HoleStats[] = holeAccum.map((h) => ({
    avgScore: h.count > 0 ? h.totalScore / h.count : 0,
    par: h.count > 0 ? Math.round(h.totalPar / h.count) : 0,
    birdieOrBetter: h.bOB,
    pars: h.parCount,
    bogeys: h.bogCount,
    doublePlus: h.dbCount,
    totalPlayed: h.count,
  }));

  // Wagering — simplified from settlement data
  let totalWon = 0, totalLost = 0, gamesPlayed = 0;
  for (const contest of completed) {
    if (contest.games.length > 0) gamesPlayed++;
    // Basic win/loss tracking from bet units — would need settlement integration for accuracy
  }

  return {
    rounds,
    totalRounds: n,
    scoringAvg,
    bestRound,
    worstRound,
    avgVsPar,
    bestVsPar,
    frontAvg,
    backAvg,
    recentAvg,
    priorAvg,
    trending,
    eagles,
    birdies,
    pars,
    bogeys,
    doubles,
    triplePlus,
    totalHolesPlayed,
    par3Avg: par3Count > 0 ? par3Total / par3Count : 0,
    par4Avg: par4Count > 0 ? par4Total / par4Count : 0,
    par5Avg: par5Count > 0 ? par5Total / par5Count : 0,
    currentParOrBetterStreak: currentStreak,
    bestParOrBetterStreak: bestStreak,
    holeStats,
    totalWon,
    totalLost,
    netWinnings: totalWon - totalLost,
    winRate: gamesPlayed > 0 ? (totalWon / gamesPlayed) * 100 : 0,
    gamesPlayed,
  };
}

// ─── Mini Components ──────────────────────────────────────────

function StatCard({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: "29%",
        backgroundColor: COLORS.surfaceLow,
        borderRadius: RADII.lg,
        borderLeftWidth: 3,
        borderLeftColor: accent || COLORS.primary,
        padding: 14,
      }}
    >
      <Text
        style={{
          fontFamily: FONTS.headline,
          fontSize: 22,
          color: COLORS.text,
          marginBottom: 2,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: FONTS.medium,
          fontSize: 11,
          color: COLORS.textDim,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontSize: 9,
        fontFamily: FONTS.bold,
        color: COLORS.primary,
        letterSpacing: 2,
        textTransform: "uppercase",
        marginTop: 28,
        marginBottom: 10,
        marginLeft: 4,
      }}
    >
      {title}
    </Text>
  );
}

function DistributionBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 10 }}>
      <Text
        style={{
          fontFamily: FONTS.medium,
          fontSize: 12,
          color: COLORS.textDim,
          width: 60,
          textAlign: "right",
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flex: 1,
          height: 20,
          backgroundColor: COLORS.surfaceHigh,
          borderRadius: RADII.sm,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.max(pct, 1)}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: RADII.sm,
          }}
        />
      </View>
      <Text
        style={{
          fontFamily: FONTS.bold,
          fontSize: 12,
          color: COLORS.text,
          width: 32,
          textAlign: "right",
        }}
      >
        {count}
      </Text>
      <Text
        style={{
          fontFamily: FONTS.medium,
          fontSize: 11,
          color: COLORS.textDim,
          width: 38,
          textAlign: "right",
        }}
      >
        {pct.toFixed(0)}%
      </Text>
    </View>
  );
}

function ScoreHistoryChart({ rounds }: { rounds: RoundData[] }) {
  const scrollRef = useRef<ScrollView>(null);
  if (rounds.length < 2) return null;

  const scores = rounds.map((r) => r.total);
  const min = Math.min(...scores) - 2;
  const max = Math.max(...scores) + 2;
  const range = max - min || 1;
  const chartH = 120;
  const DOT_SPACING = 48; // px between data points
  const visibleW = SCREEN_W - 96; // fits inside card padding
  const chartW = Math.max(visibleW, (rounds.length - 1) * DOT_SPACING);
  const stepX = rounds.length > 1 ? chartW / (rounds.length - 1) : chartW;

  // Auto-scroll to end (most recent) after layout
  const handleLayout = () => {
    if (chartW > visibleW && scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: false });
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <View
        style={{
          backgroundColor: COLORS.surfaceLow,
          borderRadius: RADII.lg,
          padding: 16,
          paddingTop: 20,
        }}
      >
        {/* Y-axis labels */}
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: 28, height: chartH, justifyContent: "space-between" }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 9, color: COLORS.textDim }}>{max}</Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 9, color: COLORS.textDim }}>{min}</Text>
          </View>

          {/* Scrollable chart area */}
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={rounds.length > 8}
            onLayout={handleLayout}
            style={{ flex: 1 }}
            contentContainerStyle={{ width: chartW }}
          >
            <View style={{ width: chartW, height: chartH, position: "relative" }}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                <View
                  key={pct}
                  style={{
                    position: "absolute",
                    top: pct * chartH,
                    left: 0,
                    right: 0,
                    height: 1,
                    backgroundColor: COLORS.surfaceHigh,
                  }}
                />
              ))}

              {/* Data points */}
              {scores.map((score, i) => {
                const x = i * stepX;
                const y = ((max - score) / range) * chartH;

                return (
                  <View key={i}>
                    {/* Dot */}
                    <View
                      style={{
                        position: "absolute",
                        left: x - 4,
                        top: y - 4,
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: COLORS.primary,
                        zIndex: 2,
                      }}
                    />
                    {/* Score label — show every dot when spacing allows, otherwise every 2nd/3rd */}
                    {(rounds.length <= 15 || i === 0 || i === scores.length - 1 || i % Math.max(1, Math.floor(rounds.length / 12)) === 0) && (
                      <Text
                        style={{
                          position: "absolute",
                          left: x - 10,
                          top: y - 18,
                          fontFamily: FONTS.bold,
                          fontSize: 9,
                          color: COLORS.primary,
                          width: 24,
                          textAlign: "center",
                        }}
                      >
                        {score}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {/* X-axis labels inside scroll */}
            <View style={{ position: "absolute", bottom: -18, left: 0, width: chartW, flexDirection: "row" }}>
              {rounds.map((r, i) => {
                const showLabel = rounds.length <= 12 || i === 0 || i === rounds.length - 1 || i % Math.max(1, Math.ceil(rounds.length / 8)) === 0;
                if (!showLabel) return null;
                const d = new Date(r.date);
                const x = i * stepX;
                return (
                  <Text
                    key={i}
                    style={{
                      position: "absolute",
                      left: x - 14,
                      width: 28,
                      fontFamily: FONTS.medium,
                      fontSize: 8,
                      color: COLORS.textDim,
                      textAlign: "center",
                    }}
                  >
                    {d.getMonth() + 1}/{d.getDate()}
                  </Text>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Spacer for X-axis labels below the scroll area */}
        <View style={{ height: 18 }} />

        {rounds.length > 8 && (
          <Text style={{ fontFamily: FONTS.medium, fontSize: 9, color: COLORS.textDim, textAlign: "center", marginTop: 4 }}>
            Swipe to see all {rounds.length} rounds
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Main Statistics Screen ───────────────────────────────────

export default function StatisticsScreen() {
  const router = useRouter();
  const contests = useContestStore((s) => s.contests);
  const stats = useMemo(() => computeAnalytics(contests), [contests]);
  const [activeTab, setActiveTab] = useState<"overview" | "scoring" | "holes">("overview");

  const hasData = stats.totalRounds > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 12,
        }}
      >
        <AnimatedPressable onPress={() => router.back()}>
          <ChevronLeft size={26} color={COLORS.text} />
        </AnimatedPressable>
        <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text, flex: 1 }}>Statistics</Text>
      </View>

      {/* Tab pills */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          gap: 8,
          marginBottom: 8,
        }}
      >
        {(["overview", "scoring", "holes"] as const).map((tab) => (
          <AnimatedPressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: RADII.full,
              backgroundColor: activeTab === tab ? COLORS.primary + "22" : COLORS.surfaceLow,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.bold,
                fontSize: 12,
                color: activeTab === tab ? COLORS.primary : COLORS.textDim,
                textTransform: "capitalize",
              }}
            >
              {tab}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {!hasData ? (
          <View
            style={{
              backgroundColor: COLORS.surfaceLow,
              borderRadius: RADII.xl,
              padding: 40,
              alignItems: "center",
              marginTop: 40,
            }}
          >
            <Target size={48} color={COLORS.textDim} />
            <Text
              style={{
                fontFamily: FONTS.headline,
                fontSize: 20,
                color: COLORS.text,
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              No Rounds Yet
            </Text>
            <Text
              style={{
                fontFamily: FONTS.regular,
                fontSize: 14,
                color: COLORS.textDim,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Complete your first round to start tracking your stats. Your scoring trends, score distribution, and hole-by-hole analysis will appear here.
            </Text>
          </View>
        ) : activeTab === "overview" ? (
          <OverviewTab stats={stats} />
        ) : activeTab === "scoring" ? (
          <ScoringTab stats={stats} />
        ) : (
          <HolesTab stats={stats} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────

function OverviewTab({ stats }: { stats: Analytics }) {
  return (
    <>
      {/* Hero Scoring Average */}
      <View
        style={{
          alignItems: "center",
          paddingVertical: 20,
        }}
      >
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: RADII.full,
            backgroundColor: COLORS.primary,
            alignItems: "center",
            justifyContent: "center",
            ...GLOW.primaryStrong,
          }}
        >
          <Text
            style={{
              fontFamily: FONTS.headline,
              fontSize: 38,
              color: COLORS.onPrimary,
              letterSpacing: -2,
            }}
          >
            {Math.round(stats.scoringAvg)}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: FONTS.headlineMedium,
            fontSize: 12,
            color: COLORS.textDim,
            marginTop: 8,
          }}
        >
          SCORING AVERAGE
        </Text>

        {/* Trend indicator */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginTop: 6,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: RADII.full,
            backgroundColor:
              stats.trending === "up"
                ? COLORS.primary + "22"
                : stats.trending === "down"
                ? COLORS.error + "22"
                : COLORS.surfaceHigh,
          }}
        >
          {stats.trending === "up" ? (
            <TrendingDown size={14} color={COLORS.primary} />
          ) : stats.trending === "down" ? (
            <TrendingUp size={14} color={COLORS.error} />
          ) : (
            <Minus size={14} color={COLORS.textDim} />
          )}
          <Text
            style={{
              fontFamily: FONTS.bold,
              fontSize: 11,
              color:
                stats.trending === "up"
                  ? COLORS.primary
                  : stats.trending === "down"
                  ? COLORS.error
                  : COLORS.textDim,
            }}
          >
            {stats.trending === "up"
              ? `${(stats.priorAvg - stats.recentAvg).toFixed(1)} strokes improved`
              : stats.trending === "down"
              ? `${(stats.recentAvg - stats.priorAvg).toFixed(1)} strokes higher`
              : "Holding steady"}
          </Text>
        </View>
      </View>

      {/* Key metrics grid */}
      <SectionLabel title="Key Metrics" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <StatCard value={stats.totalRounds.toString()} label="Rounds" />
        <StatCard
          value={`${stats.avgVsPar >= 0 ? "+" : ""}${stats.avgVsPar.toFixed(1)}`}
          label="Avg vs Par"
          accent={stats.avgVsPar <= 0 ? COLORS.primary : COLORS.warn}
        />
        <StatCard value={stats.bestRound.toString()} label="Best Round" accent={COLORS.gold} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <StatCard value={stats.frontAvg.toFixed(1)} label="Front 9 Avg" />
        <StatCard value={stats.backAvg.toFixed(1)} label="Back 9 Avg" />
        <StatCard
          value={`${stats.bestVsPar >= 0 ? "+" : ""}${stats.bestVsPar}`}
          label="Best vs Par"
          accent={COLORS.gold}
        />
      </View>

      {/* Score history chart */}
      {stats.rounds.length >= 2 && (
        <>
          <SectionLabel title="Score History" />
          <ScoreHistoryChart rounds={stats.rounds} />
        </>
      )}

      {/* Par-specific averages */}
      <SectionLabel title="Scoring by Par" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          { label: "Par 3s", avg: stats.par3Avg, par: 3 },
          { label: "Par 4s", avg: stats.par4Avg, par: 4 },
          { label: "Par 5s", avg: stats.par5Avg, par: 5 },
        ].map((item) => (
          <View
            key={item.label}
            style={{
              flex: 1,
              backgroundColor: COLORS.surfaceLow,
              borderRadius: RADII.lg,
              padding: 14,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.headline,
                fontSize: 24,
                color: item.avg > 0 ? scoreColor(Math.round(item.avg * 10) / 10, item.par) : COLORS.textDim,
              }}
            >
              {item.avg > 0 ? item.avg.toFixed(2) : "—"}
            </Text>
            <Text
              style={{
                fontFamily: FONTS.medium,
                fontSize: 11,
                color: COLORS.textDim,
                marginTop: 4,
              }}
            >
              {item.label}
            </Text>
            {item.avg > 0 && (
              <Text
                style={{
                  fontFamily: FONTS.bold,
                  fontSize: 10,
                  color: item.avg - item.par <= 0 ? COLORS.primary : COLORS.warn,
                  marginTop: 2,
                }}
              >
                {item.avg - item.par >= 0 ? "+" : ""}{(item.avg - item.par).toFixed(2)}
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* Streaks */}
      <SectionLabel title="Streaks" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Flame size={20} color={stats.currentParOrBetterStreak > 0 ? COLORS.gold : COLORS.textDim} />
          <View>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 20, color: COLORS.text }}>
              {stats.currentParOrBetterStreak}
            </Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 10, color: COLORS.textDim }}>
              Current Streak
            </Text>
          </View>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Award size={20} color={COLORS.gold} />
          <View>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 20, color: COLORS.text }}>
              {stats.bestParOrBetterStreak}
            </Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 10, color: COLORS.textDim }}>
              Best Streak
            </Text>
          </View>
        </View>
      </View>
    </>
  );
}

// ─── Scoring Tab ──────────────────────────────────────────────

function ScoringTab({ stats }: { stats: Analytics }) {
  const total = stats.totalHolesPlayed;

  return (
    <>
      <SectionLabel title="Score Distribution" />
      <View
        style={{
          backgroundColor: COLORS.surfaceLow,
          borderRadius: RADII.lg,
          padding: 16,
        }}
      >
        <DistributionBar label="Eagle+" count={stats.eagles} total={total} color={COLORS.gold} />
        <DistributionBar label="Birdie" count={stats.birdies} total={total} color={COLORS.primary} />
        <DistributionBar label="Par" count={stats.pars} total={total} color={COLORS.text} />
        <DistributionBar label="Bogey" count={stats.bogeys} total={total} color={COLORS.warn} />
        <DistributionBar label="Double" count={stats.doubles} total={total} color={COLORS.error} />
        <DistributionBar label="Triple+" count={stats.triplePlus} total={total} color="#ff4444" />
      </View>

      {/* Scoring percentages as big tiles */}
      <SectionLabel title="Scoring Percentages" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <StatCard
          value={total > 0 ? `${(((stats.eagles + stats.birdies) / total) * 100).toFixed(1)}%` : "—"}
          label="Birdie+"
          accent={COLORS.primary}
        />
        <StatCard
          value={total > 0 ? `${((stats.pars / total) * 100).toFixed(1)}%` : "—"}
          label="Par"
          accent={COLORS.text}
        />
        <StatCard
          value={total > 0 ? `${(((stats.doubles + stats.triplePlus) / total) * 100).toFixed(1)}%` : "—"}
          label="Double+"
          accent={COLORS.error}
        />
      </View>

      {/* Scoring summary cards */}
      <SectionLabel title="Round Breakdown" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatCard value={stats.bestRound.toString()} label="Best" accent={COLORS.gold} />
        <StatCard value={Math.round(stats.scoringAvg).toString()} label="Average" />
        <StatCard value={stats.worstRound.toString()} label="Worst" accent={COLORS.error} />
      </View>

      {/* Front 9 vs Back 9 comparison */}
      <SectionLabel title="Front 9 vs Back 9" />
      <View
        style={{
          backgroundColor: COLORS.surfaceLow,
          borderRadius: RADII.lg,
          padding: 16,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 28, color: COLORS.text }}>
              {stats.frontAvg.toFixed(1)}
            </Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textDim }}>
              Front 9
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: COLORS.surfaceHigh, marginHorizontal: 16 }} />
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 28, color: COLORS.text }}>
              {stats.backAvg.toFixed(1)}
            </Text>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textDim }}>
              Back 9
            </Text>
          </View>
        </View>
        <View
          style={{
            backgroundColor: COLORS.surfaceHigh,
            borderRadius: RADII.sm,
            padding: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.textDim }}>
            {stats.frontAvg < stats.backAvg
              ? `Front 9 is ${(stats.backAvg - stats.frontAvg).toFixed(1)} strokes better`
              : stats.backAvg < stats.frontAvg
              ? `Back 9 is ${(stats.frontAvg - stats.backAvg).toFixed(1)} strokes better`
              : "Even on both nines"}
          </Text>
        </View>
      </View>

      {/* Trend over time */}
      {stats.rounds.length >= 2 && (
        <>
          <SectionLabel title="Scoring Trend" />
          <ScoreHistoryChart rounds={stats.rounds} />
        </>
      )}
    </>
  );
}

// ─── Holes Tab ────────────────────────────────────────────────

function HolesTab({ stats }: { stats: Analytics }) {
  const validHoles = stats.holeStats.filter((h) => h.totalPlayed > 0);

  // Find hardest and easiest holes
  const sorted = [...validHoles]
    .map((h, i) => ({ ...h, holeNum: i + 1, diff: h.avgScore - h.par }))
    .sort((a, b) => b.diff - a.diff);
  const hardest = sorted.slice(0, 3);
  const easiest = sorted.slice(-3).reverse();

  return (
    <>
      {/* Hardest / Easiest */}
      <SectionLabel title="Hardest Holes" />
      {hardest.map((h) => (
        <View
          key={h.holeNum}
          style={{
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            padding: 14,
            marginBottom: 6,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: RADII.md,
              backgroundColor: COLORS.error + "22",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Text style={{ fontFamily: FONTS.headline, fontSize: 16, color: COLORS.error }}>
              {h.holeNum}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
              Hole {h.holeNum} — Par {h.par}
            </Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>
              {h.totalPlayed} rounds played
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 18, color: COLORS.error }}>
              {h.avgScore.toFixed(1)}
            </Text>
            <Text style={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.error }}>
              +{h.diff.toFixed(1)}
            </Text>
          </View>
        </View>
      ))}

      <SectionLabel title="Easiest Holes" />
      {easiest.map((h) => (
        <View
          key={h.holeNum}
          style={{
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            padding: 14,
            marginBottom: 6,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: RADII.md,
              backgroundColor: COLORS.primary + "22",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Text style={{ fontFamily: FONTS.headline, fontSize: 16, color: COLORS.primary }}>
              {h.holeNum}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
              Hole {h.holeNum} — Par {h.par}
            </Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>
              {h.totalPlayed} rounds played
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                fontFamily: FONTS.headline,
                fontSize: 18,
                color: h.diff <= 0 ? COLORS.primary : COLORS.text,
              }}
            >
              {h.avgScore.toFixed(1)}
            </Text>
            <Text
              style={{
                fontFamily: FONTS.bold,
                fontSize: 10,
                color: h.diff <= 0 ? COLORS.primary : COLORS.text,
              }}
            >
              {h.diff >= 0 ? "+" : ""}{h.diff.toFixed(1)}
            </Text>
          </View>
        </View>
      ))}

      {/* Full 18-hole breakdown */}
      <SectionLabel title="All 18 Holes" />
      <View
        style={{
          backgroundColor: COLORS.surfaceLow,
          borderRadius: RADII.lg,
          padding: 12,
          overflow: "hidden",
        }}
      >
        {/* Table header */}
        <View style={{ flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceHigh }}>
          <Text style={{ width: 36, fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textDim }}>
            HOLE
          </Text>
          <Text style={{ width: 32, fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textDim, textAlign: "center" }}>
            PAR
          </Text>
          <Text style={{ flex: 1, fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textDim, textAlign: "center" }}>
            AVG
          </Text>
          <Text style={{ width: 36, fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textDim, textAlign: "center" }}>
            +/-
          </Text>
          <Text style={{ width: 50, fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textDim, textAlign: "center" }}>
            DIST
          </Text>
        </View>

        {/* Rows */}
        {stats.holeStats.map((hole, i) => {
          if (hole.totalPlayed === 0) return null;
          const diff = hole.avgScore - hole.par;
          const diffColor = diff <= -0.5 ? COLORS.primary : diff >= 0.5 ? COLORS.error : COLORS.text;
          const total = hole.totalPlayed;

          // Mini bar
          const bPct = total > 0 ? (hole.birdieOrBetter / total) * 100 : 0;
          const pPct = total > 0 ? (hole.pars / total) * 100 : 0;
          const bogPct = total > 0 ? (hole.bogeys / total) * 100 : 0;
          const dblPct = total > 0 ? (hole.doublePlus / total) * 100 : 0;

          return (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                borderBottomWidth: i < 17 ? 1 : 0,
                borderBottomColor: COLORS.surfaceHigh + "55",
              }}
            >
              <Text style={{ width: 36, fontFamily: FONTS.bold, fontSize: 13, color: COLORS.text }}>
                {i + 1}
              </Text>
              <Text style={{ width: 32, fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textDim, textAlign: "center" }}>
                {hole.par}
              </Text>
              <Text style={{ flex: 1, fontFamily: FONTS.headline, fontSize: 14, color: COLORS.text, textAlign: "center" }}>
                {hole.avgScore.toFixed(1)}
              </Text>
              <Text style={{ width: 36, fontFamily: FONTS.bold, fontSize: 11, color: diffColor, textAlign: "center" }}>
                {diff >= 0 ? "+" : ""}{diff.toFixed(1)}
              </Text>
              {/* Mini distribution bar */}
              <View style={{ width: 50, height: 10, flexDirection: "row", borderRadius: 3, overflow: "hidden" }}>
                {bPct > 0 && <View style={{ width: `${bPct}%`, backgroundColor: COLORS.primary }} />}
                {pPct > 0 && <View style={{ width: `${pPct}%`, backgroundColor: COLORS.textDim }} />}
                {bogPct > 0 && <View style={{ width: `${bogPct}%`, backgroundColor: COLORS.warn }} />}
                {dblPct > 0 && <View style={{ width: `${dblPct}%`, backgroundColor: COLORS.error }} />}
              </View>
            </View>
          );
        })}
      </View>

      {/* Legend for mini bars */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 16,
          marginTop: 8,
        }}
      >
        {[
          { label: "Birdie+", color: COLORS.primary },
          { label: "Par", color: COLORS.textDim },
          { label: "Bogey", color: COLORS.warn },
          { label: "Dbl+", color: COLORS.error },
        ].map((item) => (
          <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.color }} />
            <Text style={{ fontFamily: FONTS.medium, fontSize: 9, color: COLORS.textDim }}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}
