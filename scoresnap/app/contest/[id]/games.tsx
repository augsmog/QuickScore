import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { COLORS, FONTS, RADII, TYPOGRAPHY, scoreColor } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { ALL_GAMES, GameType } from "../../../src/engine/types";
import { calcSkins } from "../../../src/engine/calculators/skins";
import { calcNassau } from "../../../src/engine/calculators/nassau";
import { calcStableford } from "../../../src/engine/calculators/stableford";
import { calcStrokePlay } from "../../../src/engine/calculators/stroke-play";
import { calcWolf } from "../../../src/engine/calculators/wolf";
import { calcSnake } from "../../../src/engine/calculators/snake";
import { calcNines } from "../../../src/engine/calculators/nines";
import { calcVegas } from "../../../src/engine/calculators/vegas";
import { calcQuota } from "../../../src/engine/calculators/quota";
import { calcChicago } from "../../../src/engine/calculators/chicago";
import { calcRabbit } from "../../../src/engine/calculators/rabbit";
import { calcAcesDeuces } from "../../../src/engine/calculators/aces-deuces";
import { calcDefender } from "../../../src/engine/calculators/defender";
import { calcBanker } from "../../../src/engine/calculators/banker";
import { calcSixes } from "../../../src/engine/calculators/sixes";
import { calcCloseout } from "../../../src/engine/calculators/closeout";
import { calcDots } from "../../../src/engine/calculators/dots";

/** Reusable player-ranking list for games that return { totals: Record<string, number> } */
function RankList({
  totals,
  unit,
  betUnit,
  label = "pts",
}: {
  totals: Record<string, number>;
  unit?: string;
  betUnit: number;
  label?: string;
}) {
  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
  return (
    <View>
      {sorted.map(([name, value], i) => (
        <View
          key={name}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 6,
            borderBottomColor: COLORS.border + "22",
            borderBottomWidth: 1,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: FONTS.bold,
                width: 18,
                textAlign: "center",
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
            <Text
              style={{
                fontSize: 14,
                fontFamily: FONTS.medium,
                color: COLORS.text,
              }}
            >
              {name}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 14,
              fontFamily: FONTS.bold,
              color:
                value > 0
                  ? COLORS.primary
                  : value < 0
                  ? COLORS.error
                  : COLORS.textDim,
            }}
          >
            {value > 0 ? "+" : ""}
            {value} {unit || label}
            {betUnit > 0 && value !== 0 ? ` · $${Math.abs(value * betUnit)}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

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
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🎮</Text>
        <Text
          style={{
            color: COLORS.textDim,
            fontSize: 15,
            fontFamily: FONTS.semibold,
            textAlign: "center",
          }}
        >
          Enter scores to see game results
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}
      showsVerticalScrollIndicator={false}
    >
      {contest.games.map((gameId) => {
        const game = ALL_GAMES.find((g) => g.id === gameId);
        if (!game) return null;

        return (
          <View
            key={gameId}
            style={{
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
              borderRadius: RADII.xl,
              padding: 16,
              marginBottom: 12,
            }}
          >
            {/* Game Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 24 }}>{game.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: COLORS.text,
                    fontFamily: FONTS.bold,
                    fontSize: 16,
                  }}
                >
                  {game.name}
                </Text>
                <Text
                  style={{
                    color: COLORS.textDim,
                    fontSize: 11,
                    fontFamily: FONTS.regular,
                  }}
                >
                  ${contest.betUnit} per unit
                </Text>
              </View>
            </View>

            {/* ── Skins ── */}
            {(gameId === "skins" || gameId === "skins_carry") &&
              contest.groups.map((group, gi) => {
                const result = calcSkins(
                  group.players,
                  contest.course,
                  gameId === "skins_carry"
                );
                return (
                  <View key={gi} style={gi > 0 ? { marginTop: 12 } : undefined}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    {Object.entries(result.totals)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, count]) => (
                        <View
                          key={name}
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            paddingVertical: 6,
                            borderBottomColor: COLORS.border + "22",
                            borderBottomWidth: 1,
                          }}
                        >
                          <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium }}>
                            {name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 14,
                              fontFamily: FONTS.bold,
                              color: count > 0 ? COLORS.primary : COLORS.textDim,
                            }}
                          >
                            {count} skin{count !== 1 ? "s" : ""} · ${count * contest.betUnit}
                          </Text>
                        </View>
                      ))}
                    {/* Skin Map */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {result.skins
                        .filter((s) => s.winner !== "Carry")
                        .map((s) => (
                          <View
                            key={s.hole}
                            style={{
                              borderRadius: RADII.sm,
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              backgroundColor: s.winner !== "Push" ? COLORS.accentGlow : COLORS.bg,
                              borderColor: s.winner !== "Push" ? COLORS.primary + "33" : COLORS.border,
                              borderWidth: 1,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontFamily: FONTS.medium,
                                color: s.winner !== "Push" ? COLORS.primary : COLORS.textDim,
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

            {/* ── Nassau ── */}
            {(gameId === "nassau" || gameId === "nassau_press") &&
              contest.groups.map((group, gi) => {
                if (group.players.length < 2) return null;
                const result = calcNassau(group.players[0], group.players[1]);
                return (
                  <View key={gi} style={gi > 0 ? { marginTop: 12 } : undefined}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}: {result.p1} vs {result.p2}
                      </Text>
                    )}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {(
                        [
                          ["Front 9", result.front],
                          ["Back 9", result.back],
                          ["Overall", result.overall],
                        ] as const
                      ).map(([label, val]) => (
                        <View
                          key={label}
                          style={{
                            flex: 1,
                            borderRadius: RADII.md,
                            padding: 12,
                            alignItems: "center",
                            backgroundColor: COLORS.bg,
                          }}
                        >
                          <Text style={{ color: COLORS.textDim, fontSize: 10, fontFamily: FONTS.bold, marginBottom: 4 }}>
                            {label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 18,
                              fontFamily: FONTS.headline,
                              color:
                                val > 0
                                  ? COLORS.primary
                                  : val < 0
                                  ? COLORS.error
                                  : COLORS.textDim,
                            }}
                          >
                            {val > 0 ? result.p1.split(" ")[0] : val < 0 ? result.p2.split(" ")[0] : "Push"}
                          </Text>
                          {val !== 0 && (
                            <Text style={{ color: COLORS.textDim, fontSize: 10, fontFamily: FONTS.medium }}>
                              {Math.abs(val)} up
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}

            {/* ── Stableford / Mod Stableford ── */}
            {(gameId === "stableford" || gameId === "mod_stableford") && (
              <View>
                {calcStableford(allPlayers, contest.course).map((r, i) => (
                  <View
                    key={r.playerId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 6,
                      borderBottomColor: COLORS.border + "22",
                      borderBottomWidth: 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONTS.bold,
                          width: 18,
                          textAlign: "center",
                          color: i === 0 ? COLORS.gold : i === 1 ? COLORS.silver : COLORS.textDim,
                        }}
                      >
                        {i + 1}
                      </Text>
                      <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium }}>
                        {r.name}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: FONTS.bold,
                        color: i === 0 ? COLORS.primary : COLORS.textDim,
                      }}
                    >
                      {r.points} pts
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Stroke Play ── */}
            {gameId === "stroke_play" && (
              <View>
                {calcStrokePlay(allPlayers, contest.course).map((r, i) => (
                  <View
                    key={r.playerId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 6,
                      borderBottomColor: COLORS.border + "22",
                      borderBottomWidth: 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONTS.bold,
                          width: 18,
                          textAlign: "center",
                          color: i === 0 ? COLORS.gold : i === 1 ? COLORS.silver : COLORS.textDim,
                        }}
                      >
                        {i + 1}
                      </Text>
                      <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium }}>
                        {r.name}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: FONTS.bold,
                        color: i === 0 ? COLORS.primary : COLORS.textDim,
                      }}
                    >
                      {r.total} ({r.toPar > 0 ? "+" : ""}
                      {r.toPar})
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Match Play ── */}
            {gameId === "match_play" &&
              contest.groups.map((group, gi) => {
                if (group.players.length < 2) return null;
                const p1 = group.players[0];
                const p2 = group.players[1];
                let status = 0;
                for (let i = 0; i < 18; i++) {
                  if (p1.scores[i] > 0 && p2.scores[i] > 0) {
                    if (p1.scores[i] < p2.scores[i]) status++;
                    else if (p2.scores[i] < p1.scores[i]) status--;
                  }
                }
                return (
                  <View key={gi} style={{ alignItems: "center", paddingVertical: 8 }}>
                    <Text style={{ color: COLORS.textDim, fontSize: 12, fontFamily: FONTS.medium, marginBottom: 8 }}>
                      {p1.name} vs {p2.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 24,
                        fontFamily: FONTS.headline,
                        color:
                          status > 0 ? COLORS.primary : status < 0 ? COLORS.error : COLORS.textDim,
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

            {/* ── Best Ball ── */}
            {gameId === "best_ball" && contest.hasTeams && (
              <View>
                {["A", "B"].map((team) => {
                  const teamPlayers = allPlayers.filter((p) => p.team === team);
                  let bestTotal = 0;
                  for (let i = 0; i < 18; i++) {
                    const scores = teamPlayers.map((p) => p.scores[i]).filter((s) => s > 0);
                    if (scores.length > 0) bestTotal += Math.min(...scores);
                  }
                  const coursePar = contest.course.holes.reduce((a, h) => a + h.par, 0);
                  const teamName = team === "A" ? contest.teamAName : contest.teamBName;
                  return (
                    <View key={team} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                      <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: FONTS.semibold }}>
                        {teamName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: FONTS.bold,
                          color: bestTotal - coursePar < 0 ? COLORS.primary : COLORS.warn,
                        }}
                      >
                        {bestTotal} ({bestTotal - coursePar > 0 ? "+" : ""}
                        {bestTotal - coursePar})
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── Wolf ── */}
            {gameId === "wolf" &&
              contest.groups.map((group, gi) => {
                if (group.players.length !== 4) return null;
                const result = calcWolf(group.players, contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    <RankList totals={result.totals} betUnit={contest.betUnit} />
                  </View>
                );
              })}

            {/* ── Snake ── */}
            {gameId === "snake" &&
              contest.groups.map((group, gi) => {
                const result = calcSnake(group.players, contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    {result.snakeHolder ? (
                      <View style={{ alignItems: "center", paddingVertical: 8 }}>
                        <Text style={{ fontSize: 32, marginBottom: 4 }}>🐍</Text>
                        <Text
                          style={{
                            fontSize: 16,
                            fontFamily: FONTS.bold,
                            color: COLORS.error,
                          }}
                        >
                          {result.snakeHolder} holds the Snake
                        </Text>
                        <Text style={{ color: COLORS.textDim, fontSize: 12, fontFamily: FONTS.medium, marginTop: 4 }}>
                          {result.events.length} 3-putt{result.events.length !== 1 ? "s" : ""} this round
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ color: COLORS.textDim, fontSize: 14, fontFamily: FONTS.medium, textAlign: "center" }}>
                        No 3-putts yet — snake unclaimed
                      </Text>
                    )}
                  </View>
                );
              })}

            {/* ── Nines ── */}
            {gameId === "nines" &&
              contest.groups.map((group, gi) => {
                if (group.players.length !== 4) return null;
                const result = calcNines(group.players, contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    <RankList totals={result.points} betUnit={contest.betUnit} />
                  </View>
                );
              })}

            {/* ── Vegas ── */}
            {gameId === "vegas" &&
              contest.groups.map((group, gi) => {
                if (group.players.length !== 4) return null;
                const result = calcVegas(group.players, contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1, borderRadius: RADII.md, padding: 12, alignItems: "center", backgroundColor: COLORS.bg }}>
                        <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 4 }}>Team 1</Text>
                        <Text style={{ fontSize: 22, fontFamily: FONTS.headline, color: result.team1Won > result.team2Won ? COLORS.primary : COLORS.textDim }}>
                          {result.team1Won}
                        </Text>
                      </View>
                      <View style={{ flex: 1, borderRadius: RADII.md, padding: 12, alignItems: "center", backgroundColor: COLORS.bg }}>
                        <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 4 }}>Team 2</Text>
                        <Text style={{ fontSize: 22, fontFamily: FONTS.headline, color: result.team2Won > result.team1Won ? COLORS.primary : COLORS.textDim }}>
                          {result.team2Won}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}

            {/* ── Quota ── */}
            {gameId === "quota" && (
              <View>
                {calcQuota(allPlayers, contest.course).map((r, i) => (
                  <View
                    key={r.playerId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 6,
                      borderBottomColor: COLORS.border + "22",
                      borderBottomWidth: 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONTS.bold,
                          width: 18,
                          textAlign: "center",
                          color: i === 0 ? COLORS.gold : i === 1 ? COLORS.silver : COLORS.textDim,
                        }}
                      >
                        {i + 1}
                      </Text>
                      <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium }}>
                        {r.name}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: FONTS.bold,
                        color: r.overUnder > 0 ? COLORS.primary : r.overUnder < 0 ? COLORS.error : COLORS.textDim,
                      }}
                    >
                      {r.overUnder > 0 ? "+" : ""}{r.overUnder} ({r.points}/{r.quota} quota)
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Chicago ── */}
            {gameId === "chicago" && (
              <View>
                {calcChicago(allPlayers, contest.course).map((r, i) => (
                  <View
                    key={r.playerId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 6,
                      borderBottomColor: COLORS.border + "22",
                      borderBottomWidth: 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: FONTS.bold,
                          width: 18,
                          textAlign: "center",
                          color: i === 0 ? COLORS.gold : i === 1 ? COLORS.silver : COLORS.textDim,
                        }}
                      >
                        {i + 1}
                      </Text>
                      <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium }}>
                        {r.name}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: FONTS.bold,
                        color: r.netScore > 0 ? COLORS.primary : r.netScore < 0 ? COLORS.error : COLORS.textDim,
                      }}
                    >
                      {r.netScore > 0 ? "+" : ""}{r.netScore} ({r.grossPoints}/{r.quota} quota)
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Rabbit ── */}
            {gameId === "rabbit" &&
              contest.groups.map((group, gi) => {
                const result = calcRabbit(group.players, contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    <RankList totals={result.totals} betUnit={contest.betUnit} />
                  </View>
                );
              })}

            {/* ── Aces & Deuces ── */}
            {gameId === "aces_deuces" && (
              <View>
                {(() => {
                  const result = calcAcesDeuces(allPlayers, contest.course);
                  return <RankList totals={result.totals} betUnit={contest.betUnit} />;
                })()}
              </View>
            )}

            {/* ── Defender ── */}
            {gameId === "defender" &&
              contest.groups.map((group, gi) => {
                const result = calcDefender(group.players, contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    <RankList totals={result.totals} betUnit={contest.betUnit} />
                  </View>
                );
              })}

            {/* ── Banker ── */}
            {gameId === "banker" &&
              contest.groups.map((group, gi) => {
                const result = calcBanker(group.players, contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    <RankList totals={result.totals} betUnit={contest.betUnit} />
                  </View>
                );
              })}

            {/* ── Sixes ── */}
            {gameId === "sixes" &&
              contest.groups.map((group, gi) => {
                if (group.players.length !== 4) return null;
                const result = calcSixes(group.players, contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    <RankList totals={result.totals} betUnit={contest.betUnit} />
                  </View>
                );
              })}

            {/* ── Closeout ── */}
            {gameId === "closeout" &&
              contest.groups.map((group, gi) => {
                if (group.players.length < 2) return null;
                const result = calcCloseout(group.players[0], group.players[1], contest.course);
                return (
                  <View key={gi}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}
                      </Text>
                    )}
                    <RankList totals={result.totals} betUnit={contest.betUnit} label="matches" />
                  </View>
                );
              })}

            {/* ── Dots ── */}
            {gameId === "dots" && (
              <View>
                {(() => {
                  const result = calcDots(allPlayers, contest.course);
                  return <RankList totals={result.totals} betUnit={contest.betUnit} label="dots" />;
                })()}
              </View>
            )}

            {/* ── Fallback for games without explicit rendering ── */}
            {![
              "stroke_play", "stableford", "mod_stableford",
              "skins", "skins_carry", "nassau", "nassau_press",
              "match_play", "best_ball", "wolf", "snake",
              "nines", "vegas", "quota", "chicago", "rabbit",
              "aces_deuces", "defender", "banker", "sixes",
              "closeout", "dots", "hammer", "bingo_bango_bongo",
              "greenies", "scramble", "shamble", "alternate_shot",
              "chapman", "fourball",
            ].includes(gameId) && (
              <Text
                style={{
                  color: COLORS.textDim,
                  fontSize: 13,
                  fontFamily: FONTS.medium,
                  fontStyle: "italic",
                }}
              >
                {game.name} results calculated at settlement
              </Text>
            )}
          </View>
        );
      })}
      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
