import React from "react";
import { View, Text } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { COLORS, FONTS, RADII } from "../ui/theme";
import { formatToPar } from "../utils/formatters";
import { lastThreePlayedHoleChips } from "../ui/leaderboard-hole-strip";
import type { Player, StrokePlayResult } from "../engine/types";
import type { LeaderboardRow } from "../engine/leaderboard-rows";
import type { Contest } from "../stores/contest-store";

type LeaderboardDisplayRow = StrokePlayResult & Partial<Pick<LeaderboardRow, "rankLabel" | "thru" | "teeTime" | "isYou">>;

type LeaderboardResultsListProps = {
  /** Ranked rows for the active Gross/Net mode (buildLeaderboard output), already sorted. */
  /** Rows enriched with rank, You state, THRU, and tee time before rendering. */
  results: LeaderboardDisplayRow[];
  /**
   * Compatibility for existing callers/tests that hand over raw results and a
   * prepared field-rank lookup. The production contest screen supplies enriched
   * rows directly, avoiding per-cell rank scans.
   */
  rankByPlayerId?: Map<string, { rankLabel: string; tied: boolean; isYou?: boolean }>;
  /** All players in the current view, used to resolve holes played. */
  allPlayers: Player[];
  /** Players whose recent-form strokes drive the last-3-holes strip. */
  recentPlayers: Player[];
  contest: Contest;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
};

/**
 * Virtualized individual leaderboard. Tournament Director events reach 72+ players
 * (AUG-253), so the ranked rows are rendered with a FlashList recycler instead of
 * mapping every row into a ScrollView (AUG-614 / re-cut on current main, AUG-253b).
 * Rows are pixel-identical to the previous ScrollView implementation: the Gross/Net
 * toggle (AUG-607) lives in ListHeaderComponent and the recent-hole strip (AUG-620)
 * is unchanged — chip par comes from the contest course, not the active round course.
 * FlashList 2.0.2 (MIT) auto-measures row height, so no fixed height is set.
 */
export function LeaderboardResultsList({
  results,
  rankByPlayerId,
  allPlayers,
  recentPlayers,
  contest,
  ListHeaderComponent,
  ListFooterComponent,
}: LeaderboardResultsListProps) {
  const playerById = new Map(allPlayers.map((player) => [player.id, player]));
  const recentScoresByPlayerId = new Map(recentPlayers.map((player) => [player.id, player.scores]));
  const scoreCounts = new Map<number, number>();
  for (const result of results) scoreCounts.set(result.total, (scoreCounts.get(result.total) ?? 0) + 1);
  const firstRankByTotal = new Map<number, number>();
  for (let index = 0; index < results.length; index += 1) {
    if (!firstRankByTotal.has(results[index].total)) firstRankByTotal.set(results[index].total, index + 1);
  }
  const fallbackRanks = new Map<string, { rankLabel: string; tied: boolean }>();
  for (const result of results) {
    if (fallbackRanks.has(result.playerId)) continue;
    const rank = firstRankByTotal.get(result.total) ?? 0;
    const tied = (scoreCounts.get(result.total) ?? 0) > 1;
    fallbackRanks.set(result.playerId, { rankLabel: tied ? `T${rank}` : `${rank}`, tied });
  }
  const fallbackThru = new Map<string, "F" | number | null>();
  for (const player of allPlayers) {
    const holes = player.scores.filter((score) => score > 0).length;
    fallbackThru.set(player.id, holes === 0 ? null : holes === contest.course.holes.length ? "F" : holes);
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlashList
        data={results}
        keyExtractor={(r) => r.playerId}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        renderItem={({ item: r, index: i }) => {
          const player = playerById.get(r.playerId);
          const recentScores = recentScoresByPlayerId.get(r.playerId) ?? [];
          const ranked = rankByPlayerId?.get(r.playerId);
          const fallbackRank = fallbackRanks.get(r.playerId);
          const rankLabel = r.rankLabel ?? ranked?.rankLabel ?? fallbackRank?.rankLabel ?? "—";
          // The row model pins You after computing field ranks, so this badge does not
          // imply that the current user leads. Keep the prepared row's field rank intact.
          const isYou = r.isYou === true || ranked?.isYou === true;
          const thru = r.thru === undefined ? fallbackThru.get(r.playerId) ?? null : r.thru;
          const teeTime = r.teeTime ?? null;
          // Par source is the contest course per AUG-620 brief item 8 (contest.course.holes[i].par),
          // not the active-round course; chip pars stay stable regardless of tournament round.
          const lastHoles = lastThreePlayedHoleChips(recentScores, contest.course.holes);

          return (
            <View
              testID={`leaderboard-player-${r.name}`}
              style={{
                backgroundColor: i === 0 ? COLORS.surfaceHigh : COLORS.surfaceMid,
                borderRadius: RADII.lg,
                padding: 14,
                marginBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View style={{ width: 34, alignItems: "center" }}>
                <Text testID={`leaderboard-rank-${r.playerId}`} style={{ fontFamily: FONTS.score, fontSize: 14, color: COLORS.textDim }}>
                  {rankLabel}
                </Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 7, color: COLORS.textDim, marginTop: 2 }}>
                  THRU
                </Text>
                <Text testID={`leaderboard-thru-${r.playerId}`} accessibilityLabel={`THRU ${thru === null ? (teeTime ?? "not started") : thru}`} style={{ fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textDim }}>
                  {thru ?? teeTime ?? "—"}
                </Text>
              </View>

              {/* Avatar initial */}
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: COLORS.surfaceHighest,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: FONTS.bold, fontSize: 14, color: COLORS.text }}>
                  {r.name[0]?.toUpperCase() || "?"}
                </Text>
              </View>

              {/* Player Info */}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {player?.team && contest.hasTeams && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: player.team === "A" ? COLORS.primary : COLORS.secondary,
                      }}
                    />
                  )}
                  <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text }}>
                    {r.name}
                  </Text>
                  {isYou && (
                    <View
                      testID={`leaderboard-you-chip-${r.playerId}`}
                      accessibilityLabel="Your row"
                      style={{
                        backgroundColor: COLORS.primary,
                        borderRadius: RADII.full,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontFamily: FONTS.semibold, fontSize: 11, color: COLORS.onPrimary }}>
                        You
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim, marginTop: 2 }}>
                  Total <Text testID={`leaderboard-total-${r.name}`}>{r.total}</Text>
                </Text>
              </View>

              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text testID={`leaderboard-topar-${r.name}`}
                  style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 28,
                    color: r.toPar < 0 ? COLORS.primary : r.toPar > 0 ? COLORS.error : COLORS.text }}>
                  {formatToPar(r.toPar).replace("-", "−")}
                </Text>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {lastHoles.map(({ score, index, shape, color, filled }) => {
                    const chipColor = color === "error" ? COLORS.error : COLORS.primary;
                    return (
                      <View key={index} testID={`leaderboard-hole-chip-${r.playerId}-${index}`}
                        accessibilityLabel={`Hole ${index + 1}: ${score} strokes`}
                        style={{ width: 20, height: 20, borderRadius: shape === "circle" ? 10 : 0,
                          borderWidth: 1, borderColor: chipColor,
                          backgroundColor: filled ? chipColor : "transparent",
                          alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: FONTS.score, fontSize: 11,
                          color: filled ? COLORS.onPrimary : COLORS.text }}>{score}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
