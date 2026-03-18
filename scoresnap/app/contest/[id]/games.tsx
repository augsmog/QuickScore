import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { COLORS } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { ALL_GAMES } from "../../../src/engine/types";
import { calcSkins } from "../../../src/engine/calculators/skins";
import { calcNassau } from "../../../src/engine/calculators/nassau";
import { calcStableford } from "../../../src/engine/calculators/stableford";
import { calcStrokePlay } from "../../../src/engine/calculators/stroke-play";

export default function GamesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );

  if (!contest) return null;

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const hasScores = allPlayers.some((p) => p.scores.some((s) => s > 0));

  if (!hasScores) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-5xl mb-4">🎮</Text>
        <Text className="text-text-dim text-base font-semibold text-center">
          Enter scores to see game results
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 px-5 pt-3" showsVerticalScrollIndicator={false}>
      {contest.games.map((gameId) => {
        const game = ALL_GAMES.find((g) => g.id === gameId);
        if (!game) return null;

        return (
          <View
            key={gameId}
            className="rounded-2xl p-4 mb-3"
            style={{
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <Text className="text-2xl">{game.icon}</Text>
              <View className="flex-1">
                <Text className="text-text-primary font-bold text-base">
                  {game.name}
                </Text>
                <Text className="text-text-dim text-xs">
                  ${contest.betUnit} per unit
                </Text>
              </View>
            </View>

            {/* Skins Results */}
            {(gameId === "skins" || gameId === "skins_carry") &&
              contest.groups.map((group, gi) => {
                const result = calcSkins(
                  group.players,
                  contest.course,
                  gameId === "skins_carry"
                );
                return (
                  <View key={gi} className={gi > 0 ? "mt-3" : ""}>
                    {contest.groups.length > 1 && (
                      <Text className="text-text-dim text-xs font-semibold uppercase tracking-wider mb-2">
                        {group.name}
                      </Text>
                    )}
                    {Object.entries(result.totals)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, count]) => (
                        <View
                          key={name}
                          className="flex-row justify-between py-1.5"
                          style={{
                            borderBottomColor: COLORS.border + "22",
                            borderBottomWidth: 1,
                          }}
                        >
                          <Text className="text-text-primary text-sm">
                            {name}
                          </Text>
                          <Text
                            className="text-sm font-bold"
                            style={{
                              color:
                                count > 0 ? COLORS.accent : COLORS.textDim,
                            }}
                          >
                            {count} skin{count !== 1 ? "s" : ""} · $
                            {count * contest.betUnit}
                          </Text>
                        </View>
                      ))}
                    {/* Skin Map */}
                    <View className="flex-row flex-wrap gap-1 mt-2">
                      {result.skins
                        .filter((s) => s.winner !== "Carry")
                        .map((s) => (
                          <View
                            key={s.hole}
                            className="rounded-md px-2 py-0.5"
                            style={{
                              backgroundColor:
                                s.winner !== "Push"
                                  ? COLORS.accentGlow
                                  : COLORS.bg,
                              borderColor:
                                s.winner !== "Push"
                                  ? COLORS.accent + "33"
                                  : COLORS.border,
                              borderWidth: 1,
                            }}
                          >
                            <Text
                              className="text-[10px]"
                              style={{
                                color:
                                  s.winner !== "Push"
                                    ? COLORS.accent
                                    : COLORS.textDim,
                              }}
                            >
                              #{s.hole}: {s.winner} ({s.value})
                            </Text>
                          </View>
                        ))}
                    </View>
                  </View>
                );
              })}

            {/* Nassau Results */}
            {(gameId === "nassau" || gameId === "nassau_press") &&
              contest.groups.map((group, gi) => {
                if (group.players.length < 2) return null;
                const result = calcNassau(
                  group.players[0],
                  group.players[1]
                );
                return (
                  <View key={gi} className={gi > 0 ? "mt-3" : ""}>
                    {contest.groups.length > 1 && (
                      <Text className="text-text-dim text-xs font-semibold uppercase mb-2">
                        {group.name}: {result.p1} vs {result.p2}
                      </Text>
                    )}
                    <View className="flex-row gap-2">
                      {(
                        [
                          ["Front 9", result.front],
                          ["Back 9", result.back],
                          ["Overall", result.overall],
                        ] as const
                      ).map(([label, val]) => (
                        <View
                          key={label}
                          className="flex-1 rounded-lg p-3 items-center"
                          style={{ backgroundColor: COLORS.bg }}
                        >
                          <Text className="text-text-dim text-[10px] mb-1">
                            {label}
                          </Text>
                          <Text
                            className="text-lg font-extrabold"
                            style={{
                              color:
                                val > 0
                                  ? COLORS.accent
                                  : val < 0
                                  ? COLORS.danger
                                  : COLORS.textDim,
                            }}
                          >
                            {val > 0
                              ? result.p1.split(" ")[0]
                              : val < 0
                              ? result.p2.split(" ")[0]
                              : "Push"}
                          </Text>
                          {val !== 0 && (
                            <Text className="text-text-dim text-[10px]">
                              {Math.abs(val)} up
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}

            {/* Stableford Results */}
            {(gameId === "stableford" || gameId === "mod_stableford") && (
              <View>
                {calcStableford(allPlayers, contest.course).map((r, i) => (
                  <View
                    key={r.playerId}
                    className="flex-row justify-between items-center py-1.5"
                    style={{
                      borderBottomColor: COLORS.border + "22",
                      borderBottomWidth: 1,
                    }}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text
                        className="text-xs font-bold w-5 text-center"
                        style={{
                          color:
                            i === 0
                              ? COLORS.gold
                              : i === 1
                              ? COLORS.silver
                              : COLORS.textDim,
                        }}
                      >
                        {i + 1}
                      </Text>
                      <Text className="text-text-primary text-sm">
                        {r.name}
                      </Text>
                    </View>
                    <Text
                      className="text-sm font-bold"
                      style={{
                        color: i === 0 ? COLORS.accent : COLORS.textDim,
                      }}
                    >
                      {r.points} pts
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Stroke Play Results */}
            {gameId === "stroke_play" && (
              <View>
                {calcStrokePlay(allPlayers, contest.course).map((r, i) => (
                  <View
                    key={r.playerId}
                    className="flex-row justify-between items-center py-1.5"
                    style={{
                      borderBottomColor: COLORS.border + "22",
                      borderBottomWidth: 1,
                    }}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text
                        className="text-xs font-bold w-5 text-center"
                        style={{
                          color:
                            i === 0
                              ? COLORS.gold
                              : i === 1
                              ? COLORS.silver
                              : COLORS.textDim,
                        }}
                      >
                        {i + 1}
                      </Text>
                      <Text className="text-text-primary text-sm">
                        {r.name}
                      </Text>
                    </View>
                    <Text
                      className="text-sm font-bold"
                      style={{
                        color: i === 0 ? COLORS.accent : COLORS.textDim,
                      }}
                    >
                      {r.total} ({r.toPar > 0 ? "+" : ""}
                      {r.toPar})
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Match Play Results */}
            {gameId === "match_play" &&
              contest.groups.map((group, gi) => {
                if (group.players.length < 2) return null;
                const p1 = group.players[0];
                const p2 = group.players[1];
                // Simple head-to-head status
                let status = 0;
                for (let i = 0; i < 18; i++) {
                  if (p1.scores[i] > 0 && p2.scores[i] > 0) {
                    if (p1.scores[i] < p2.scores[i]) status++;
                    else if (p2.scores[i] < p1.scores[i]) status--;
                  }
                }
                return (
                  <View key={gi} className="items-center py-2">
                    <Text className="text-text-dim text-xs mb-2">
                      {p1.name} vs {p2.name}
                    </Text>
                    <Text
                      className="text-2xl font-extrabold"
                      style={{
                        color:
                          status > 0
                            ? COLORS.accent
                            : status < 0
                            ? COLORS.danger
                            : COLORS.textDim,
                      }}
                    >
                      {status === 0
                        ? "All Square"
                        : status > 0
                        ? `${p1.name.split(" ")[0]} ${status} UP`
                        : `${p2.name.split(" ")[0]} ${Math.abs(status)} UP`}
                    </Text>
                  </View>
                );
              })}

            {/* Best Ball Results */}
            {gameId === "best_ball" && contest.hasTeams && (
              <View>
                {["A", "B"].map((team) => {
                  const teamPlayers = allPlayers.filter(
                    (p) => p.team === team
                  );
                  let bestTotal = 0;
                  for (let i = 0; i < 18; i++) {
                    const scores = teamPlayers
                      .map((p) => p.scores[i])
                      .filter((s) => s > 0);
                    if (scores.length > 0) bestTotal += Math.min(...scores);
                  }
                  const coursePar = contest.course.holes.reduce(
                    (a, h) => a + h.par,
                    0
                  );
                  const teamName =
                    team === "A"
                      ? contest.teamAName
                      : contest.teamBName;
                  return (
                    <View
                      key={team}
                      className="flex-row justify-between py-1.5"
                    >
                      <Text className="text-text-primary text-sm font-semibold">
                        {teamName}
                      </Text>
                      <Text
                        className="text-sm font-bold"
                        style={{
                          color:
                            bestTotal - coursePar < 0
                              ? COLORS.accent
                              : COLORS.warn,
                        }}
                      >
                        {bestTotal} (
                        {bestTotal - coursePar > 0 ? "+" : ""}
                        {bestTotal - coursePar})
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Placeholder for unimplemented games */}
            {![
              "stroke_play",
              "stableford",
              "mod_stableford",
              "skins",
              "skins_carry",
              "nassau",
              "nassau_press",
              "match_play",
              "best_ball",
            ].includes(gameId) && (
              <Text className="text-text-dim text-sm italic">
                {game.name} results calculated per group
              </Text>
            )}
          </View>
        );
      })}
      <View className="h-4" />
    </ScrollView>
  );
}
