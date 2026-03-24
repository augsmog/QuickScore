import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { HelpCircle, ChevronLeft, ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW } from "../../src/ui/theme";
import { useContestStore } from "../../src/stores/contest-store";
import type { AuxiliaryData } from "../../src/engine/types";
import { GamePromptSheet } from "../../src/ui/GamePromptSheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tier2Game = "wolf" | "hammer" | "snake" | "greenies" | "bingo_bango_bongo";

const TIER2_GAMES: Tier2Game[] = [
  "wolf",
  "hammer",
  "snake",
  "greenies",
  "bingo_bango_bongo",
];

interface HoleQuestion {
  hole: number;
  par: number;
  yards: number;
  games: Tier2Game[];
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function GameDetailsScreen() {
  const router = useRouter();
  const { contestId, groupId } = useLocalSearchParams<{
    contestId: string;
    groupId: string;
  }>();

  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === contestId)
  );
  const updateAuxiliaryData = useContestStore((s) => s.updateAuxiliaryData);

  const group = contest?.groups.find((g) => g.id === groupId);
  const holes = contest?.course.holes ?? [];

  // Determine which Tier 2 games are active in this contest
  const activeGames = useMemo<Tier2Game[]>(() => {
    if (!contest) return [];
    return TIER2_GAMES.filter((g) =>
      contest.games.includes(g as any)
    );
  }, [contest]);

  // Build the list of holes that need questions, and which games per hole
  const holeQuestions = useMemo<HoleQuestion[]>(() => {
    if (!contest || !group || activeGames.length === 0) return [];

    const questions: HoleQuestion[] = [];

    for (const holeInfo of holes) {
      const gamesForHole: Tier2Game[] = [];

      for (const game of activeGames) {
        switch (game) {
          case "wolf":
          case "hammer":
          case "bingo_bango_bongo":
            // Every hole
            gamesForHole.push(game);
            break;

          case "snake": {
            // Only holes where at least one player scored bogey+
            const anyBogeyPlus = group.players.some(
              (p) => (p.scores[holeInfo.num - 1] || 0) > holeInfo.par
            );
            if (anyBogeyPlus) gamesForHole.push(game);
            break;
          }

          case "greenies":
            // Only par 3 holes
            if (holeInfo.par === 3) gamesForHole.push(game);
            break;
        }
      }

      if (gamesForHole.length > 0) {
        questions.push({
          hole: holeInfo.num,
          par: holeInfo.par,
          yards: holeInfo.yards,
          games: gamesForHole,
        });
      }
    }

    return questions;
  }, [contest, group, activeGames, holes]);

  const totalQuestions = holeQuestions.length;

  // Navigation state
  const [currentIdx, setCurrentIdx] = useState(0);
  // Which game within the current hole is being answered
  const [gameSubIdx, setGameSubIdx] = useState(0);

  // Accumulated answers: { [gameKey]: { [hole]: data } }
  const [answers, setAnswers] = useState<Record<string, Record<number, any>>>({});

  // Prompt sheet visibility
  const [sheetVisible, setSheetVisible] = useState(true);

  const currentHoleQ = holeQuestions[currentIdx];
  const currentGame = currentHoleQ?.games[gameSubIdx] ?? null;

  // Players with their score for the current hole
  const playersForHole = useMemo(() => {
    if (!group || !currentHoleQ) return [];
    return group.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.scores[currentHoleQ.hole - 1] || 0,
    }));
  }, [group, currentHoleQ]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const storeAnswer = useCallback(
    (game: Tier2Game, hole: number, data: any) => {
      setAnswers((prev) => ({
        ...prev,
        [game]: {
          ...(prev[game] || {}),
          [hole]: data,
        },
      }));
    },
    []
  );

  const advanceToNext = useCallback(() => {
    if (!currentHoleQ) return;

    // If there are more games for this hole, advance the sub-index
    if (gameSubIdx < currentHoleQ.games.length - 1) {
      setGameSubIdx((prev) => prev + 1);
      setSheetVisible(true);
      return;
    }

    // Move to next hole question
    if (currentIdx < totalQuestions - 1) {
      setCurrentIdx((prev) => prev + 1);
      setGameSubIdx(0);
      setSheetVisible(true);
      return;
    }

    // Done -- commit all answers
    commitAndFinish();
  }, [currentHoleQ, gameSubIdx, currentIdx, totalQuestions]);

  const goToPrev = useCallback(() => {
    if (gameSubIdx > 0) {
      setGameSubIdx((prev) => prev - 1);
      setSheetVisible(true);
      return;
    }
    if (currentIdx > 0) {
      const prevQ = holeQuestions[currentIdx - 1];
      setCurrentIdx((prev) => prev - 1);
      setGameSubIdx(prevQ.games.length - 1);
      setSheetVisible(true);
    }
  }, [gameSubIdx, currentIdx, holeQuestions]);

  const commitAndFinish = useCallback(() => {
    if (!contestId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Persist each game's answers to the store
    for (const [gameKey, holeData] of Object.entries(answers)) {
      for (const [holeStr, data] of Object.entries(holeData)) {
        updateAuxiliaryData(
          contestId,
          gameKey as keyof AuxiliaryData,
          Number(holeStr),
          data
        );
      }
    }

    router.replace(`/contest/${contestId}` as any);
  }, [contestId, answers, updateAuxiliaryData, router]);

  const handleSkipAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace(`/contest/${contestId}` as any);
  };

  const handlePromptSubmit = (data: any) => {
    if (!currentHoleQ || !currentGame) return;
    storeAnswer(currentGame, currentHoleQ.hole, data);
    setSheetVisible(false);
    // Small delay so sheet animation finishes before advancing
    setTimeout(advanceToNext, 200);
  };

  const handlePromptClose = () => {
    setSheetVisible(false);
    setTimeout(advanceToNext, 200);
  };

  // ---------------------------------------------------------------------------
  // Progress calculation
  // ---------------------------------------------------------------------------

  // Total sub-questions (each game per hole is one question)
  const totalSubQuestions = useMemo(
    () => holeQuestions.reduce((sum, hq) => sum + hq.games.length, 0),
    [holeQuestions]
  );

  // Answered so far
  const answeredSoFar = useMemo(() => {
    let count = 0;
    for (let i = 0; i < currentIdx; i++) {
      count += holeQuestions[i].games.length;
    }
    count += gameSubIdx;
    return count;
  }, [currentIdx, gameSubIdx, holeQuestions]);

  const progressFraction =
    totalSubQuestions > 0 ? answeredSoFar / totalSubQuestions : 0;

  // ---------------------------------------------------------------------------
  // Edge case: no questions needed
  // ---------------------------------------------------------------------------

  if (totalQuestions === 0) {
    // No Tier 2 games or no holes that need input -- go straight to contest
    if (contestId) {
      router.replace(`/contest/${contestId}` as any);
    } else {
      router.back();
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Game label mapping
  // ---------------------------------------------------------------------------

  const gameEmoji: Record<Tier2Game, string> = {
    wolf: "\uD83D\uDC3A",
    hammer: "\uD83D\uDD28",
    snake: "\uD83D\uDC0D",
    greenies: "\uD83D\uDFE2",
    bingo_bango_bongo: "\uD83C\uDFAF",
  };

  const gameLabel: Record<Tier2Game, string> = {
    wolf: "Wolf",
    hammer: "Hammer",
    snake: "Snake",
    greenies: "Greenies",
    bingo_bango_bongo: "BBB",
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isFirstQuestion = currentIdx === 0 && gameSubIdx === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* ===== HEADER ===== */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: FONTS.headline,
            fontSize: 16,
            color: COLORS.text,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          SCORESNAP
        </Text>
        <Pressable
          style={{
            width: 32,
            height: 32,
            borderRadius: RADII.full,
            backgroundColor: COLORS.surfaceHigh,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <HelpCircle size={16} color={COLORS.textDim} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== HEADING ===== */}
        <Text
          style={{
            ...TYPOGRAPHY.headline,
            color: COLORS.text,
            marginBottom: 4,
          }}
        >
          Game Details
        </Text>
        <Text
          style={{
            ...TYPOGRAPHY.label,
            color: COLORS.textDim,
            marginBottom: 20,
          }}
        >
          VERIFY SIDE BET RESULTS
        </Text>

        {/* ===== PROGRESS BAR ===== */}
        <View style={{ marginBottom: 20 }}>
          <View
            style={{
              height: 8,
              backgroundColor: COLORS.surfaceHigh,
              borderRadius: RADII.full,
              overflow: "hidden",
              marginBottom: 6,
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${Math.min(progressFraction * 100, 100)}%`,
                backgroundColor: COLORS.primary,
                borderRadius: RADII.full,
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: FONTS.medium,
              fontSize: 12,
              color: COLORS.textDim,
            }}
          >
            Progress: {answeredSoFar}/{totalSubQuestions} questions
          </Text>
        </View>

        {/* ===== CURRENT HOLE INFO ===== */}
        {currentHoleQ && (
          <View
            style={{
              backgroundColor: COLORS.surfaceMid,
              borderRadius: RADII.lg,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.headline,
                fontSize: 20,
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              HOLE {currentHoleQ.hole} {"\u00B7"} Par {currentHoleQ.par}{" "}
              {"\u00B7"} {currentHoleQ.yards} yds
            </Text>

            {/* Game badges for this hole */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {currentHoleQ.games.map((g, i) => {
                const isCurrent = i === gameSubIdx;
                const isAnswered = answers[g]?.[currentHoleQ.hole] !== undefined;
                return (
                  <View
                    key={g}
                    style={{
                      backgroundColor: isCurrent
                        ? COLORS.primary + "22"
                        : isAnswered
                        ? COLORS.surfaceHighest
                        : COLORS.surfaceHigh,
                      borderRadius: RADII.md,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderWidth: isCurrent ? 1 : 0,
                      borderColor: isCurrent ? COLORS.primary : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.bold,
                        fontSize: 11,
                        color: isCurrent
                          ? COLORS.primary
                          : isAnswered
                          ? COLORS.textDim
                          : COLORS.text,
                      }}
                    >
                      {gameEmoji[g]} {gameLabel[g]}
                      {isAnswered ? " \u2713" : ""}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Player scores summary */}
            <View style={{ marginTop: 14, gap: 6 }}>
              {playersForHole.map((p) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.medium,
                      fontSize: 14,
                      color: COLORS.text,
                    }}
                  >
                    {p.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONTS.headline,
                      fontSize: 16,
                      color: COLORS.text,
                    }}
                  >
                    {p.score}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ===== TAP TO ANSWER PROMPT ===== */}
        {currentGame && !sheetVisible && (
          <Pressable
            onPress={() => setSheetVisible(true)}
            style={{
              backgroundColor: COLORS.primary + "1A",
              borderRadius: RADII.lg,
              borderWidth: 1,
              borderColor: COLORS.primary + "44",
              padding: 16,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.semibold,
                fontSize: 14,
                color: COLORS.primary,
              }}
            >
              Tap to answer: {gameEmoji[currentGame]} {gameLabel[currentGame]}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* ===== BOTTOM NAVIGATION ===== */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: COLORS.bg,
          paddingHorizontal: 20,
          paddingBottom: 36,
          paddingTop: 14,
        }}
      >
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          {/* Prev */}
          <Pressable
            onPress={() => {
              if (!isFirstQuestion) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                goToPrev();
              }
            }}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: isFirstQuestion
                ? COLORS.surfaceHigh
                : COLORS.surfaceMid,
              borderRadius: RADII.lg,
              paddingVertical: 14,
              opacity: isFirstQuestion ? 0.4 : 1,
            }}
          >
            <ChevronLeft size={16} color={COLORS.text} />
            <Text
              style={{
                fontFamily: FONTS.semibold,
                fontSize: 14,
                color: COLORS.text,
              }}
            >
              Prev
            </Text>
          </Pressable>

          {/* Next / Finish */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              advanceToNext();
            }}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: COLORS.primary,
              borderRadius: RADII.lg,
              paddingVertical: 14,
              ...GLOW.primary,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.semibold,
                fontSize: 14,
                color: COLORS.onPrimary,
              }}
            >
              {currentIdx === totalQuestions - 1 &&
              gameSubIdx === (currentHoleQ?.games.length ?? 1) - 1
                ? "Finish"
                : "Next"}
            </Text>
            <ChevronRight size={16} color={COLORS.onPrimary} />
          </Pressable>
        </View>

        {/* Skip all */}
        <Pressable
          onPress={handleSkipAll}
          style={{ alignItems: "center", paddingVertical: 8 }}
        >
          <Text
            style={{
              fontFamily: FONTS.regular,
              fontSize: 13,
              color: COLORS.textDim,
            }}
          >
            Skip All — Use Scores Only
          </Text>
        </Pressable>
      </View>

      {/* ===== GAME PROMPT SHEET ===== */}
      {currentGame && currentHoleQ && (
        <GamePromptSheet
          visible={sheetVisible}
          onClose={handlePromptClose}
          gameType={currentGame}
          hole={currentHoleQ.hole}
          par={currentHoleQ.par}
          players={playersForHole}
          onSubmit={handlePromptSubmit}
        />
      )}
    </SafeAreaView>
  );
}
