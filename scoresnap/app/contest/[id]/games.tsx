import { executionGameConfig } from "../../../src/engine/types";
import { actualInputLedger, ACTUAL_INPUT_GAMES } from "../../../src/engine/actual-inputs";
import { scopedAuxiliary, calculateContestSettlement, teamCardPlayers, contestStableford, contestMatchPlay, contestPrimaryRounds } from "../../../src/engine/contest-results";
import { Flag, Plus } from "lucide-react-native";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { COLORS, FONTS, RADII, TYPOGRAPHY } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { ALL_GAMES } from "../../../src/engine/types";
import { calcScopedSkins, skinsLabel } from "../../../src/engine/calculators/skins";
import { calcNassau, calcNassauRules } from "../../../src/engine/calculators/nassau";
import { calcStableford } from "../../../src/engine/calculators/stableford";
import { calcModStableford } from "../../../src/engine/calculators/mod-stableford";
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

/** Presentation only: retain the original values and show a typographic minus. */
function formatNumber(value: number, signed = false): string {
  return `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${Math.abs(value)}`;
}

/** Competition rank for an already-sorted list: equal values share a rank, shown with T. */
function rankLabel(values: number[], index: number): string {
  const value = values[index];
  return `${values.filter((v) => v === value).length > 1 ? "T" : ""}${values.indexOf(value) + 1}`;
}

function formatMoney(value: number): string {
  return `${value < 0 ? "−" : value > 0 ? "+" : ""}$${Math.abs(value)}`;
}

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
      {sorted.map(([name, value]) => (
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
                minWidth: 24,
                textAlign: "center",
                color: COLORS.textDim,
              }}
            >
              {sorted.filter(([, score]) => score === value).length > 1 ? "T" : ""}
              {sorted.findIndex(([, score]) => score === value) + 1}
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
            {formatNumber(value, true)} {unit || label}
            {betUnit > 0 && value !== 0 ? ` · ${formatMoney(value * betUnit)}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function GamesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const savedContest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );

  const contest=savedContest?{...savedContest,gameConfig:executionGameConfig(savedContest.games,savedContest.gameConfig)}:undefined;

  if (!contest) return null;

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const hasScores = contest.rounds?.some(r=>r.groups.some(g=>g.players.some(p=>p.scores.some(n=>n>0)))) || (contest.games.some(g=>g==="alternate_shot"||g==="chapman")?teamCardPlayers(contest):allPlayers).some((p) => p.scores.some((s) => s > 0));

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
        <Flag size={40} color={COLORS.textDim} style={{ marginBottom: 16 }} />
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
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {contestPrimaryRounds(contest).flatMap(({key:roundKey,roundName,contest}) => {
        const allPlayers = contest.groups.flatMap((g) => g.players);
        return contest.games.map((gameId) => {
        const game = ALL_GAMES.find((g) => g.id === gameId);
        if (!game) return null;
        const holesPlayed = new Set(
          allPlayers.flatMap(player => player.scores.flatMap((score, hole) => score > 0 ? [hole] : []))
        ).size;
        const status = contest.status === "completed"
          ? "Final"
          : holesPlayed > 0 ? `In progress · thru ${holesPlayed}` : "Not started";

        return (
          <View
            key={`${roundKey}/${gameId}`}
            style={{
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
              borderRadius: RADII.xl,
              padding: 16,
              marginBottom: 12,
            }}
          >
            {roundName && <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>{roundName}</Text>}
            {/* Game Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: COLORS.text,
                    fontFamily: FONTS.headline,
                    fontSize: 18,
                  }}
                >
                  {gameId === "skins" || gameId === "skins_carry" ? skinsLabel(contest.gameConfig) + (gameId === "skins_carry" ? " (Carryover)" : "") : game.name}
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
              <View
                testID={`games-status-${gameId}`}
                style={{ flexShrink: 0, minHeight: 24, borderRadius: RADII.full, backgroundColor: COLORS.surfaceLow, paddingHorizontal: 10, paddingVertical: 4, justifyContent: "center" }}
              >
                <Text style={{ fontSize: 12, fontFamily: FONTS.medium, color: COLORS.textDim }}>{status}</Text>
              </View>
            </View>
            {!!game.rules.trim() && (
              <Text style={{ fontSize: 14, fontFamily: FONTS.regular, color: COLORS.textDim, marginBottom: 12 }}>
                {game.rules.replace(/-(?=\d)/g, "−")}
              </Text>
            )}

            {/* ── Skins ── */}
            {(gameId === "skins" || gameId === "skins_carry") &&
              calcScopedSkins(contest.groups, contest.course, gameId === "skins_carry", contest.gameConfig).map((group, gi) => {
                const result = group.result;
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
                          testID={`skins-result-${gameId}-${name}`}
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
                            {formatNumber(count)} skin{count !== 1 ? "s" : ""} · {formatMoney(count * contest.betUnit)}
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
                              #{s.hole}: {s.winner} ({formatNumber(s.value)})
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
                const result = contest.gameConfig?.rulesVersion === 1 ? calcNassauRules(group.players, contest.course, gameId === "nassau_press", contest.gameConfig) : calcNassau(group.players[0], group.players[1]);
                return (
                  <View key={gi} style={gi > 0 ? { marginTop: 12 } : undefined}>
                    {contest.groups.length > 1 && (
                      <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 8 }}>
                        {group.name}: {result.p1} vs {result.p2}
                      </Text>
                    )}
                    {"bets" in result && (result as ReturnType<typeof calcNassauRules>).bets.map(b => <Text key={b.id} style={{color:COLORS.textDim}}>{b.id}: holes {b.start}–{b.end}, {formatNumber(b.stake)} units · {b.complete ? b.status === 0 ? "Push" : b.status > 0 ? result.p1 : result.p2 : "Pending"}</Text>)}
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
                              fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
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
                {(contest.gameConfig?.rulesVersion === 1 && gameId === "stableford" ? contestStableford(contest) : (gameId === "mod_stableford" ? calcModStableford : calcStableford)(allPlayers, contest.course)).map((r, i, rows) => (
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
                          minWidth: 24,
                          textAlign: "center",
                          color: COLORS.textDim,
                        }}
                      >
                        {rankLabel(rows.map((row) => row.points), i)}
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
                      {formatNumber(r.points)} pts
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Stroke Play ── */}
            {gameId === "stroke_play" && (
              <View>
                {calcStrokePlay(allPlayers, contest.course).map((r, i, rows) => (
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
                          minWidth: 24,
                          textAlign: "center",
                          color: COLORS.textDim,
                        }}
                      >
                        {rankLabel(rows.map((row) => row.total), i)}
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
                      {formatNumber(r.total)} · {r.toPar === 0 ? "E" : formatNumber(r.toPar, true)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Match Play ── */}
            {gameId === "match_play" &&
              contestMatchPlay(contest).map(({key,roundName,p1,p2,status}) => {
                return (
                  <View key={key} style={{ alignItems: "center", paddingVertical: 8 }}>
                    {roundName && <Text style={{ color: COLORS.textDim, fontSize: 12 }}>{roundName}</Text>}
                    <Text style={{ color: COLORS.textDim, fontSize: 12, fontFamily: FONTS.medium, marginBottom: 8 }}>
                      {p1.name} vs {p2.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 24,
                        fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
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
                        {formatNumber(bestTotal)} ({formatNumber(bestTotal - coursePar, true)})
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {contest.gameConfig?.rulesVersion===1 && ACTUAL_INPUT_GAMES.includes(gameId) && (contest.isTournament?contest.rounds?.flatMap(r=>r.groups.map(g=>({group:g,round:r}))):contest.groups.map(g=>({group:g,round:undefined})))?.map(({group,round})=>{
              const result=actualInputLedger(gameId,group.players,round?.course??contest.course,scopedAuxiliary(contest,group.id,round?.id),contest.gameConfig);
              return <View key={`${round?.id}/${group.id}`}><Text style={{color:COLORS.textDim}}>{round?.name} {group.name}{result.pending?` — pending after hole ${result.holes}`:" — confirmed"}</Text><RankList totals={result.totals} betUnit={contest.betUnit}/></View>;
            })}
            {contest.gameConfig?.rulesVersion===1 && (gameId==="alternate_shot" || gameId==="chapman") && (()=>{const result=calculateContestSettlement(contest,[gameId],1);return <View><Text style={{color:COLORS.textDim}}>{result.pending?"Team cards pending — enter one score per team per hole":"Confirmed team-card settlement"}</Text><RankList totals={result.netByPlayer} betUnit={contest.betUnit}/></View>;})()}
            {contest.gameConfig?.junkNassau && (gameId==="nassau" || gameId==="nassau_press") && <View><Text style={{color:COLORS.textDim}}>Nassau including confirmed junk (pending until all inputs)</Text><RankList totals={calculateContestSettlement(contest,[gameId],1).netByPlayer} betUnit={contest.betUnit}/></View>}
            {contest.gameConfig?.rulesVersion===1 && !ACTUAL_INPUT_GAMES.includes(gameId) && gameId!=="alternate_shot" && gameId!=="chapman" && (()=>{const settled=calculateContestSettlement(contest,[gameId],1);return <View><Text style={{color:COLORS.textDim}}>{settled.pending?"Final settlement pending — confirm all round scores and inputs":roundName?"Round settlement units":"All-round settlement units"}</Text><RankList totals={settled.netByPlayer} betUnit={contest.betUnit}/></View>;})()}
            {/* ── Wolf ── */}
            {gameId === "wolf" && contest.gameConfig?.rulesVersion !== 1 &&
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
            {gameId === "snake" && contest.gameConfig?.rulesVersion !== 1 &&
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
                const ids = [...new Set(group.players.map(p => p.team))];
                if (ids.length !== 2 || ids.some(t => !t) || ids.some(t => group.players.filter(p => p.team === t).length !== 2)) return <Text key={gi}>Vegas requires two assigned pairs.</Text>;
                const result = calcVegas(group.players.filter(p => p.team === ids[0]), group.players.filter(p => p.team === ids[1]), contest.course, contest.gameConfig);
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
                        <Text style={{ fontSize: 22, fontFamily: FONTS.score, fontVariant: ['tabular-nums'], color: result.team1Won > result.team2Won ? COLORS.primary : COLORS.textDim }}>
                          {formatNumber(result.team1Won)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, borderRadius: RADII.md, padding: 12, alignItems: "center", backgroundColor: COLORS.bg }}>
                        <Text style={{ ...TYPOGRAPHY.labelSm, color: COLORS.textDim, marginBottom: 4 }}>Team 2</Text>
                        <Text style={{ fontSize: 22, fontFamily: FONTS.score, fontVariant: ['tabular-nums'], color: result.team2Won > result.team1Won ? COLORS.primary : COLORS.textDim }}>
                          {formatNumber(result.team2Won)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}

            {/* ── Quota ── */}
            {gameId === "quota" && (
              <View>
                {calcQuota(allPlayers, contest.course).map((r, i, rows) => (
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
                          minWidth: 24,
                          textAlign: "center",
                          color: COLORS.textDim,
                        }}
                      >
                        {rankLabel(rows.map((row) => row.overUnder), i)}
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
                      {formatNumber(r.overUnder, true)} ({formatNumber(r.points)}/{formatNumber(r.quota)} quota)
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Chicago ── */}
            {gameId === "chicago" && (
              <View>
                {calcChicago(allPlayers, contest.course).map((r, i, rows) => (
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
                          minWidth: 24,
                          textAlign: "center",
                          color: COLORS.textDim,
                        }}
                      >
                        {rankLabel(rows.map((row) => row.netScore), i)}
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
                      {formatNumber(r.netScore, true)} ({formatNumber(r.grossPoints)}/{formatNumber(r.quota)} quota)
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Rabbit ── */}
            {gameId === "rabbit" &&
              contest.groups.map((group, gi) => {
                const result = calcRabbit(group.players, contest.course, contest.gameConfig);
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
                const result = calcSixes(group.players, contest.course, contest.gameConfig);
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
                {gameId === "skins" || gameId === "skins_carry" ? skinsLabel(contest.gameConfig) + (gameId === "skins_carry" ? " (Carryover)" : "") : game.name} results calculated at settlement
              </Text>
            )}
          </View>
        );
        });
      })}
      {contest.gameConfig?.rulesVersion === 1 && contest.isTournament && contest.games.map(gameId => {
        const settled = calculateContestSettlement(contest,[gameId],1);
        return <View key={`combined/${gameId}`} style={{padding:16}}><Text style={{color:COLORS.textDim}}>{ALL_GAMES.find(g=>g.id===gameId)?.name}: {settled.pending ? "All-round settlement pending" : "All-round settlement units"}</Text><RankList totals={settled.netByPlayer} betUnit={contest.betUnit}/></View>;
      })}
      <Pressable
        testID="games-add-game"
        accessibilityRole="button"
        accessibilityLabel="Add a game"
        onPress={() => router.push(`/contest/${id}/edit`)}
        style={{ minHeight: 52, alignSelf: "stretch", borderRadius: RADII.md, backgroundColor: COLORS.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 }}
      >
        <Plus size={20} color={COLORS.onPrimary} />
        <Text style={{ fontFamily: FONTS.bold, fontSize: 15, color: COLORS.onPrimary }}>Add a game</Text>
      </Pressable>
      <Text style={{ fontSize: 13, fontFamily: FONTS.regular, color: COLORS.textDim, textAlign: "center", marginTop: 12 }}>
        Choose from 50+ game modes.
      </Text>
    </ScrollView>
  );
}
