import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, CheckCircle, Delete } from "lucide-react-native";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW, scoreColor, scoreName } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PAD_GAP = 8;
const PAD_COLS = 3;
const PAD_BUTTON_SIZE = Math.floor((SCREEN_WIDTH - 40 - PAD_GAP * (PAD_COLS - 1)) / PAD_COLS);

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const updateScore = useContestStore((s) => s.updateScore);
  const completeContest = useContestStore((s) => s.completeContest);

  const [currentHole, setCurrentHole] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState(0);
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState(0);

  if (!contest) return null;

  const group = contest.groups[selectedGroup];
  if (!group) return null;

  const holeData = contest.course.holes[currentHole - 1];
  const par = holeData?.par || 4;
  const hcp = holeData?.hcp || 0;
  const isCompleted = contest.status === "completed";

  const selectedPlayer = group.players[selectedPlayerIndex];

  const handleNumpadPress = useCallback(
    (value: number) => {
      if (isCompleted || !selectedPlayer) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateScore(contest.id, group.id, selectedPlayer.id, currentHole, value);
    },
    [contest.id, group.id, selectedPlayer, currentHole, updateScore, isCompleted]
  );

  const handleBackspace = useCallback(() => {
    if (isCompleted || !selectedPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateScore(contest.id, group.id, selectedPlayer.id, currentHole, 0);
  }, [contest.id, group.id, selectedPlayer, currentHole, updateScore, isCompleted]);

  const handleConfirm = useCallback(() => {
    if (isCompleted) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Move to next player, or next hole if last player
    if (selectedPlayerIndex < group.players.length - 1) {
      setSelectedPlayerIndex(selectedPlayerIndex + 1);
    } else if (currentHole < 18) {
      setCurrentHole(currentHole + 1);
      setSelectedPlayerIndex(0);
    }
  }, [selectedPlayerIndex, group.players.length, currentHole, isCompleted]);

  const handlePrevHole = useCallback(() => {
    if (currentHole > 1) {
      setCurrentHole(currentHole - 1);
      setSelectedPlayerIndex(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [currentHole]);

  const handleNextHole = useCallback(() => {
    if (currentHole < 18) {
      setCurrentHole(currentHole + 1);
      setSelectedPlayerIndex(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [currentHole]);

  const handleFinalizeRound = useCallback(() => {
    const allPlayers = contest.groups.flatMap((g) => g.players);
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
    completeContest(contest.id);
  };

  // Calculate completion percentage
  const allPlayers = contest.groups.flatMap((g) => g.players);
  const totalScores = allPlayers.reduce(
    (sum, p) => sum + p.scores.filter((s) => s > 0).length,
    0
  );
  const totalExpected = allPlayers.length * 18;
  const percentComplete =
    totalExpected > 0 ? Math.round((totalScores / totalExpected) * 100) : 0;

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
                  fontFamily: FONTS.headline,
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
                  fontFamily: FONTS.headline,
                  color: COLORS.text,
                }}
              >
                {hcp}
              </Text>
            </View>
          </View>
        </View>

        {/* Group Selector (if multiple groups) */}
        {contest.groups.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ paddingHorizontal: 20, marginBottom: 4 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {contest.groups.map((g, gi) => (
              <Pressable
                key={g.id}
                onPress={() => {
                  setSelectedGroup(gi);
                  setSelectedPlayerIndex(0);
                }}
                style={{
                  backgroundColor:
                    gi === selectedGroup
                      ? COLORS.primary
                      : COLORS.surfaceMid,
                  borderRadius: RADII.md,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
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
          </ScrollView>
        )}

        {/* Player Cards */}
        <ScrollView
          style={{ maxHeight: 220, marginTop: 8 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
          showsVerticalScrollIndicator={false}
        >
          {group.players.map((player, idx) => {
            const isSelected = idx === selectedPlayerIndex;
            const score = player.scores[currentHole - 1] || 0;
            const total = player.scores.reduce((a, b) => a + b, 0);
            const color = score > 0 ? scoreColor(score, par) : COLORS.textDim;
            const diff = score > 0 ? score - par : 0;
            const label = score > 0 ? scoreName(score, par) : "";

            return (
              <Pressable
                key={player.id}
                onPress={() => {
                  if (!isCompleted) {
                    setSelectedPlayerIndex(idx);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
                style={{
                  backgroundColor: isSelected
                    ? COLORS.surfaceHigh
                    : COLORS.surfaceLow,
                  borderRadius: RADII.lg,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderLeftWidth: isSelected ? 3 : 0,
                  borderLeftColor: isSelected ? COLORS.primary : "transparent",
                  opacity: isCompleted ? 0.7 : 1,
                }}
              >
                <View style={{ flex: 1 }}>
                  {isSelected && (
                    <Animated.Text
                      entering={FadeIn.duration(200)}
                      style={{
                        ...TYPOGRAPHY.labelSm,
                        color: COLORS.primary,
                        marginBottom: 2,
                      }}
                    >
                      PLAYER {idx + 1}
                      {idx === 0 ? " (YOU)" : ""}
                    </Animated.Text>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
                    <Text
                      style={{
                        fontSize: isSelected ? 17 : 14,
                        fontFamily: isSelected ? FONTS.bold : FONTS.medium,
                        color: isSelected ? COLORS.text : COLORS.textDim,
                      }}
                    >
                      {player.name}
                    </Text>
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
                  {total > 0 && (
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: FONTS.medium,
                        color: COLORS.textDim,
                        marginTop: 2,
                      }}
                    >
                      Thru {player.scores.filter((s) => s > 0).length} — Total{" "}
                      {total}
                    </Text>
                  )}
                </View>

                {/* Score display */}
                <View style={{ alignItems: "center", minWidth: 50 }}>
                  <Animated.Text
                    key={`ps-${player.id}-${currentHole}-${score}`}
                    entering={SlideInUp.duration(150).springify()}
                    style={{
                      fontSize: isSelected ? 32 : 22,
                      fontFamily: FONTS.headline,
                      color: score > 0 ? color : COLORS.textDim,
                    }}
                  >
                    {score || "–"}
                  </Animated.Text>
                  {score > 0 && isSelected && (
                    <Animated.Text
                      entering={FadeIn.delay(50).duration(200)}
                      style={{
                        fontSize: 11,
                        fontFamily: FONTS.semibold,
                        color,
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </Animated.Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Number Pad */}
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            paddingHorizontal: 20,
            paddingBottom: 8,
          }}
        >
          {/* 3x3 grid: 1-9 */}
          {[
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ].map((row, ri) => (
            <View
              key={ri}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: PAD_GAP,
                marginBottom: PAD_GAP,
              }}
            >
              {row.map((num) => (
                <NumpadButton
                  key={num}
                  label={String(num)}
                  onPress={() => handleNumpadPress(num)}
                  bg={COLORS.surfaceHigh}
                  textColor={COLORS.text}
                  disabled={isCompleted}
                />
              ))}
            </View>
          ))}

          {/* Bottom row: backspace, 0, confirm */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: PAD_GAP,
              marginBottom: PAD_GAP,
            }}
          >
            <NumpadButton
              label="backspace"
              onPress={handleBackspace}
              bg={COLORS.surfaceHighest}
              textColor={COLORS.textDim}
              icon={<Delete size={22} color={COLORS.textDim} />}
              disabled={isCompleted}
            />
            <NumpadButton
              label="0"
              onPress={() => handleNumpadPress(0)}
              bg={COLORS.surfaceHigh}
              textColor={COLORS.text}
              disabled={isCompleted}
            />
            <NumpadButton
              label="confirm"
              onPress={handleConfirm}
              bg={COLORS.primary}
              textColor={COLORS.onPrimary}
              icon={
                <Text
                  style={{
                    fontSize: 24,
                    fontFamily: FONTS.bold,
                    color: COLORS.onPrimary,
                  }}
                >
                  ✓
                </Text>
              }
              disabled={isCompleted}
            />
          </View>

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
              onPress={handleNextHole}
              disabled={currentHole >= 18}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                backgroundColor: COLORS.surfaceMid,
                borderRadius: RADII.md,
                paddingVertical: 12,
                opacity: currentHole >= 18 ? 0.3 : 1,
              }}
            >
              <Text
                style={{
                  ...TYPOGRAPHY.labelSm,
                  color: COLORS.textDim,
                }}
              >
                NEXT
              </Text>
              <ChevronRight size={16} color={COLORS.textDim} />
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
                  ...( percentComplete === 100 ? GLOW.primary : {}),
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
    </View>
  );
}

/* ── Number Pad Button ── */
function NumpadButton({
  label,
  onPress,
  bg,
  textColor,
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  bg: string;
  textColor: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        height: 56,
        backgroundColor: bg,
        borderRadius: RADII.lg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}
    >
      {icon ? (
        icon
      ) : (
        <Text
          style={{
            fontSize: 24,
            fontFamily: FONTS.headline,
            color: textColor,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
