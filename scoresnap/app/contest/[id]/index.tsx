import { teamCardPlayers, liveRoundCourse } from "../../../src/engine/contest-results";
import { Flag } from "lucide-react-native";
import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { COLORS, FONTS, TYPOGRAPHY, RADII } from "../../../src/ui/theme";
import { useContestStore, getTournamentPlayers, getActiveGroups } from "../../../src/stores/contest-store";
import { calcStrokePlay } from "../../../src/engine/calculators/stroke-play";
import { formatToPar } from "../../../src/utils/formatters";
import { AnimatedPressable } from "../../../src/ui/AnimatedPressable";

export default function LeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );

  const [viewMode, setViewMode] = useState<"individual" | "groups">("individual");
  const [scoreView, setScoreView] = useState<"cumulative" | "daily">("cumulative");

  if (!contest) return null;

  // For tournaments, aggregate scores based on view mode
  let allPlayers;
  if (contest.isTournament && scoreView === "daily" && contest.rounds && contest.currentRound) {
    // Daily view: show only current round scores
    const currentRound = contest.rounds.find((r) => r.number === contest.currentRound);
    allPlayers = currentRound?.groups.flatMap((g) => g.players) || [];
  } else if (contest.isTournament) {
    // Cumulative view: aggregate across all rounds
    allPlayers = getTournamentPlayers(contest);
  } else {
    // Legacy: use groups directly
    allPlayers = contest.groups.flatMap((g) => g.players);
  }

  if(contest.gameConfig?.rulesVersion===1 && contest.games.some(g=>g==="alternate_shot"||g==="chapman"))allPlayers=teamCardPlayers(contest,scoreView === "daily");
  // Recent form always uses actual current-round strokes, never aggregated holes.
  const recentPlayers = contest.gameConfig?.rulesVersion === 1 &&
    contest.games.some((game) => game === "alternate_shot" || game === "chapman")
    ? teamCardPlayers(contest, true)
    : getActiveGroups(contest).flatMap((group) => group.players);
  const hasScores = allPlayers.some((p) =>
    p.scores.some((s) => s > 0)
  );

  if (!hasScores) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: COLORS.bg }}>
        <Flag size={40} color={COLORS.textDim} style={{ marginBottom: 16 }} />
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.textDim, textAlign: "center" }}>
          No scores yet
        </Text>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textDim, textAlign: "center", marginTop: 8 }}>
          Enter scores on the Scorecard tab or scan a scorecard to get started.
        </Text>
      </View>
    );
  }

  const results = calcStrokePlay(allPlayers, scoreView === "daily" ? liveRoundCourse(contest) : contest.course);


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
      {/* Round name and course live in the shared header; tournaments note the day's course here. */}
      {contest.isTournament && (
        <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textDim, marginBottom: 12 }}>
          {(scoreView === "daily" ? liveRoundCourse(contest) : contest.course).name}
        </Text>
      )}

      {/* Tournament: Cumulative / Daily toggle */}
      {contest.isTournament && contest.rounds && contest.rounds.length > 1 && (
        <View style={{ flexDirection: "row", backgroundColor: COLORS.surfaceLow, borderRadius: RADII.md, padding: 3, marginBottom: 16 }}>
          <AnimatedPressable
            onPress={() => setScoreView("cumulative")}
            style={{
              flex: 1,
              paddingVertical: 12,
              minHeight: 44,
              justifyContent: "center",
              borderRadius: RADII.md - 2,
              alignItems: "center",
              backgroundColor: scoreView === "cumulative" ? COLORS.surfaceHigh : "transparent",
            }}
          >
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 13, color: scoreView === "cumulative" ? COLORS.text : COLORS.textDim }}>
              CUMULATIVE
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => setScoreView("daily")}
            style={{
              flex: 1,
              paddingVertical: 12,
              minHeight: 44,
              justifyContent: "center",
              borderRadius: RADII.md - 2,
              alignItems: "center",
              backgroundColor: scoreView === "daily" ? COLORS.surfaceHigh : "transparent",
            }}
          >
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 13, color: scoreView === "daily" ? COLORS.text : COLORS.textDim }}>
              ROUND {contest.currentRound || 1}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      {/* Individual / Groups toggle */}
      {(contest.groups.length > 1 || hasTeams) && (
        <View style={{ flexDirection: "row", backgroundColor: COLORS.surfaceLow, borderRadius: RADII.md, padding: 3, marginBottom: 16 }}>
          <AnimatedPressable
            onPress={() => setViewMode("individual")}
            style={{
              flex: 1,
              paddingVertical: 12,
              minHeight: 44,
              justifyContent: "center",
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
              paddingVertical: 12,
              minHeight: 44,
              justifyContent: "center",
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

            const rank = results.findIndex((result) => result.total === r.total) + 1;
            const tied = results.filter((result) => result.total === r.total).length > 1;
            const lastHoles = (recentPlayers.find((p) => p.id === r.playerId)?.scores ?? [])
              .map((score, index) => ({ score, index }))
              .filter(({ score }) => score > 0)
              .slice(-3);

            return (
              <View
                key={r.playerId}
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
                    Total {r.total} · Thru {holesPlayed}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text testID={`leaderboard-total-${r.name}`}
                    style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 28,
                      color: r.toPar < 0 ? COLORS.primary : r.toPar > 0 ? COLORS.error : COLORS.text }}>
                    {formatToPar(r.toPar).replace("-", "−")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {lastHoles.map(({ score, index }) => {
                      const par = contest.course.holes[index]?.par;
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
              <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 24, color: COLORS.primary }}>
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
                  <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 14, color: COLORS.textDim }}>
                    {pResult?.total || 0} ({pResult ? formatToPar(pResult.toPar).replace("-", "−") : "E"})
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
              <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 24, color: COLORS.secondary }}>
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
                  <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 14, color: COLORS.textDim }}>
                    {pResult?.total || 0} ({pResult ? formatToPar(pResult.toPar).replace("-", "−") : "E"})
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
          {(scoreView === "daily" ? getActiveGroups(contest) : contest.groups).map((group) => (
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
                      <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 16, color: COLORS.text }}>
                        {pResult?.total || 0}
                      </Text>
                      <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>
                        Thru {holesPlayed}
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
