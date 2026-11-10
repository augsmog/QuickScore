import React from "react";
import { View, Text } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { COLORS, FONTS, RADII } from "../ui/theme";
import { formatToPar } from "../utils/formatters";
import { lastThreePlayedHoleChips } from "../ui/leaderboard-hole-strip";
import type { LeaderboardRoundScore } from "../engine/leaderboard-rows";
import type { Player, StrokePlayResult } from "../engine/types";
import type { Contest } from "../stores/contest-store";

type LeaderboardResultsListProps = {
  /** Ranked rows for the active Gross/Net mode (buildLeaderboard output), already sorted. */
  results: StrokePlayResult[];
  /**
   * Optional field-rank lookup keyed by playerId (buildLeaderboardRows output,
   * AUG-675/AUG-735). When provided, each row shows its rank over the FULL field
   * — computed before any search filter — so a searched subset keeps real ranks
   * instead of renumbering 1..n over the visible rows. When omitted, the rank is
   * derived from `results` (unchanged legacy behavior for unfiltered callers).
   */
  rankByPlayerId?: Map<string, {
    rankLabel: string;
    tied: boolean;
    isYou?: boolean;
    thru?: "F" | number | null;
    teeTime?: string | null;
    r1?: LeaderboardRoundScore | null;
    today?: LeaderboardRoundScore | null;
  }>;
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
  const showRoundColumns = Array.from(rankByPlayerId?.values() ?? []).some(
    (row) => Object.prototype.hasOwnProperty.call(row, "r1") || Object.prototype.hasOwnProperty.call(row, "today"),
  );
  const columnsHeader = showRoundColumns ? (
    <View testID="leaderboard-round-columns" style={{
      flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8,
      height: 28, borderBottomWidth: 1, borderBottomColor: COLORS.outline,
    }}>
      <Text style={{ width: 30, fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textDim }}>POS</Text>
      <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textDim }}>PLAYER</Text>
      <Text style={{ width: 44, textAlign: "right", fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textDim }}>TO PAR</Text>
      <Text style={{ width: 58, textAlign: "right", fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textDim }}>THRU</Text>
      <Text style={{ width: 30, textAlign: "right", fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textDim }}>R1</Text>
      <Text style={{ width: 44, textAlign: "right", fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textDim }}>TODAY</Text>
    </View>
  ) : null;
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlashList
        data={results}
        keyExtractor={(r) => r.playerId}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>{ListHeaderComponent}{columnsHeader}</>}
        ListFooterComponent={ListFooterComponent}
        renderItem={({ item: r, index: i }) => {
          const player = allPlayers.find((p) => p.id === r.playerId);
          const holesPlayed = player
            ? player.scores.filter((s) => s > 0).length
            : 0;

          // Prefer the precomputed field rank (survives search filtering); fall back to
          // the legacy inline computation over `results` when no lookup is supplied.
          const ranked = rankByPlayerId?.get(r.playerId);
          // AUG-253j: pinned "You" row. The row model (buildLeaderboardRows + youPlayerId)
          // already moved this row to the front and flagged it; the field rank label below
          // is still the player's real competition rank, so the chip marks "you" without
          // implying you lead. Absent (production default) → no chip, unchanged rows.
          const isYou = ranked?.isYou === true;
          const rowHasRoundColumns = !!ranked && (
            Object.prototype.hasOwnProperty.call(ranked, "r1") ||
            Object.prototype.hasOwnProperty.call(ranked, "today")
          );
          const fallbackRank = results.findIndex((result) => result.total === r.total) + 1;
          const fallbackTied = results.filter((result) => result.total === r.total).length > 1;
          const rankLabel = ranked
            ? ranked.rankLabel
            : fallbackTied
              ? `T${fallbackRank}`
              : `${fallbackRank}`;
          const recentScores = recentPlayers.find((p) => p.id === r.playerId)?.scores ?? [];
          // Par source is the contest course per AUG-620 brief item 8 (contest.course.holes[i].par),
          // not the active-round course; chip pars stay stable regardless of tournament round.
          const lastHoles = lastThreePlayedHoleChips(recentScores, contest.course.holes);

          return (
            <View
              testID={`leaderboard-player-${r.name}`}
              style={rowHasRoundColumns ? {
                backgroundColor: isYou ? COLORS.surfaceHighest : "transparent",
                height: 44,
                paddingHorizontal: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.outline,
              } : {
                backgroundColor: i === 0 ? COLORS.surfaceHigh : COLORS.surfaceMid,
                borderRadius: RADII.lg,
                padding: 14,
                marginBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              {rowHasRoundColumns ? (
                <>
                  <Text style={{ width: 30, fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textDim }}>
                    {rankLabel}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {isYou && (
                      <Text testID={`leaderboard-you-chip-${r.playerId}`} accessibilityLabel="Your row" style={{ fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.primary }}>
                        You
                      </Text>
                    )}
                    <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: isYou ? FONTS.semibold : FONTS.regular, fontSize: 14, color: COLORS.text }}>
                      {isYou ? `— ${r.name}` : r.name}
                    </Text>
                  </View>
                  <Text testID={`leaderboard-topar-${r.name}`} style={{ width: 44, textAlign: "right", fontFamily: FONTS.semibold, fontSize: 16, color: r.toPar < 0 ? COLORS.primary : r.toPar > 0 ? COLORS.error : COLORS.text }}>
                    {formatToPar(r.toPar).replace("-", "−")}
                  </Text>
                  <Text testID={`leaderboard-thru-${r.playerId}`} style={{ width: 58, textAlign: "right", fontFamily: FONTS.medium, fontSize: 12, color: COLORS.text }}>
                    {ranked?.thru === "F" ? "F" : ranked?.thru ?? ranked?.teeTime ?? "—"}
                  </Text>
                  <Text testID={`leaderboard-r1-${r.playerId}`} style={{ width: 30, textAlign: "right", fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textDim }}>
                    {ranked?.r1 == null ? "—" : ranked.r1.total}
                  </Text>
                  <Text testID={`leaderboard-today-${r.playerId}`} style={{ width: 44, textAlign: "right", fontFamily: FONTS.semibold, fontSize: 14, color: ranked?.today && ranked.today.toPar < 0 ? COLORS.primary : ranked?.today && ranked.today.toPar > 0 ? COLORS.error : COLORS.text }}>
                    {ranked?.today == null ? "—" : formatToPar(ranked.today.toPar).replace("-", "−")}
                  </Text>
                </>
              ) : (
                <>
              <Text style={{ width: 28, fontFamily: FONTS.score, fontSize: 14, color: COLORS.textDim }}>
                {rankLabel}
              </Text>

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
                  Total <Text testID={`leaderboard-total-${r.name}`}>{r.total}</Text> · thru {holesPlayed}
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
                </>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}
