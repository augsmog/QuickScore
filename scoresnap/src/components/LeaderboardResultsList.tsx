import React from "react";
import { View, Text } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { COLORS, FONTS, RADII } from "../ui/theme";
import { formatToPar } from "../utils/formatters";
import { lastThreePlayedHoleChips } from "../ui/leaderboard-hole-strip";
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
  rankByPlayerId?: Map<
    string,
    { rankLabel: string; tied: boolean; thru?: "F" | number | null; isYou?: boolean }
  >;
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
/**
 * AUG-253k: THRU readout for a leaderboard cell, from the row model's `thru`
 * (`buildLeaderboardRows`): `"F"` when the player has finished, the hole count
 * mid-round, and an em-dash when they have not started (`null`/absent). Kept as
 * a tiny pure helper so the cell never recomputes holes-played itself.
 */
export function formatThru(thru: "F" | number | null | undefined): string {
  if (thru === "F") return "F";
  if (typeof thru === "number") return String(thru);
  return "—";
}

// Fallback THRU for a caller that supplies ranks without `thru` (e.g. older
// tests) or no rank map at all. Mirrors `buildLeaderboardRows`' `computeThru`:
// "F" when every course hole has a score, the played-hole count when partial,
// and null when none are played.
function deriveThru(player: Player | undefined, holeCount: number): "F" | number | null {
  if (!player || holeCount <= 0) return null;
  let played = 0;
  for (let i = 0; i < holeCount; i++) {
    if ((player.scores[i] ?? 0) > 0) played++;
  }
  if (played === 0) return null;
  if (played >= holeCount) return "F";
  return played;
}

export function LeaderboardResultsList({
  results,
  rankByPlayerId,
  allPlayers,
  recentPlayers,
  contest,
  ListHeaderComponent,
  ListFooterComponent,
}: LeaderboardResultsListProps) {
  const holeCount = contest.course.holes.length;
  // AUG-253k: when the screen does not pass a row-model rank map, build the
  // field rank + THRU once in a single O(n) pass here, so renderItem never runs
  // the old per-row `results.findIndex`/`results.filter` recompute (O(n^2) over
  // a 72+ player field). Ranks follow competition rules (ties share the first
  // position, the next distinct total skips): 1, 2, 2, 4.
  const fallbackRanks = rankByPlayerId
    ? null
    : (() => {
        const playerById = new Map<string, Player>();
        for (const p of allPlayers) playerById.set(p.id, p);
        const countByTotal = new Map<number, number>();
        for (const x of results) countByTotal.set(x.total, (countByTotal.get(x.total) ?? 0) + 1);
        const byId = new Map<
          string,
          { rankLabel: string; tied: boolean; thru: "F" | number | null; isYou: boolean }
        >();
        let prevTotal: number | undefined;
        let prevRank = 0;
        for (let i = 0; i < results.length; i++) {
          const x = results[i];
          const rank = i > 0 && x.total === prevTotal ? prevRank : i + 1;
          prevTotal = x.total;
          prevRank = rank;
          const tied = (countByTotal.get(x.total) ?? 0) > 1;
          const player = playerById.get(x.playerId);
          byId.set(x.playerId, {
            rankLabel: tied ? `T${rank}` : `${rank}`,
            tied,
            thru: deriveThru(player, holeCount),
            isYou: false,
          });
        }
        return byId;
      })();
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
          const player = allPlayers.find((p) => p.id === r.playerId);

          // AUG-253k: consume the row model (rankLabel + THRU) instead of
          // recomputing per row. The screen's rank map wins; otherwise the
          // single-pass `fallbackRanks` built above supplies the same values.
          const ranked = rankByPlayerId?.get(r.playerId) ?? fallbackRanks?.get(r.playerId);
          // AUG-253j: pinned "You" row. The row model (buildLeaderboardRows + youPlayerId)
          // already moved this row to the front and flagged it; the field rank label below
          // is still the player's real competition rank, so the chip marks "you" without
          // implying you lead. Absent (production default) → no chip, unchanged rows.
          const isYou = ranked?.isYou === true;
          const rankLabel = ranked?.rankLabel ?? "";
          // THRU from the row model; if a caller passes ranks without `thru`,
          // derive it from the player's scores (same contract as computeThru).
          const thru =
            ranked && ranked.thru !== undefined ? ranked.thru : deriveThru(player, holeCount);
          const recentScores = recentPlayers.find((p) => p.id === r.playerId)?.scores ?? [];
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
              <Text
                testID={`leaderboard-rank-${r.name}`}
                style={{ width: 28, fontFamily: FONTS.score, fontSize: 14, color: COLORS.textDim }}
              >
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
                  Total <Text testID={`leaderboard-total-${r.name}`}>{r.total}</Text> · thru{" "}
                  <Text testID={`leaderboard-thru-${r.name}`}>{formatThru(thru)}</Text>
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
