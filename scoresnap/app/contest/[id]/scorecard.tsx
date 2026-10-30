import { executionGameConfig } from "../../../src/engine/types";
import { actualInputLedger, ACTUAL_INPUT_GAMES } from "../../../src/engine/actual-inputs";
import { PrePlayDeclarations } from "../../../src/ui/PrePlayDeclarations";
import { scopedAuxiliary, calculateContestSettlement } from "../../../src/engine/contest-results";
import { calcNassauRules } from "../../../src/engine/calculators/nassau";
import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Minus,
  Plus,
} from "lucide-react-native";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  RADII,
  GLOW,
  scoreColor,
  scoreName,
} from "../../../src/ui/theme";
import { useContestStore, getActiveGroups } from "../../../src/stores/contest-store";
import { SafeAreaView } from "react-native-safe-area-context";
import AuxiliaryPrompt, {
  needsAuxiliaryPrompt,
  AuxPromptResult,
} from "../../../src/ui/AuxiliaryPrompt";
import { HoleInfo, Player } from "../../../src/engine/types";
import { calcNassauPress } from "../../../src/engine/calculators/nassau-press";
import { calcSkins } from "../../../src/engine/calculators/skins";

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const savedContest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );

  const contest=savedContest?{...savedContest,gameConfig:executionGameConfig(savedContest.games,savedContest.gameConfig)}:undefined;
  const updateScore = useContestStore((s) => s.updateScore);
  const completeContest = useContestStore((s) => s.completeContest);
  const updateAuxiliaryData = useContestStore((s) => s.updateAuxiliaryData);

  const [currentHole, setCurrentHole] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState(0);
  const [showAuxPrompt, setShowAuxPrompt] = useState(false);
  const [declaration,setDeclaration]=useState<"wolf"|"bisque"|"jokerDeclarations"|null>(null);

  if (!contest) return null;

  // For tournaments, use current round's groups; for legacy, use contest groups
  const activeGroups = getActiveGroups(contest);
  const group = activeGroups[selectedGroup];
  if (!group) return null;

  const activeRound=contest.isTournament?contest.rounds?.find(r=>r.number===contest.currentRound):undefined;
  const sharedCard=contest.gameConfig?.rulesVersion===1 && contest.games.some(g=>g==="alternate_shot" || g==="chapman");
  const auxiliary=scopedAuxiliary(contest,group.id,activeRound?.id);
  const displayPlayers=sharedCard?group.players.filter((p,i,all)=>all.findIndex(q=>q.team===p.team)===i).map(p=>({...p,name:`Team ${p.team}`,scores:(activeRound?.course??contest.course).holes.map((_,i)=>auxiliary.teamCards?.[i+1]?.[p.team!]??0)})):group.players;
  const holeData = (activeRound?.course??contest.course).holes[currentHole - 1];
  const par = holeData?.par || 4;
  const hcp = holeData?.hcp || 0;
  const isCompleted = contest.status === "completed";

  // Build current-hole scores map for AuxiliaryPrompt (Tier 2 games)
  const currentPlayerScores = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of group.players) {
      map.set(p.id, p.scores[currentHole - 1] || 0);
    }
    return map;
  }, [group.players, currentHole]);

  // Wolf rotation order
  const wolfOrder = useMemo(
    () => group.players.map((p) => p.id),
    [group.players]
  );

  const currentHoleInfo: HoleInfo = holeData || {
    num: currentHole,
    par: 4,
    hcp: 0,
    yards: 0,
  };

  // ── Live game status (Nassau press, skins carryover, etc.) ──
  const liveGameStatus = useMemo(() => {
    const statuses: { label: string; detail: string; color: string }[] = [];
    const players = group.players;

    // Nassau / Nassau Press status
    if (
      (contest.games.includes("nassau") || contest.games.includes("nassau_press")) &&
      players.length >= 2
    ) {
      const ledger = contest.gameConfig?.rulesVersion === 1 ? calcNassauRules(players, contest.course, contest.games.includes("nassau_press"), contest.gameConfig) : undefined;
      const result = ledger ? {...ledger,presses:ledger.bets.filter(b => b.parent).map(b => ({startHole:b.start}))} : calcNassauPress(players[0], players[1]);
      const isBack9 = currentHole > 9;
      const nineStatus = isBack9 ? result.back : result.front;
      const nineName = isBack9 ? "Back 9" : "Front 9";
      const leader = nineStatus > 0 ? players[0].name : nineStatus < 0 ? players[1].name : null;

      if (Math.abs(nineStatus) >= 1) {
        statuses.push({
          label: `${nineName}: ${leader?.split(" ")[0]} ${Math.abs(nineStatus)} UP`,
          detail: "",
          color: COLORS.primary,
        });
      }

      if (result.presses.length > 0) {
        statuses.push({
          label: `PRESS! (${result.presses.length} active)`,
          detail: `Started hole ${result.presses[result.presses.length - 1].startHole}`,
          color: COLORS.warn,
        });
      }

      // Detect if press is about to trigger (someone is exactly 2 down)
      if (!ledger && Math.abs(nineStatus) === 2 && result.presses.length === 0) {
        const downPlayer = nineStatus > 0 ? players[1].name : players[0].name;
        statuses.push({
          label: `${downPlayer.split(" ")[0]} is 2-DOWN`,
          detail: "Auto-press triggered!",
          color: COLORS.error,
        });
      }
    }

    if(contest.gameConfig?.rulesVersion===1)for(const game of contest.games.filter(g=>ACTUAL_INPUT_GAMES.includes(g))){const result=actualInputLedger(game,players,activeRound?.course??contest.course,auxiliary,contest.gameConfig);statuses.push({label:`${game.replace(/_/g," ")}: ${result.pending?"pending":"confirmed"}`,detail:`${result.holes} confirmed holes · ${players.map(p=>`${p.name} ${result.totals[p.name]}u`).join(", ")}`,color:result.pending?COLORS.warn:COLORS.primary});}
    // Skins carryover status
    if (
      (contest.games.includes("skins") || contest.games.includes("skins_carry")) &&
      players.length >= 2
    ) {
      const isCarry = contest.games.includes("skins_carry");
      const result = calcSkins(players, contest.course, isCarry, contest.gameConfig?.skinsMode, contest.gameConfig);
      const carriedSkins = result.remaining;
      if (carriedSkins > 0) {
        statuses.push({
          label: `${carriedSkins} skin${carriedSkins > 1 ? "s" : ""} carrying`,
          detail: `${carriedSkins + 1}x value next win`,
          color: COLORS.gold,
        });
      }
    }

    return statuses;
  }, [group.players, currentHole, contest.games, contest.course, contest.gameConfig, auxiliary, activeRound]);

  // ── Score adjustment via +/- buttons ──
  const adjustScore = useCallback(
    (playerId: string, delta: number) => {
      if (isCompleted) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const player = displayPlayers.find((p) => p.id === playerId);
      if (!player) return;

      const currentScore = player.scores[currentHole - 1] || 0;
      // If no score entered yet, start from par
      const baseScore = currentScore > 0 ? currentScore : par;
      const newScore = Math.max(1, Math.min(15, baseScore + delta));

      if(contest.gameConfig?.bisqueHandicap && !auxiliary.bisque?.[currentHole]) {setDeclaration("bisque");return;}
      if(contest.gameConfig?.jokerEnabled && !auxiliary.jokerDeclarations?.[0]) {setDeclaration("jokerDeclarations");return;}
      if(contest.gameConfig?.rulesVersion===1 && contest.games.includes("wolf") && !auxiliary.wolf?.[currentHole]) {setDeclaration("wolf");return;}
      updateScore(contest.id, group.id, playerId, currentHole, newScore);
    },
    [contest, auxiliary, group, displayPlayers, currentHole, par, updateScore, isCompleted]
  );

  // Set a player to exactly par (tap the score display)
  const setToPar = useCallback(
    (playerId: string) => {
      if (isCompleted) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if(contest.gameConfig?.bisqueHandicap && !auxiliary.bisque?.[currentHole]) {setDeclaration("bisque");return;}
      if(contest.gameConfig?.jokerEnabled && !auxiliary.jokerDeclarations?.[0]) {setDeclaration("jokerDeclarations");return;}
      if(contest.gameConfig?.rulesVersion===1 && contest.games.includes("wolf") && !auxiliary.wolf?.[currentHole]) {setDeclaration("wolf");return;}
      updateScore(contest.id, group.id, playerId, currentHole, par);
    },
    [contest, auxiliary, group.id, currentHole, par, updateScore, isCompleted]
  );

  // Clear a player's score (long press the score)
  const clearScore = useCallback(
    (playerId: string) => {
      if (isCompleted) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      updateScore(contest.id, group.id, playerId, currentHole, 0);
    },
    [contest.id, group.id, currentHole, updateScore, isCompleted]
  );

  // ── Hole Navigation ──
  const advanceToNextHole = useCallback(() => {
    if (currentHole < 18) {
      setCurrentHole(currentHole + 1);
    }
  }, [currentHole]);

  const handleNextHole = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Check if Tier 2 games need aux input before advancing
    if (contest.gameConfig?.junkNassau || needsAuxiliaryPrompt(contest.games.filter(g=>g!=="wolf" || !auxiliary.wolf?.[currentHole]), currentHoleInfo, currentPlayerScores)) {
      setShowAuxPrompt(true);
    } else {
      advanceToNextHole();
    }
  }, [contest.games, contest.gameConfig, auxiliary, currentHole, currentHoleInfo, currentPlayerScores, advanceToNextHole]);

  const handlePrevHole = useCallback(() => {
    if (currentHole > 1) {
      setCurrentHole(currentHole - 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [currentHole]);

  // Handle Tier 2 aux prompt results
  const handleAuxComplete = useCallback(
    (results: AuxPromptResult) => {
      try {
      if (results.junk) updateAuxiliaryData(contest.id,"junk",currentHole,results.junk,group.id);
      if (results.bbb) updateAuxiliaryData(contest.id, "bbb", currentHole, results.bbb, group.id);
      if (results.wolf) {
        updateAuxiliaryData(contest.id, "wolf", currentHole, results.wolf, group.id);
      }
      if (results.hammer) {
        updateAuxiliaryData(contest.id, "hammer", currentHole, results.hammer, group.id);
      }
      if (results.snake) {
        updateAuxiliaryData(contest.id, "snake", currentHole, results.snake, group.id);
      }
      if (results.greenies !== undefined) {
        updateAuxiliaryData(contest.id, "greenies", currentHole, results.greenies, group.id);
      }
      setShowAuxPrompt(false);advanceToNextHole();
      } catch(error){Alert.alert("Confirm inputs",String(error));}
    },
    [contest.id, group.id, currentHole, updateAuxiliaryData, advanceToNextHole]
  );

  const handleAuxSkip = useCallback(() => {
    setShowAuxPrompt(false);
    advanceToNextHole();
  }, [advanceToNextHole]);

  const handleFinalizeRound = useCallback(() => {
    if(contest.gameConfig?.rulesVersion===1){
      const result=calculateContestSettlement(contest);
      if(result.pending){
        if((contest.gameConfig?.junkNassau || needsAuxiliaryPrompt(contest.games,currentHoleInfo,currentPlayerScores))) setShowAuxPrompt(true);
        Alert.alert("Confirmation required","Enter every score and confirm side-bet inputs on every hole before finalizing. Skip leaves that hole pending.");
        return;
      }
    }
    const allPlayers = activeGroups.flatMap((g) => g.players);
    const totalScores = allPlayers.reduce(
      (sum, p) => sum + p.scores.filter((s) => s > 0).length,
      0
    );
    const totalExpected = allPlayers.length * 18;
    const percentComplete = Math.round((totalScores / totalExpected) * 100);

    if (percentComplete < 50) {
      Alert.alert(
        "Incomplete Scorecard",
        `Only ${percentComplete}% of scores have been entered. Are you sure you want to finalize?`,
        [
          { text: "Keep Scoring", style: "cancel" },
          {
            text: "Finalize Anyway",
            style: "destructive",
            onPress: () => doFinalize(),
          },
        ]
      );
    } else if (percentComplete < 100) {
      Alert.alert(
        "Finalize Round?",
        `${percentComplete}% of scores entered. Missing scores will be counted as 0. This locks the scorecard.`,
        [
          { text: "Keep Scoring", style: "cancel" },
          { text: "Finalize", onPress: () => doFinalize() },
        ]
      );
    } else {
      Alert.alert(
        "Finalize Round?",
        "This will lock scores and calculate final settlements. You can still view results after.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Finalize", onPress: () => doFinalize() },
        ]
      );
    }
  }, [contest]);

  const doFinalize = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {completeContest(contest.id);} catch(error){Alert.alert("Confirmation required",String(error));}
  };

  // Calculate completion
  const allPlayers = sharedCard?activeGroups.flatMap(g=>{const aux=scopedAuxiliary(contest,g.id,activeRound?.id);return [...new Set(g.players.map(p=>p.team!))].map(team=>({scores:(activeRound?.course??contest.course).holes.map((_,i)=>aux.teamCards?.[i+1]?.[team]??0)}));}):activeGroups.flatMap((g) => g.players);
  const totalScores = allPlayers.reduce(
    (sum, p) => sum + p.scores.filter((s) => s > 0).length,
    0
  );
  const totalExpected = allPlayers.length * 18;
  const percentComplete =
    totalExpected > 0 ? Math.round((totalScores / totalExpected) * 100) : 0;

  // Check if all players on current hole have scores
  const allScoredOnHole = displayPlayers.every(
    (p) => (p.scores[currentHole - 1] || 0) > 0
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {/* Completed Banner */}
        {isCompleted && (
          <View
            style={{
              backgroundColor: COLORS.primary + "15",
              paddingVertical: 8,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <CheckCircle size={14} color={COLORS.primary} />
            <Text
              style={{
                color: COLORS.primary,
                fontSize: 12,
                fontFamily: FONTS.bold,
              }}
            >
              Round Finalized — Scores Locked
            </Text>
          </View>
        )}

        {/* Top Section: Hole Info */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 8,
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text
              style={{
                ...TYPOGRAPHY.labelSm,
                color: COLORS.textDim,
              }}
            >
              CURRENT ROUND
            </Text>
            <Text
              style={{
                fontSize: 40,
                fontFamily: FONTS.headline,
                color: COLORS.text,
                marginTop: 2,
              }}
            >
              HOLE {String(currentHole).padStart(2, "0")}
            </Text>
          </View>

          {/* Par + HCP badges */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <View
              style={{
                backgroundColor: COLORS.surfaceHigh,
                borderRadius: RADII.md,
                paddingHorizontal: 12,
                paddingVertical: 6,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  ...TYPOGRAPHY.labelSm,
                  color: COLORS.textDim,
                }}
              >
                PAR
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                  color: COLORS.text,
                }}
              >
                {par}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: COLORS.surfaceHigh,
                borderRadius: RADII.md,
                paddingHorizontal: 12,
                paddingVertical: 6,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  ...TYPOGRAPHY.labelSm,
                  color: COLORS.textDim,
                }}
              >
                HCP
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                  color: COLORS.text,
                }}
              >
                {hcp}
              </Text>
            </View>
          </View>
        </View>

        {contest.gameConfig?.rulesVersion===1 && <View style={{paddingHorizontal:20}}>
          {contest.games.includes("wolf") && <Pressable disabled={group.players.some(p=>p.scores[currentHole-1]>0)} onPress={()=>setDeclaration("wolf")}><Text style={{color:COLORS.primary,padding:12}}>Record Wolf decision before play {auxiliary.wolf?.[currentHole]?"✓":"— required"}</Text></Pressable>}
          {contest.gameConfig.bisqueHandicap && <Pressable disabled={group.players.some(p=>p.scores[currentHole-1]>0)} onPress={()=>setDeclaration("bisque")}><Text style={{color:COLORS.primary,padding:12}}>Declare 0–2 Bisque strokes before this hole {auxiliary.bisque?.[currentHole]?"✓":"— required"}</Text></Pressable>}
          {contest.gameConfig.jokerEnabled && <Pressable disabled={group.players.some(p=>p.scores.some(n=>n>0))} onPress={()=>setDeclaration("jokerDeclarations")}><Text style={{color:COLORS.primary,padding:12}}>Record two public Joker holes per player before round {auxiliary.jokerDeclarations?.[0]?"✓":"— required"}</Text></Pressable>}
        </View>}
        {declaration && <PrePlayDeclarations kind={declaration} players={group.players} course={activeRound?.course??contest.course} hole={currentHole} config={contest.gameConfig??{}} onClose={()=>setDeclaration(null)} onSave={(key,h,value)=>{try{updateAuxiliaryData(contest.id,key,h,value,group.id);}catch(error){Alert.alert("Invalid declaration",String(error));}}}/>}
        {contest.gameConfig?.progressiveSnake && <Text style={{color:COLORS.textDim,paddingHorizontal:20}}>Progressive Snake exposure: after N changes of holder, each opponent receives {contest.betUnit} × 2^N from the final holder. Maximum with this group: {group.players.length*(activeRound?.course??contest.course).holes.length-1} changes. Unsafe numeric amounts cannot settle.</Text>}
        {/* Live Game Status Banners */}
        {liveGameStatus.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 8, gap: 6 }}>
            {liveGameStatus.map((status, i) => (
              <Animated.View
                key={`${status.label}-${i}`}
                entering={FadeIn.duration(300)}
                style={{
                  backgroundColor: status.color + "18",
                  borderRadius: RADII.md,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.bold,
                    fontSize: 12,
                    color: status.color,
                    letterSpacing: 0.5,
                  }}
                >
                  {status.label}
                </Text>
                {status.detail ? (
                  <Text
                    style={{
                      fontFamily: FONTS.medium,
                      fontSize: 11,
                      color: status.color,
                      opacity: 0.8,
                    }}
                  >
                    {status.detail}
                  </Text>
                ) : null}
              </Animated.View>
            ))}
          </View>
        )}

        {/* Group Selector (if multiple groups) */}
        {activeGroups.length > 1 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, marginBottom: 4, gap: 8 }}>
            {activeGroups.map((g, gi) => (
              <Pressable
                key={g.id}
                onPress={() => {
                  setSelectedGroup(gi);
                }}
                style={{
                  backgroundColor:
                    gi === selectedGroup
                      ? COLORS.primary
                      : COLORS.surfaceMid,
                  borderRadius: RADII.md,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  alignSelf: "flex-start",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: FONTS.semibold,
                    color:
                      gi === selectedGroup
                        ? COLORS.onPrimary
                        : COLORS.textDim,
                  }}
                >
                  {g.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Player Score Steppers ── */}
        <ScrollView
          style={{ flex: 1, marginTop: 8 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {displayPlayers.map((player, idx) => {
            const score = player.scores[currentHole - 1] || 0;
            const hasScore = score > 0;
            const displayScore = hasScore ? score : par;
            const diff = hasScore ? score - par : 0;
            const color = hasScore ? scoreColor(score, par) : COLORS.textDim;
            const label = hasScore ? scoreName(score, par) : "par";
            const total = player.scores.reduce((a, b) => a + b, 0);
            const holesPlayed = player.scores.filter((s) => s > 0).length;
            const totalPar = contest.course.holes
              .slice(0, holesPlayed)
              .reduce((a, h) => a + h.par, 0);
            const totalToPar = total - totalPar;

            return (
              <Animated.View
                key={player.id}
                entering={FadeIn.delay(idx * 50).duration(200)}
                style={{
                  backgroundColor: COLORS.surfaceHigh,
                  borderRadius: RADII.lg,
                  padding: 14,
                  borderLeftWidth: 3,
                  borderLeftColor: hasScore ? color : COLORS.surfaceHighest,
                  opacity: isCompleted ? 0.7 : 1,
                }}
              >
                {/* Player info row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    {player.team && contest.hasTeams && (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor:
                            player.team === "A"
                              ? COLORS.primary
                              : COLORS.secondary,
                        }}
                      />
                    )}
                    <View>
                      <Text
                        style={{
                          fontSize: 15,
                          fontFamily: FONTS.bold,
                          color: COLORS.text,
                        }}
                      >
                        {player.name}
                      </Text>
                      {holesPlayed > 0 && (
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: FONTS.medium,
                            color: COLORS.textDim,
                            marginTop: 1,
                          }}
                        >
                          Thru {holesPlayed} — {total} (
                          {totalToPar > 0 ? "+" : ""}
                          {totalToPar === 0 ? "E" : totalToPar})
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: FONTS.regular,
                      color: COLORS.textDim,
                    }}
                  >
                    {player.handicap} hcp
                  </Text>
                </View>

                {/* Score stepper row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                  }}
                >
                  {/* Minus button */}
                  <Pressable
                    onPress={() => adjustScore(player.id, -1)}
                    disabled={isCompleted || displayScore <= 1}
                    style={({ pressed }) => ({
                      width: 52,
                      height: 52,
                      borderRadius: RADII.lg,
                      backgroundColor: COLORS.surfaceMid,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity:
                        isCompleted || displayScore <= 1 ? 0.3 : pressed ? 0.7 : 1,
                      transform: [{ scale: pressed ? 0.92 : 1 }],
                    })}
                  >
                    <Minus size={24} color={COLORS.text} strokeWidth={2.5} />
                  </Pressable>

                  {/* Score display — tap sets to par, long press clears */}
                  <Pressable
                    testID={`score-par-${player.name}`}
                    onPress={() => {
                      if (!hasScore) setToPar(player.id);
                    }}
                    onLongPress={() => clearScore(player.id)}
                    disabled={isCompleted}
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 90,
                    }}
                  >
                    <Animated.Text
                      key={`score-${player.id}-${currentHole}-${score}`}
                      entering={SlideInUp.duration(150).springify()}
                      // The entering number crosses other players' controls.
                      // Keep taps on the stationary Pressable underneath it.
                      pointerEvents="none"
                      style={{
                        fontSize: 40,
                        fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                        color: hasScore ? color : COLORS.textDim + "60",
                        lineHeight: 46,
                      }}
                    >
                      {hasScore ? score : par}
                    </Animated.Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: FONTS.semibold,
                        color: hasScore ? color : COLORS.textDim + "88",
                        textTransform: "uppercase",
                        marginTop: 2,
                      }}
                    >
                      {hasScore
                        ? diff === 0
                          ? label
                          : `${diff > 0 ? "+" : ""}${diff} (${label})`
                        : label}
                    </Text>
                  </Pressable>

                  {/* Plus button */}
                  <Pressable
                    testID={`score-plus-${player.name}`}
                    onPress={() => adjustScore(player.id, 1)}
                    disabled={isCompleted || displayScore >= 15}
                    style={({ pressed }) => ({
                      width: 52,
                      height: 52,
                      borderRadius: RADII.lg,
                      backgroundColor: COLORS.surfaceMid,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity:
                        isCompleted || displayScore >= 15
                          ? 0.3
                          : pressed
                          ? 0.7
                          : 1,
                      transform: [{ scale: pressed ? 0.92 : 1 }],
                    })}
                  >
                    <Plus size={24} color={COLORS.text} strokeWidth={2.5} />
                  </Pressable>
                </View>
              </Animated.View>
            );
          })}
        </ScrollView>

        {/* ── Bottom Controls ── */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 8,
          }}
        >
          {/* Hole Navigation */}
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginBottom: 4,
            }}
          >
            <Pressable
              onPress={handlePrevHole}
              disabled={currentHole <= 1}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                backgroundColor: COLORS.surfaceMid,
                borderRadius: RADII.md,
                paddingVertical: 12,
                opacity: currentHole <= 1 ? 0.3 : 1,
              }}
            >
              <ChevronLeft size={16} color={COLORS.textDim} />
              <Text
                style={{
                  ...TYPOGRAPHY.labelSm,
                  color: COLORS.textDim,
                }}
              >
                PREV
              </Text>
            </Pressable>
            <Pressable
              testID="score-next-hole"
              onPress={handleNextHole}
              disabled={isCompleted}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                backgroundColor: allScoredOnHole
                  ? COLORS.primary + "22"
                  : COLORS.surfaceMid,
                borderRadius: RADII.md,
                paddingVertical: 12,
                borderWidth: allScoredOnHole ? 1 : 0,
                borderColor: COLORS.primary + "44",
                opacity: currentHole >= 18 ? 0.3 : 1,
              }}
            >
              <Text
                style={{
                  ...TYPOGRAPHY.labelSm,
                  color: allScoredOnHole ? COLORS.primary : COLORS.textDim,
                }}
              >
                NEXT
              </Text>
              <ChevronRight
                size={16}
                color={allScoredOnHole ? COLORS.primary : COLORS.textDim}
              />
            </Pressable>
          </View>

          {/* Finalize Round */}
          {!isCompleted && (
            <View style={{ marginTop: 4 }}>
              {/* Progress bar */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <Text
                  style={{
                    ...TYPOGRAPHY.labelSm,
                    color: COLORS.textDim,
                  }}
                >
                  ROUND PROGRESS
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: FONTS.bold,
                    color:
                      percentComplete === 100
                        ? COLORS.primary
                        : COLORS.textDim,
                  }}
                >
                  {percentComplete}%
                </Text>
              </View>
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: COLORS.surfaceHighest,
                  marginBottom: 10,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${percentComplete}%`,
                    borderRadius: 2,
                    backgroundColor:
                      percentComplete === 100
                        ? COLORS.primary
                        : COLORS.primaryContainer,
                  }}
                />
              </View>

              <Pressable
                onPress={handleFinalizeRound}
                style={{
                  backgroundColor:
                    percentComplete === 100
                      ? COLORS.primary
                      : COLORS.surfaceMid,
                  borderRadius: RADII.lg,
                  paddingVertical: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  ...(percentComplete === 100 ? GLOW.primary : {}),
                }}
              >
                <CheckCircle
                  size={18}
                  color={
                    percentComplete === 100
                      ? COLORS.onPrimary
                      : COLORS.warn
                  }
                />
                <Text
                  style={{
                    color:
                      percentComplete === 100
                        ? COLORS.onPrimary
                        : COLORS.warn,
                    fontFamily: FONTS.bold,
                    fontSize: 15,
                  }}
                >
                  Finalize Round
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* Tier 2 Game Auxiliary Prompts */}
      <AuxiliaryPrompt
        visible={showAuxPrompt}
        holeNumber={currentHole}
        holeInfo={currentHoleInfo}
        players={group.players}
        gameConfig={contest.gameConfig}
        wolfConfirmed={!!auxiliary.wolf?.[currentHole]}
        activeGames={contest.games}
        currentPlayerScores={currentPlayerScores}
        wolfOrder={wolfOrder}
        onComplete={handleAuxComplete}
        onSkip={handleAuxSkip}
      />
    </View>
  );
}
