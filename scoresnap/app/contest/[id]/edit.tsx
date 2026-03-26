import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, Minus, X, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, RADII } from "../../../src/ui/theme";
import { AnimatedPressable } from "../../../src/ui/AnimatedPressable";
import {
  useContestStore,
  generateId,
} from "../../../src/stores/contest-store";
import { ALL_GAMES, GameType } from "../../../src/engine/types";

const BET_UNITS = [1, 2, 5, 10, 20];

export default function EditContestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const updateContest = useContestStore((s) => s.updateContest);

  // Initialize local state from contest
  const initialPlayers = useMemo(() => {
    if (!contest) return [];
    return contest.groups.flatMap((g) =>
      g.players.map((p) => ({
        id: p.id,
        name: p.name,
        handicap: String(p.handicap),
        groupId: g.id,
      }))
    );
  }, [contest?.id]);

  const [players, setPlayers] = useState(initialPlayers);
  const [enabledGames, setEnabledGames] = useState<GameType[]>(
    contest?.games ?? []
  );
  const [betUnit, setBetUnit] = useState(contest?.betUnit ?? 5);

  if (!contest) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: COLORS.bg }}
        edges={["top"]}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: COLORS.textDim, fontSize: 16 }}>
            Contest not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Player helpers ---

  const addPlayer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const firstGroupId = contest.groups[0]?.id ?? "default";
    setPlayers((prev) => [
      ...prev,
      { id: generateId(), name: "", handicap: "0", groupId: firstGroupId },
    ]);
  };

  const removePlayer = (playerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
  };

  const updatePlayer = (
    playerId: string,
    field: "name" | "handicap",
    value: string
  ) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, [field]: value } : p))
    );
  };

  // --- Game toggle ---

  const toggleGame = (gameId: GameType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnabledGames((prev) =>
      prev.includes(gameId)
        ? prev.filter((g) => g !== gameId)
        : [...prev, gameId]
    );
  };

  // --- Save ---

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Rebuild groups with updated players
    const updatedGroups = contest.groups.map((group) => ({
      ...group,
      players: players
        .filter((p) => p.groupId === group.id)
        .map((p) => {
          const existing = group.players.find((ep) => ep.id === p.id);
          return {
            id: p.id,
            name: p.name || "Player",
            handicap: parseInt(p.handicap, 10) || 0,
            team: existing?.team ?? null,
            scores: existing?.scores ?? new Array(contest.course.holes.length).fill(0),
          };
        }),
    }));

    updateContest(id!, {
      groups: updatedGroups,
      games: enabledGames,
      betUnit,
    });

    router.back();
  };

  // Resolve game info for the contest's current game list
  const contestGameInfos = useMemo(
    () =>
      ALL_GAMES.filter(
        (g) =>
          contest.games.includes(g.id) || enabledGames.includes(g.id)
      ),
    [contest.games, enabledGames]
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            Edit Contest
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Players Section ── */}
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
            Players
          </Text>

          {players.map((player, idx) => (
            <View
              key={player.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
                backgroundColor: COLORS.card,
                borderRadius: RADII.md,
                padding: 12,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <View style={{ flex: 1 }}>
                <TextInput
                  value={player.name}
                  onChangeText={(t) => updatePlayer(player.id, "name", t)}
                  placeholder={`Player ${idx + 1}`}
                  placeholderTextColor={COLORS.textDim}
                  style={{
                    color: COLORS.text,
                    fontSize: 15,
                    fontWeight: "600",
                    paddingVertical: 0,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: COLORS.bg,
                  borderRadius: RADII.sm,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  gap: 4,
                }}
              >
                <Text
                  style={{
                    color: COLORS.textDim,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  HCP
                </Text>
                <TextInput
                  value={player.handicap}
                  onChangeText={(t) =>
                    updatePlayer(player.id, "handicap", t.replace(/[^0-9-]/g, ""))
                  }
                  keyboardType="number-pad"
                  style={{
                    color: COLORS.text,
                    fontSize: 14,
                    fontWeight: "700",
                    width: 36,
                    textAlign: "center",
                    paddingVertical: 0,
                  }}
                />
              </View>

              {players.length > 2 && (
                <AnimatedPressable
                  onPress={() => removePlayer(player.id)}
                  style={{
                    padding: 6,
                    borderRadius: RADII.sm,
                    backgroundColor: COLORS.danger + "22",
                  }}
                >
                  <Minus size={16} color={COLORS.danger} />
                </AnimatedPressable>
              )}
            </View>
          ))}

          <AnimatedPressable
            onPress={addPlayer}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 12,
              borderRadius: RADII.md,
              borderWidth: 1,
              borderColor: COLORS.accent + "44",
              borderStyle: "dashed",
              marginBottom: 28,
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
              Add Player
            </Text>
          </AnimatedPressable>

          {/* ── Games Section ── */}
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
            Games
          </Text>

          {contestGameInfos.map((game) => {
            const isEnabled = enabledGames.includes(game.id);
            return (
              <AnimatedPressable
                key={game.id}
                onPress={() => toggleGame(game.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderRadius: RADII.md,
                  backgroundColor: COLORS.card,
                  borderColor: isEnabled
                    ? COLORS.accent + "44"
                    : COLORS.border,
                  borderWidth: 1,
                  marginBottom: 8,
                }}
              >
                {/* icon removed */}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: isEnabled ? COLORS.text : COLORS.textDim,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    {game.name}
                  </Text>
                  <Text
                    style={{
                      color: COLORS.textDim,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {game.desc}
                  </Text>
                </View>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isEnabled
                      ? COLORS.accent
                      : COLORS.bg,
                    borderColor: isEnabled
                      ? COLORS.accent
                      : COLORS.border,
                    borderWidth: 1.5,
                  }}
                >
                  {isEnabled && <Check size={14} color="#000" strokeWidth={3} />}
                </View>
              </AnimatedPressable>
            );
          })}

          {/* ── Bet Unit Section ── */}
          <Text
            style={{
              color: COLORS.accent,
              fontSize: 12,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginTop: 20,
              marginBottom: 12,
            }}
          >
            Bet Unit
          </Text>

          <View
            style={{
              flexDirection: "row",
              gap: 8,
            }}
          >
            {BET_UNITS.map((unit) => {
              const isSelected = betUnit === unit;
              return (
                <AnimatedPressable
                  key={unit}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBetUnit(unit);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: RADII.md,
                    alignItems: "center",
                    backgroundColor: isSelected
                      ? COLORS.accentGlow
                      : COLORS.card,
                    borderColor: isSelected
                      ? COLORS.accent
                      : COLORS.border,
                    borderWidth: 1.5,
                  }}
                >
                  <Text
                    style={{
                      color: isSelected ? COLORS.accent : COLORS.textDim,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    ${unit}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Bottom Save Button */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 20,
            paddingBottom: Platform.OS === "ios" ? 36 : 20,
            backgroundColor: COLORS.bg,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
          }}
        >
          <AnimatedPressable
            onPress={handleSave}
            style={{
              backgroundColor: COLORS.accent,
              borderRadius: RADII.md,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#000",
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              Save Changes
            </Text>
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
