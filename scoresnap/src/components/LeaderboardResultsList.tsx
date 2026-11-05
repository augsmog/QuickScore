import React from "react";
import { View, Text } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { COLORS, FONTS, RADII } from "../ui/theme";
import { liveRoundCourse } from "../engine/contest-results";
import { formatToPar } from "../utils/formatters";
import type { Player, StrokePlayResult } from "../engine/types";
import type { Contest } from "../stores/contest-store";

type LeaderboardResultsListProps = {
  /** Ranked results from calcStrokePlay (already sorted). Passed to FlashList as data. */
  results: StrokePlayResult[];
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
 * (AUG-253), so the row list is rendered with a FlashList recycler instead of mapping
 * every row into a ScrollView. Rows are pixel-identical to the previous ScrollView
 * implementation; FlashList 2.0.2 (MIT) auto-measures row height, so no fixed height or
 * estimatedItemSize is set.
 */
export function LeaderboardResultsList({
  results,
  allPlayers,
  recentPlayers,
  contest,
  ListHeaderComponent,
  ListFooterComponent,
}: LeaderboardResultsListProps) {
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
          const holesPlayed = player
            ? player.scores.filter((s) => s > 0).length
            : 0;

          const rank = results.findIndex((result) => result.total === r.total) + 1;
          const tied = results.filter((result) => result.total === r.total).length > 1;
          const lastHoles = (recentPlayers.find((p) => p.id === r.playerId)?.scores ?? [])
            .map((score, index) => ({ score, index }))
            .filter(({ score }) => score > 0)
            .slice(-3);

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
              <Text style={{ width: 28, fontFamily: FONTS.score, fontSize: 14, color: COLORS.textDim }}>
                {tied ? `T${rank}` : rank}
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
                  {lastHoles.map(({ score, index }) => {
                    const par = liveRoundCourse(contest).holes[index]?.par;
                    if (par === undefined) return null;
                    const difference = score - par;
                    const filled = difference < 0 || difference >= 2;
                    const color = difference >= 2 ? COLORS.error : COLORS.primary;
                    return (
                      <View key={index} accessibilityLabel={`Hole ${index + 1}: ${score} strokes`}
                        style={{ width: 20, height: 20, borderRadius: difference <= 0 ? 10 : 0,
                          borderWidth: 1, borderColor: color,
                          backgroundColor: filled ? color : "transparent",
                          alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: FONTS.score, fontSize: 11,
                          color: filled ? COLORS.onPrimary : COLORS.text }}>{score}</Text>
                      </View>
                    );
                  })}
                  {Array.from({ length: 3 - lastHoles.length }, (_, index) => (
                    <View key={`empty-${index}`} style={{ width: 20, height: 20 }} />
                  ))}
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
