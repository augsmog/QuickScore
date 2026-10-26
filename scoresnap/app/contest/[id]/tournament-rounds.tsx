import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, X, Users, Shuffle, Copy, ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, RADII, FONTS } from "../../../src/ui/theme";
import { AnimatedPressable } from "../../../src/ui/AnimatedPressable";
import {
  useContestStore,
  getActiveGroups,
  generateId,
  type ContestGroup,
} from "../../../src/stores/contest-store";

export default function TournamentRoundsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const contest = useContestStore((s) => s.contests.find((c) => c.id === id));
  const updateContest = useContestStore((s) => s.updateContest);
  const addRound = useContestStore((s) => s.addRound);
  const setCurrentRound = useContestStore((s) => s.setCurrentRound);
  const updateRoundGroups = useContestStore((s) => s.updateRoundGroups);
  const copyRoundGroups = useContestStore((s) => s.copyRoundGroups);

  const [selectedRound, setSelectedRound] = useState(
    contest?.currentRound || 1
  );

  if (!contest) {
    return null;
  }

  // Convert to tournament if not already
  if (!contest.isTournament) {
    // Initialize first round with current groups
    const firstRound = {
      id: generateId(),
      number: 1,
      name: "Round 1",
      date: new Date().toISOString().split("T")[0],
      groups: contest.groups.map((g) => ({
        ...g,
        players: g.players.map((p) => ({
          ...p,
          scores: new Array(contest.course.holes.length).fill(0),
        })),
      })),
    };
    updateContest(id!, {
      isTournament: true,
      rounds: [firstRound],
      currentRound: 1,
    });
    return null; // Will re-render with tournament data
  }

  const rounds = contest.rounds || [];
  const currentRound = rounds.find((r) => r.number === selectedRound);
  const allPlayers = contest.groups.flatMap((g) => g.players);

  const handleAddRound = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const roundNumber = rounds.length + 1;
    addRound(id!, `Round ${roundNumber}`);
    setSelectedRound(roundNumber);
  };

  const handleCopyPreviousRound = () => {
    if (selectedRound <= 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Copy Previous Round",
      `Copy player pairings from Round ${selectedRound - 1}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Copy",
          onPress: () => {
            copyRoundGroups(id!, selectedRound - 1, selectedRound);
          },
        },
      ]
    );
  };

  const handleShuffleGroups = () => {
    if (!currentRound) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Shuffle all players
    const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
    const groupSize = Math.ceil(allPlayers.length / currentRound.groups.length);
    
    const newGroups: ContestGroup[] = [];
    for (let i = 0; i < currentRound.groups.length; i++) {
      const start = i * groupSize;
      const end = start + groupSize;
      newGroups.push({
        id: currentRound.groups[i]?.id || generateId(),
        name: `Group ${i + 1}`,
        players: shuffled.slice(start, end).map((p) => ({
          ...p,
          scores: new Array(contest.course.holes.length).fill(0),
        })),
      });
    }

    updateRoundGroups(id!, selectedRound, newGroups);
  };

  const handleAutoFill = () => {
    if (!currentRound) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Distribute players evenly across groups
    const groupSize = 4;
    const numGroups = Math.ceil(allPlayers.length / groupSize);
    
    const newGroups: ContestGroup[] = [];
    for (let i = 0; i < numGroups; i++) {
      const start = i * groupSize;
      const end = start + groupSize;
      newGroups.push({
        id: generateId(),
        name: `Group ${i + 1}`,
        players: allPlayers.slice(start, end).map((p) => ({
          ...p,
          scores: new Array(contest.course.holes.length).fill(0),
        })),
      });
    }

    updateRoundGroups(id!, selectedRound, newGroups);
  };

  const handleMovePlayer = (playerId: string, fromGroupId: string) => {
    if (!currentRound) return;
    
    // Find the player and their current group
    const player = currentRound.groups
      .flatMap((g) => g.players)
      .find((p) => p.id === playerId);
    if (!player) return;

    const otherGroups = currentRound.groups.filter((g) => g.id !== fromGroupId);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      player.name,
      `HCP ${player.handicap} · ${player.status || 'Active'}`,
      [
        { text: "Cancel", style: "cancel" },
        // Move to another group
        ...(otherGroups.length > 0 ? [{
          text: "Move to another group",
          onPress: () => {
            Alert.alert(
              `Move ${player.name}`,
              "Select destination group:",
              [
                { text: "Cancel", style: "cancel" },
                ...otherGroups.map((targetGroup) => ({
                  text: targetGroup.name,
                  onPress: () => {
                    const newGroups = currentRound.groups.map((g) => {
                      if (g.id === fromGroupId) {
                        return { ...g, players: g.players.filter((p) => p.id !== playerId) };
                      } else if (g.id === targetGroup.id) {
                        return { ...g, players: [...g.players, player] };
                      }
                      return g;
                    });
                    updateRoundGroups(id!, selectedRound, newGroups);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  },
                })),
              ]
            );
          }
        }] : []),
        // Mark as WD
        {
          text: player.status === "WD" ? "Unmark WD" : "Mark as WD (Withdrew)",
          onPress: () => {
            const newGroups = currentRound.groups.map((g) => ({
              ...g,
              players: g.players.map((p) =>
                p.id === playerId ? { ...p, status: p.status === "WD" ? undefined : "WD" as const } : p
              ),
            }));
            updateRoundGroups(id!, selectedRound, newGroups);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        },
        // Mark as NS
        {
          text: player.status === "NS" ? "Unmark NS" : "Mark as NS (No-Show)",
          onPress: () => {
            const newGroups = currentRound.groups.map((g) => ({
              ...g,
              players: g.players.map((p) =>
                p.id === playerId ? { ...p, status: p.status === "NS" ? undefined : "NS" as const } : p
              ),
            }));
            updateRoundGroups(id!, selectedRound, newGroups);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        },
      ]
    );
  };

  const handleSetActive = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCurrentRound(id!, selectedRound);
    updateContest(id!, { currentRound: selectedRound });
    router.back();
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      edges={["top", "bottom"]}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <AnimatedPressable
          onPress={() => router.back()}
          style={{
            padding: 6,
            borderRadius: RADII.sm,
            backgroundColor: COLORS.card,
            borderColor: COLORS.border,
            borderWidth: 1,
          }}
        >
          <X size={20} color={COLORS.textDim} />
        </AnimatedPressable>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            color: COLORS.text,
            fontSize: 17,
            fontWeight: "700",
          }}
        >
          Tournament Rounds
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
      >
        {/* Round Course */}
        {currentRound && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: COLORS.textDim, fontSize: 12, fontWeight: "700", marginBottom: 8 }}>
              ROUND COURSE
            </Text>
            <TextInput
              value={currentRound.course?.name || contest.course.name}
              onChangeText={(name) => {
                const updated = rounds.map(r => 
                  r.number === selectedRound 
                    ? { ...r, course: { ...contest.course, name } }
                    : r
                );
                updateContest(id!, { rounds: updated });
              }}
              placeholder="Course name"
              placeholderTextColor={COLORS.textDim}
              style={{
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
                borderRadius: RADII.md,
                paddingHorizontal: 16,
                paddingVertical: 12,
                color: COLORS.text,
                fontSize: 15,
              }}
            />
          </View>
        )}

        {/* Round Selector */}
        <Text
          style={{
            color: COLORS.accent,
            fontSize: 12,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 12,
          }}
        >
          Rounds
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {rounds.map((r) => (
            <AnimatedPressable
              key={r.id}
              onPress={() => setSelectedRound(r.number)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: RADII.md,
                backgroundColor:
                  selectedRound === r.number ? COLORS.accent : COLORS.card,
                borderColor:
                  selectedRound === r.number
                    ? COLORS.accent
                    : COLORS.border,
                borderWidth: 1,
              }}
            >
              <Text
                style={{
                  color:
                    selectedRound === r.number
                      ? COLORS.onPrimary
                      : COLORS.text,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                {r.name}
                {contest.currentRound === r.number && " (Active)"}
              </Text>
            </AnimatedPressable>
          ))}

          <AnimatedPressable
            onPress={handleAddRound}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: RADII.md,
              backgroundColor: COLORS.accentGlow,
              borderColor: COLORS.accent + "44",
              borderWidth: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={16} color={COLORS.accent} />
            <Text
              style={{
                color: COLORS.accent,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              Add Round
            </Text>
          </AnimatedPressable>
        </View>

        {/* Actions */}
        <View style={{ gap: 10, marginBottom: 20 }}>
          <AnimatedPressable
            onPress={handleAutoFill}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: RADII.md,
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <Users size={20} color={COLORS.accent} />
            <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "600" }}>
              Auto-fill Groups (4 per group)
            </Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleShuffleGroups}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: RADII.md,
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <Shuffle size={20} color={COLORS.accent} />
            <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "600" }}>
              Shuffle Players
            </Text>
          </AnimatedPressable>

          {selectedRound > 1 && (
            <AnimatedPressable
              onPress={handleCopyPreviousRound}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: RADII.md,
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <Copy size={20} color={COLORS.accent} />
              <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "600" }}>
                Copy Round {selectedRound - 1} Pairings
              </Text>
            </AnimatedPressable>
          )}
        </View>

        {/* Groups */}
        <Text
          style={{
            color: COLORS.accent,
            fontSize: 12,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 12,
          }}
        >
          Foursomes
        </Text>

        {currentRound?.groups.map((group, groupIdx) => (
          <View
            key={group.id}
            style={{
              backgroundColor: COLORS.card,
              borderRadius: RADII.md,
              padding: 16,
              marginBottom: 12,
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <Text
              style={{
                color: COLORS.accent,
                fontSize: 13,
                fontWeight: "700",
                marginBottom: 10,
              }}
            >
              {group.name} ({group.players.length} players)
            </Text>

            {/* Tee Time & External ID */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textDim, fontSize: 11, marginBottom: 4 }}>
                  TEE TIME
                </Text>
                <TextInput
                  value={group.teeTime || ""}
                  onChangeText={(val) => {
                    const updatedGroups = currentRound.groups.map((g, i) =>
                      i === groupIdx ? { ...g, teeTime: val } : g
                    );
                    updateRoundGroups(id!, selectedRound, updatedGroups);
                  }}
                  placeholder="10:03"
                  placeholderTextColor={COLORS.textDim}
                  style={{
                    backgroundColor: COLORS.surfaceLow,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                    borderRadius: RADII.sm,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    color: COLORS.text,
                    fontSize: 13,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textDim, fontSize: 11, marginBottom: 4 }}>
                  EXTERNAL ID
                </Text>
                <TextInput
                  value={group.externalId || ""}
                  onChangeText={(val) => {
                    const updatedGroups = currentRound.groups.map((g, i) =>
                      i === groupIdx ? { ...g, externalId: val } : g
                    );
                    updateRoundGroups(id!, selectedRound, updatedGroups);
                  }}
                  placeholder="WTKTH9"
                  placeholderTextColor={COLORS.textDim}
                  style={{
                    backgroundColor: COLORS.surfaceLow,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                    borderRadius: RADII.sm,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    color: COLORS.text,
                    fontSize: 13,
                  }}
                />
              </View>
            </View>

            {/* Players */}
            {group.players.map((player, playerIdx) => (
              <View key={player.id}>
                <Pressable
                  onPress={() => handleMovePlayer(player.id, group.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border + "40",
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      color: COLORS.text,
                      fontSize: 15,
                      fontWeight: "500",
                    }}
                  >
                    {player.name}
                  </Text>
                  <Text
                    style={{
                      color: COLORS.textDim,
                      fontSize: 13,
                      marginRight: 4,
                    }}
                  >
                    {player.status === "WD" && "WD · "}
                    {player.status === "NS" && "NS · "}
                    HCP {player.handicap > 0 ? player.handicap : player.handicap < 0 ? `+${Math.abs(player.handicap)}` : "0"}
                  </Text>
                  <ChevronRight size={16} color={COLORS.textDim} />
                </Pressable>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Bottom Action Button */}
      {selectedRound !== contest.currentRound && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 20,
            paddingBottom: 36,
            backgroundColor: COLORS.bg,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
          }}
        >
          <AnimatedPressable
            onPress={handleSetActive}
            style={{
              backgroundColor: COLORS.accent,
              borderRadius: RADII.md,
              paddingVertical: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Text
              style={{
                color: COLORS.onPrimary,
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              Set Round {selectedRound} as Active
            </Text>
            <ChevronRight size={20} color={COLORS.onPrimary} />
          </AnimatedPressable>
        </View>
      )}
    </SafeAreaView>
  );
}
