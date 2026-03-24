import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW, scoreColor } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { calcStrokePlay } from "../../../src/engine/calculators/stroke-play";
import { formatToPar } from "../../../src/utils/formatters";
import { AnimatedPressable } from "../../../src/ui/AnimatedPressable";

export default function LeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );

  const [viewMode, setViewMode] = useState<"individual" | "groups">("individual");

  if (!contest) return null;

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const hasScores = allPlayers.some((p) =>
    p.scores.some((s) => s > 0)
  );

  if (!hasScores) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: COLORS.bg }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{"🏌\uFE0F"}</Text>
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.textDim, textAlign: "center" }}>
          No scores yet
        </Text>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textDim, textAlign: "center", marginTop: 8 }}>
          Enter scores on the Scorecard tab or scan a scorecard to get started.
        </Text>
      </View>
    );
  }

  const results = calcStrokePlay(allPlayers, contest.course);
  const RANK_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze];

  // Compute team stats if teams exist
  const hasTeams = contest.hasTeams && contest.teamAName && contest.teamBName;
  const teamAPlayers = hasTeams ? allPlayers.filter((p) => p.team === "A") : [];
  const teamBPlayers = hasTeams ? allPlayers.filter((p) => p.team === "B") : [];
  const teamATotal = teamAPlayers.reduce((sum, p) => sum + p.scores.reduce((a, b) => a + b, 0), 0);
  const teamBTotal = teamBPlayers.reduce((sum, p) => sum + p.scores.reduce((a, b) => a + b, 0), 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Contest Header */}
      <Text style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.text, marginBottom: 4 }}>
        {contest.name}
      </Text>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textDim, marginBottom: 16 }}>
        {contest.course.name}
      </Text>

      {/* Individual / Groups toggle */}
      {hasTeams && (
        <View style={{ flexDirection: "row", backgroundColor: COLORS.surfaceLow, borderRadius: RADII.md, padding: 3, marginBottom: 16 }}>
          <AnimatedPressable
            onPress={() => setViewMode("individual")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: RADII.md - 2,
              alignItems: "center",
              backgroundColor: viewMode === "individual" ? COLORS.surfaceHigh : "transparent",
            }}
          >
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 13, color: viewMode === "individual" ? COLORS.text : COLORS.textDim }}>
              INDIVIDUAL
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => setViewMode("groups")}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: RADII.md - 2,
              alignItems: "center",
              backgroundColor: viewMode === "groups" ? COLORS.surfaceHigh : "transparent",
            }}
          >
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 13, color: viewMode === "groups" ? COLORS.text : COLORS.textDim }}>
              GROUPS
            </Text>
          </AnimatedPressable>
        </View>
      )}

      {/* Individual Leaderboard */}
      {viewMode === "individual" && (
        <>
          {results.map((r, i) => {
            const player = allPlayers.find((p) => p.id === r.playerId);
            const holesPlayed = player
              ? player.scores.filter((s) => s > 0).length
              : 0;

            // Determine trend: compare front 9 avg to back 9 avg
            const front9 = player ? player.scores.slice(0, 9).filter((s) => s > 0) : [];
            const back9 = player ? player.scores.slice(9, 18).filter((s) => s > 0) : [];
            const front9Avg = front9.length > 0 ? front9.reduce((a, b) => a + b, 0) / front9.length : 0;
            const back9Avg = back9.length > 0 ? back9.reduce((a, b) => a + b, 0) / back9.length : 0;
            const hasBoth = front9.length > 0 && back9.length > 0;
            const trend = hasBoth ? (back9Avg < front9Avg ? "up" : back9Avg > front9Avg ? "down" : null) : null;

            return (
              <View
                key={r.playerId}
                style={{
                  backgroundColor: i === 0 ? COLORS.surfaceHigh : COLORS.surfaceMid,
                  borderRadius: RADII.lg,
                  padding: 14,
                  marginBottom: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  ...(i === 0 ? GLOW.primary : {}),
                }}
              >
                {/* Rank */}
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: RADII.md,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: i < 3 ? RANK_COLORS[i] + "22" : COLORS.surfaceHighest,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.headline,
                      fontSize: 14,
                      color: i < 3 ? RANK_COLORS[i] : COLORS.textDim,
                    }}
                  >
                    {i + 1}
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
                  </View>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                    thru {holesPlayed}
                  </Text>
                </View>

                {/* Score */}
                <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 8, alignSelf: "center" }}>
                  {trend && (
                    <Text
                      style={{
                        fontFamily: FONTS.bold,
                        fontSize: 12,
                        color: trend === "up" ? COLORS.primary : COLORS.warn,
                      }}
                    >
                      {trend === "up" ? "\u25B2" : "\u25BC"}
                    </Text>
                  )}
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: FONTS.headline, fontSize: 22, color: COLORS.text }}>
                      {r.total}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONTS.semibold,
                        fontSize: 12,
                        color:
                          r.toPar > 0
                            ? COLORS.warn
                            : r.toPar < 0
                            ? COLORS.primary
                            : COLORS.textDim,
                      }}
                    >
                      {formatToPar(r.toPar)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Group Performance (team view) */}
      {viewMode === "groups" && hasTeams && (
        <>
          <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 12 }}>
            GROUP PERFORMANCE
          </Text>

          {/* Team A Card */}
          <View
            style={{
              backgroundColor: COLORS.surfaceHigh,
              borderRadius: RADII.lg,
              padding: 16,
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary }} />
              <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text }}>
                {contest.teamAName}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.primary }}>
                {teamATotal}
              </Text>
            </View>
            {teamAPlayers.map((p) => {
              const pResult = results.find((r) => r.playerId === p.id);
              return (
                <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text }}>
                    {p.name}
                  </Text>
                  <Text style={{ fontFamily: FONTS.headlineMedium, fontSize: 14, color: COLORS.textDim }}>
                    {pResult?.total || 0} ({pResult ? formatToPar(pResult.toPar) : "E"})
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Team B Card */}
          <View
            style={{
              backgroundColor: COLORS.surfaceHigh,
              borderRadius: RADII.lg,
              padding: 16,
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.secondary }} />
              <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text }}>
                {contest.teamBName}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.secondary }}>
                {teamBTotal}
              </Text>
            </View>
            {teamBPlayers.map((p) => {
              const pResult = results.find((r) => r.playerId === p.id);
              return (
                <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text }}>
                    {p.name}
                  </Text>
                  <Text style={{ fontFamily: FONTS.headlineMedium, fontSize: 14, color: COLORS.textDim }}>
                    {pResult?.total || 0} ({pResult ? formatToPar(pResult.toPar) : "E"})
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Group Performance for non-team contests in groups view */}
      {viewMode === "groups" && !hasTeams && (
        <>
          <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 12 }}>
            GROUP PERFORMANCE
          </Text>
          {contest.groups.map((group) => (
            <View
              key={group.id}
              style={{
                backgroundColor: COLORS.surfaceHigh,
                borderRadius: RADII.lg,
                padding: 16,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text, marginBottom: 10 }}>
                {group.name}
              </Text>
              {group.players.map((p) => {
                const pResult = results.find((r) => r.playerId === p.id);
                const holesPlayed = p.scores.filter((s) => s > 0).length;
                return (
                  <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: COLORS.surfaceHighest,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: COLORS.text }}>
                          {p.name[0]?.toUpperCase() || "?"}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text }}>
                        {p.name}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                      <Text style={{ fontFamily: FONTS.headlineMedium, fontSize: 16, color: COLORS.text }}>
                        {pResult?.total || 0}
                      </Text>
                      <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>
                        thru {holesPlayed}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </>
      )}

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
