import { teamCardPlayers, liveRoundCourse } from "../../../src/engine/contest-results";
import { Flag } from "lucide-react-native";
import { useState } from "react";
import { View, Text, ScrollView, TextInput } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { COLORS, FONTS, TYPOGRAPHY, RADII } from "../../../src/ui/theme";
import { useContestStore, getTournamentPlayers, getActiveGroups } from "../../../src/stores/contest-store";
import { calcStrokePlay } from "../../../src/engine/calculators/stroke-play";
import { buildLeaderboard } from "../../../src/engine/calculators/leaderboard-view";
import { buildLeaderboardRows } from "../../../src/engine/leaderboard-rows";
import { getFixtureYouPlayerId } from "../../../src/engine/you-fixture";
import { formatToPar } from "../../../src/utils/formatters";
import { AnimatedPressable } from "../../../src/ui/AnimatedPressable";
import { useOnlineStore } from "../../../src/stores/online-store";
import { LeaderboardResultsList } from "../../../src/components/LeaderboardResultsList";

export default function LeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );

  const [viewMode, setViewMode] = useState<"individual" | "groups">("individual");
  const [scoreView, setScoreView] = useState<"cumulative" | "daily">("cumulative");
  const [rankMode, setRankMode] = useState<"gross" | "net">("gross");
  // AUG-735 (AUG-253g): case-insensitive name search over the individual field.
  const [playerQuery, setPlayerQuery] = useState("");
  const [myGroupOnly, setMyGroupOnly] = useState(false);
  const membership = useOnlineStore((s) => s.events[id ?? ""]?.membership);

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

  const leaderboardCourse = scoreView === "daily" ? liveRoundCourse(contest) : contest.course;
  const results = calcStrokePlay(allPlayers, leaderboardCourse);
  // Gross/Net toggle (AUG-246c): gross is the default and identical to before.
  // Net ranks the individual leaderboard by net total using the handicap strokes
  // already entered for net games; it is only offered when the course supports it.
  const { rows: individualResults, netAvailable, mode: effectiveRankMode } = buildLeaderboard(allPlayers, leaderboardCourse, rankMode);

  // R1 / Today are only meaningful for multi-round tournaments. Keep the
  // single-round row model untouched; for tournaments, calculate each round
  // with its own course and the active Gross/Net mode.
  const roundView = contest.isTournament && (contest.rounds?.length ?? 0) > 1
    ? (() => {
        const rounds = contest.rounds ?? [];
        const roundPlayers = (round: (typeof rounds)[number]) => {
          const roundContest = { ...contest, rounds: [round], currentRound: round.number };
          const usesTeamCards = contest.gameConfig?.rulesVersion === 1 &&
            contest.games.some((game) => game === "alternate_shot" || game === "chapman");
          return usesTeamCards
            ? teamCardPlayers(roundContest, true)
            : round.groups.flatMap((group) => group.players);
        };
        const resultsForRound = (number: number) => {
          const round = rounds.find((item) => item.number === number);
          return round
            ? buildLeaderboard(roundPlayers(round), round.course ?? contest.course, effectiveRankMode).rows
            : [];
        };
        // THRU must reflect progress in the CURRENT round only (AUG-253v). The
        // cumulative `searchedRows.thru` below counts holes on the whole-event
        // card, so R1 complete + 3 holes of R2 would wrongly read "F". Build the
        // current round's own rows (its players over its own course + groups) so
        // THRU is the current-round hole count, "F" only when the current round
        // is complete, and the pre-start tee time / "—" when it has not started
        // (AUG-760). r1/today score columns are unaffected.
        const currentNumber = contest.currentRound ?? 1;
        const currentRound = rounds.find((item) => item.number === currentNumber);
        const currentThruById = new Map<string, { thru: "F" | number | null; teeTime: string | null }>();
        if (currentRound) {
          const players = roundPlayers(currentRound);
          const course = currentRound.course ?? contest.course;
          const currentRows = buildLeaderboardRows(
            buildLeaderboard(players, course, effectiveRankMode).rows,
            players,
            { holeCount: course.holes.length, groups: currentRound.groups },
          );
          for (const row of currentRows) {
            currentThruById.set(row.playerId, { thru: row.thru, teeTime: row.teeTime });
          }
        }
        return {
          roundInfo: {
            r1: resultsForRound(1),
            today: resultsForRound(currentNumber),
          },
          currentThruById,
        };
      })()
    : undefined;
  const roundInfo = roundView?.roundInfo;


  // Compute team stats if teams exist
  const hasTeams = contest.hasTeams && contest.teamAName && contest.teamBName;
  const teamAPlayers = hasTeams ? allPlayers.filter((p) => p.team === "A") : [];
  const teamBPlayers = hasTeams ? allPlayers.filter((p) => p.team === "B") : [];
  const teamATotal = teamAPlayers.reduce((sum, p) => sum + p.scores.reduce((a, b) => a + b, 0), 0);
  const teamBTotal = teamBPlayers.reduce((sum, p) => sum + p.scores.reduce((a, b) => a + b, 0), 0);

  // Shared header (course note + round/view toggles). Reused as the FlashList
  // ListHeaderComponent in individual view and inside the ScrollView in groups view
  // so both views render the same chrome above the list (AUG-253b re-cut).
  const header = (
    <>
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

    </>
  );

  // Gross / Net toggle (Direction A, Figma 11:43) — rendered at the top of the virtualized
  // individual list. Hidden when the course cannot be ranked net, so Gross always shows for
  // unsupported courses. Pressing it flips rankMode, which re-ranks via buildLeaderboard.
  const grossNetToggle = netAvailable ? (
    <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginBottom: 16 }}>
      <View
        testID="leaderboard-rank-toggle"
        style={{ flexDirection: "row", width: 150, height: 36, backgroundColor: COLORS.surfaceMid, borderRadius: RADII.full, padding: 2, gap: 2 }}
      >
        <AnimatedPressable
          testID="leaderboard-rank-gross"
          onPress={() => setRankMode("gross")}
          hitSlop={{ top: 6, bottom: 6 }}
          style={{
            width: 72,
            height: 32,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: RADII.full,
            backgroundColor: rankMode === "gross" ? COLORS.primary : "transparent",
          }}
        >
          <Text
            style={
              rankMode === "gross"
                ? { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.onPrimary }
                : { ...TYPOGRAPHY.caption, color: COLORS.textDim }
            }
          >
            Gross
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          testID="leaderboard-rank-net"
          onPress={() => setRankMode("net")}
          hitSlop={{ top: 6, bottom: 6 }}
          style={{
            width: 72,
            height: 32,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: RADII.full,
            backgroundColor: rankMode === "net" ? COLORS.primary : "transparent",
          }}
        >
          <Text
            style={
              rankMode === "net"
                ? { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.onPrimary }
                : { ...TYPOGRAPHY.caption, color: COLORS.textDim }
            }
          >
            Net
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  ) : null;

  // Search over the full individual field (AUG-735 / AUG-253g). buildLeaderboardRows
  // fixes each player's competition rank over the WHOLE field before applying the
  // case-insensitive name filter, so a searched subset keeps real field ranks
  // (AUG-675 contract). Empty query returns every player, so the default view is
  // unchanged / pixel-identical.
  // AUG-253j: pin the fixture/debug "You" row to the front. youPlayerId is a fixture id
  // (no real user↔player link yet — AUG-254 is out of scope), so it is undefined in
  // production and this is a no-op there: the default view stays pixel-identical.
  const youPlayerId = getFixtureYouPlayerId();
  // Only approved membership identifies the viewer; hosts and fixture You rows
  // cannot supply a group. Re-evaluate every render so revocation clears filtering.
  const viewerPlayerId = membership?.status === "approved" ? membership.player_id : null;
  const viewerGroupId = viewerPlayerId
    ? contest.groups.find((group) => group.players.some((player) => player.id === viewerPlayerId))?.id
    : undefined;
  const groupFilterActive = myGroupOnly && viewerGroupId !== undefined;
  const searchedRows = buildLeaderboardRows(individualResults, allPlayers, {
    holeCount: leaderboardCourse.holes.length,
    query: playerQuery,
    youPlayerId,
    roundInfo,
    groupId: groupFilterActive ? viewerGroupId : undefined,
    groups: contest.groups,
  });
  // AUG-253v: round-level data (r1/today) and the current round's THRU/tee time are
  // keyed by playerId and passed through rankByPlayerId; single-round screens keep the
  // cumulative row values and omit r1/today so the default card row renders unchanged.
  const rankByPlayerId = new Map(
    searchedRows.map((r) => {
      const currentThru = roundView?.currentThruById.get(r.playerId);
      return [r.playerId, {
        rankLabel: r.rankLabel,
        tied: r.tied,
        isYou: r.isYou === true,
        thru: roundInfo ? (currentThru?.thru ?? null) : r.thru,
        teeTime: roundInfo ? (currentThru?.teeTime ?? null) : r.teeTime,
        ...(roundInfo ? { r1: r.r1, today: r.today } : {}),
      }];
    }),
  );
  // Carry the complete display contract from the prepared model into FlashList.
  // Filtering has already happened after full-field rank calculation, so a searched
  // result keeps its real rank, pinned-You marker, THRU, and pre-start tee time.
  const resultByPlayerId = new Map(individualResults.map((result) => [result.playerId, result]));
  const visibleRows = searchedRows.flatMap((row) => {
    const result = resultByPlayerId.get(row.playerId);
    return result
      ? [{ ...result, rankLabel: row.rankLabel, isYou: row.isYou === true, thru: row.thru, teeTime: row.teeTime }]
      : [];
  });

  // Search field for the individual leaderboard (Figma 15:2). Mirrors the shipped
  // CourseSearch "Search by course name..." affordance; placeholder is a functional
  // filter label, not a copy change (AUG-735 scope).
  const playerSearch = (
    <View style={{ marginBottom: 12 }}>
      <TextInput
        testID="leaderboard-search"
        accessibilityLabel="Search players"
        placeholder="Search players"
        placeholderTextColor={COLORS.textDim}
        value={playerQuery}
        onChangeText={setPlayerQuery}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          fontFamily: FONTS.regular,
          fontSize: 15,
          color: COLORS.text,
          backgroundColor: COLORS.surfaceMid,
          borderRadius: RADII.md,
          paddingHorizontal: 14,
          paddingVertical: 10,
          minHeight: 44,
        }}
      />
    </View>
  );

  const myGroupControl = (
    <View style={{ marginBottom: 12, gap: 6 }}>
      <AnimatedPressable
        testID="leaderboard-my-group"
        accessibilityRole="switch"
        accessibilityLabel="My group"
        accessibilityState={{ checked: groupFilterActive, disabled: viewerGroupId === undefined }}
        disabled={viewerGroupId === undefined}
        onPress={() => { if (viewerGroupId !== undefined) setMyGroupOnly((active) => !active); }}
        style={{
          alignSelf: "flex-start", minHeight: 44, justifyContent: "center",
          paddingHorizontal: 16, borderRadius: RADII.full,
          backgroundColor: groupFilterActive ? COLORS.primary : COLORS.surfaceMid,
          opacity: viewerGroupId === undefined ? 0.5 : 1,
        }}
      >
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: groupFilterActive ? COLORS.onPrimary : COLORS.text }}>
          My group
        </Text>
      </AnimatedPressable>
      {viewerGroupId === undefined && (
        <Text testID="leaderboard-my-group-empty" style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
          No group assigned
        </Text>
      )}
    </View>
  );

  // Individual view: virtualize the ranked rows with FlashList (72+ player fields, AUG-253).
  // The screen owns ranking (buildLeaderboard), the Gross/Net toggle and the search; the
  // list only recycles the already-ranked rows, which stay pixel-identical to the prior
  // ScrollView when the search is empty.
  if (viewMode === "individual") {
    return (
      <LeaderboardResultsList
        results={visibleRows}
        rankByPlayerId={rankByPlayerId}
        allPlayers={allPlayers}
        recentPlayers={recentPlayers}
        contest={contest}
        ListHeaderComponent={
          <>
            {header}
            {grossNetToggle}
            {playerSearch}
            {myGroupControl}
          </>
        }
        ListFooterComponent={<View style={{ height: 16 }} />}
      />
    );
  }

  // Groups view: a handful of team/group cards, no 72+ scaling concern, stays a ScrollView.
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {header}

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
