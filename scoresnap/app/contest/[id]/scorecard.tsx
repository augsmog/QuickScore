import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Minus, Plus, CheckCircle } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, scoreColor } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";

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

  if (!contest) return null;

  const group = contest.groups[selectedGroup];
  if (!group) return null;

  const par = contest.course.holes[currentHole - 1]?.par || 4;
  const isCompleted = contest.status === "completed";

  const handleScoreChange = useCallback(
    (playerId: string, delta: number) => {
      if (isCompleted) return; // Don't allow changes on completed contests
      const player = group.players.find((p) => p.id === playerId);
      if (!player) return;
      const current = player.scores[currentHole - 1] || 0;
      const newScore = Math.max(0, current + delta);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateScore(contest.id, group.id, playerId, currentHole, newScore);
    },
    [contest.id, group.id, currentHole, group.players, updateScore, isCompleted]
  );

  const handleFinalizeRound = useCallback(() => {
    // Check if enough scores have been entered
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

  // Calculate completion percentage for the progress indicator
  const allPlayers = contest.groups.flatMap((g) => g.players);
  const totalScores = allPlayers.reduce(
    (sum, p) => sum + p.scores.filter((s) => s > 0).length,
    0
  );
  const totalExpected = allPlayers.length * 18;
  const percentComplete = totalExpected > 0 ? Math.round((totalScores / totalExpected) * 100) : 0;

  return (
    <View className="flex-1">
      {/* Completed Banner */}
      {isCompleted && (
        <View
          style={{
            backgroundColor: COLORS.accent + "15",
            borderBottomColor: COLORS.accent + "33",
            borderBottomWidth: 1,
            paddingVertical: 8,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <CheckCircle size={14} color={COLORS.accent} />
          <Text
            style={{ color: COLORS.accent, fontSize: 12, fontWeight: "700" }}
          >
            Round Finalized — Scores Locked
          </Text>
        </View>
      )}

      {/* Group Selector (if multiple groups) */}
      {contest.groups.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-5 pt-2 pb-1"
        >
          {contest.groups.map((g, gi) => (
            <Pressable
              key={g.id}
              onPress={() => setSelectedGroup(gi)}
              className="mr-2 rounded-lg px-3 py-1.5"
              style={{
                backgroundColor:
                  gi === selectedGroup ? COLORS.accent : COLORS.card,
                borderColor:
                  gi === selectedGroup ? COLORS.accent : COLORS.border,
                borderWidth: 1,
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{
                  color: gi === selectedGroup ? "#000" : COLORS.textDim,
                }}
              >
                {g.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Hole Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-3 pt-2 pb-3"
      >
        {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => {
          const isActive = hole === currentHole;
          return (
            <Pressable
              key={hole}
              onPress={() => {
                setCurrentHole(hole);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="w-10 h-10 rounded-lg items-center justify-center mx-0.5"
              style={{
                backgroundColor: isActive ? COLORS.accent : COLORS.card,
                borderColor: isActive
                  ? COLORS.accent
                  : hole === 10
                  ? COLORS.warn + "44"
                  : COLORS.border,
                borderWidth: isActive ? 0 : 1,
              }}
            >
              <Text
                className="text-sm font-bold"
                style={{
                  color: isActive ? "#000" : COLORS.text,
                }}
              >
                {hole}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Current Hole Info — compact row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          paddingVertical: 8,
          paddingHorizontal: 20,
        }}
      >
        <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: "600", letterSpacing: 0.5 }}>
          {currentHole <= 9 ? "FRONT 9" : "BACK 9"}
        </Text>
        <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "800" }}>
          Hole {currentHole} · Par {par}
        </Text>
        <Text style={{ color: COLORS.textDim, fontSize: 11 }}>
          {contest.course.holes[currentHole - 1]?.yards || ""}y · HCP{" "}
          {contest.course.holes[currentHole - 1]?.hcp || ""}
        </Text>
      </View>

      {/* Score Entry */}
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
      >
        {group.players.map((player) => {
          const score = player.scores[currentHole - 1] || 0;
          const diff = score > 0 ? score - par : 0;
          const color =
            score > 0 ? scoreColor(score, par) : COLORS.textDim;
          const total = player.scores.reduce((a, b) => a + b, 0);

          return (
            <View
              key={player.id}
              className="rounded-xl p-4 mb-3"
              style={{
                backgroundColor: COLORS.card,
                borderColor:
                  score > 0 ? color + "33" : COLORS.border,
                borderWidth: 1,
                opacity: isCompleted ? 0.8 : 1,
              }}
            >
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-2">
                  {player.team && contest.hasTeams && (
                    <View
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          player.team === "A"
                            ? COLORS.accent
                            : COLORS.blue,
                      }}
                    />
                  )}
                  <Text
                    style={{
                      color: COLORS.text,
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    {player.name}
                  </Text>
                  <Text
                    style={{ color: COLORS.textDim, fontSize: 12 }}
                  >
                    ({player.handicap} hcp)
                  </Text>
                </View>
                {total > 0 && (
                  <Text
                    style={{ color: COLORS.textDim, fontSize: 12 }}
                  >
                    Total: {total}
                  </Text>
                )}
              </View>

              <View className="flex-row items-center justify-center gap-5">
                <Pressable
                  onPress={() => handleScoreChange(player.id, -1)}
                  disabled={isCompleted}
                  className="w-14 h-14 rounded-2xl items-center justify-center"
                  style={{
                    backgroundColor: COLORS.bg,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                    opacity: isCompleted ? 0.5 : 1,
                  }}
                >
                  <Minus size={24} color={COLORS.text} />
                </Pressable>

                <View className="items-center min-w-16">
                  <Text
                    style={{
                      fontSize: 36,
                      fontWeight: "800",
                      color: score > 0 ? color : COLORS.textDim,
                    }}
                  >
                    {score || "–"}
                  </Text>
                  {score > 0 && (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        marginTop: 2,
                        color,
                      }}
                    >
                      {diff === 0
                        ? "Par"
                        : diff > 0
                        ? `+${diff}`
                        : `${diff}`}
                    </Text>
                  )}
                </View>

                <Pressable
                  onPress={() => handleScoreChange(player.id, 1)}
                  disabled={isCompleted}
                  className="w-14 h-14 rounded-2xl items-center justify-center"
                  style={{
                    backgroundColor: isCompleted
                      ? COLORS.textDim
                      : COLORS.accent,
                    opacity: isCompleted ? 0.5 : 1,
                  }}
                >
                  <Plus size={24} color="#000" />
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* Quick Nav */}
        <View className="flex-row gap-3 mt-2">
          {currentHole > 1 && (
            <Pressable
              onPress={() => {
                setCurrentHole(currentHole - 1);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="flex-1 rounded-xl py-3 items-center"
              style={{
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <Text
                style={{
                  color: COLORS.textDim,
                  fontWeight: "600",
                  fontSize: 14,
                }}
              >
                ← Hole {currentHole - 1}
              </Text>
            </Pressable>
          )}
          {currentHole < 18 && (
            <Pressable
              onPress={() => {
                setCurrentHole(currentHole + 1);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="flex-1 rounded-xl py-3 items-center"
              style={{ backgroundColor: COLORS.blue }}
            >
              <Text
                style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}
              >
                Hole {currentHole + 1} →
              </Text>
            </Pressable>
          )}
        </View>

        {/* Finalize Round Button */}
        {!isCompleted && (
          <View style={{ marginTop: 16, marginBottom: 8 }}>
            {/* Completion progress */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  color: COLORS.textDim,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                Round Progress
              </Text>
              <Text
                style={{
                  color:
                    percentComplete === 100
                      ? COLORS.accent
                      : COLORS.textDim,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {percentComplete}%
              </Text>
            </View>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: COLORS.border,
                marginBottom: 12,
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
                      ? COLORS.accent
                      : COLORS.blue,
                }}
              />
            </View>

            <Pressable
              onPress={handleFinalizeRound}
              style={{
                backgroundColor:
                  percentComplete === 100
                    ? COLORS.accent
                    : COLORS.card,
                borderColor:
                  percentComplete === 100
                    ? COLORS.accent
                    : COLORS.warn,
                borderWidth: percentComplete === 100 ? 0 : 1,
                borderRadius: 14,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <CheckCircle
                size={18}
                color={percentComplete === 100 ? "#000" : COLORS.warn}
              />
              <Text
                style={{
                  color: percentComplete === 100 ? "#000" : COLORS.warn,
                  fontWeight: "700",
                  fontSize: 15,
                }}
              >
                Finalize Round
              </Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}
