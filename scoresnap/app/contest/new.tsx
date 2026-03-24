import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Plus,
  Minus,
  X,
  Check,
  Lock,
  UserPlus,
  ChevronRight,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW } from "../../src/ui/theme";
import {
  useContestStore,
  generateId,
  defaultCourse,
  Contest,
  ContestGroup,
} from "../../src/stores/contest-store";
import CourseSearch from "../../src/ui/CourseSearch";
import type { Course } from "../../src/engine/types";
import type { TeeBox } from "../../src/services/course-api";
import {
  ALL_GAMES,
  FREE_GAME_IDS,
  GameType,
  GameTypeInfo,
  Player,
} from "../../src/engine/types";
import { AnimatedPressable } from "../../src/ui/AnimatedPressable";

interface PlayerInput {
  id: string;
  name: string;
  handicap: string;
  team: "A" | "B" | null;
  groupIndex: number;
}

export default function NewContestScreen() {
  const router = useRouter();
  const addContest = useContestStore((s) => s.addContest);

  const [step, setStep] = useState(1);

  // Auto-generate contest name
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Step 1: Players & Course
  const [contestName, setContestName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedTeeBox, setSelectedTeeBox] = useState<TeeBox | null>(null);
  const [numGroups, setNumGroups] = useState(1);
  const [players, setPlayers] = useState<PlayerInput[]>([
    { id: generateId(), name: "", handicap: "0", team: null, groupIndex: 0 },
    { id: generateId(), name: "", handicap: "0", team: null, groupIndex: 0 },
  ]);
  const [hasTeams, setHasTeams] = useState(false);
  const [teamAName, setTeamAName] = useState("Eagles");
  const [teamBName, setTeamBName] = useState("Birdies");

  // Step 2: Games
  const [selectedGames, setSelectedGames] = useState<GameType[]>(["stroke_play"]);
  const [betUnit, setBetUnit] = useState("5");

  // Step 3: Wager settings
  const [carryover, setCarryover] = useState(false);
  const [pressRules, setPressRules] = useState(false);

  const addPlayer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayers([
      ...players,
      {
        id: generateId(),
        name: "",
        handicap: "0",
        team: null,
        groupIndex: Math.min(players.length % numGroups, numGroups - 1),
      },
    ]);
  };

  const removePlayer = (id: string) => {
    if (players.length <= 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayers(players.filter((p) => p.id !== id));
  };

  const updatePlayer = (id: string, field: keyof PlayerInput, value: string | number | null) => {
    setPlayers(
      players.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const toggleGame = (gameId: GameType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGames((prev) =>
      prev.includes(gameId)
        ? prev.filter((g) => g !== gameId)
        : [...prev, gameId]
    );
  };

  // Filter games by player count
  const playerCount = players.filter((p) => p.name.trim()).length;
  const recommendedGames = useMemo(
    () =>
      ALL_GAMES.filter(
        (g) => playerCount >= g.minPlayers && playerCount <= g.maxPlayers
      ),
    [playerCount]
  );
  const incompatibleGames = useMemo(
    () =>
      ALL_GAMES.filter(
        (g) => playerCount < g.minPlayers || playerCount > g.maxPlayers
      ),
    [playerCount]
  );

  // Separate popular vs classic
  const popularFormats = recommendedGames.filter(
    (g) => ["stroke_play", "skins", "skins_carry", "nassau", "stableford", "best_ball", "match_play"].includes(g.id)
  );
  const classicFormats = recommendedGames.filter(
    (g) => !["stroke_play", "skins", "skins_carry", "nassau", "stableford", "best_ball", "match_play"].includes(g.id)
  );

  const canProceed = () => {
    if (step === 1) {
      return players.filter((p) => p.name.trim()).length >= 2;
    }
    if (step === 2) {
      return selectedGames.length > 0;
    }
    return true;
  };

  const validPlayerCount = players.filter((p) => p.name.trim()).length;
  const betAmount = parseFloat(betUnit) || 0;
  const estimatedPot = betAmount * validPlayerCount * 18;

  const createContest = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const course = selectedCourse || defaultCourse(courseName || "My Course");
    const autoName = courseName
      ? `${dayName} at ${courseName}`
      : `${dayName} Round`;
    const validPlayers = players.filter((p) => p.name.trim());

    // Group players
    const groupMap: Record<number, PlayerInput[]> = {};
    validPlayers.forEach((p) => {
      const gi = p.groupIndex;
      if (!groupMap[gi]) groupMap[gi] = [];
      groupMap[gi].push(p);
    });

    const groups: ContestGroup[] = Object.entries(groupMap).map(
      ([gi, gPlayers]) => ({
        id: generateId(),
        name: `Group ${Number(gi) + 1}`,
        players: gPlayers.map((p) => ({
          id: p.id,
          name: p.name.trim(),
          handicap: parseFloat(p.handicap) || 0,
          team: hasTeams ? p.team : null,
          scores: new Array(18).fill(0),
        })),
      })
    );

    const contest: Contest = {
      id: generateId(),
      name: contestName || autoName,
      course,
      status: "active",
      betUnit: parseFloat(betUnit) || 1,
      hasTeams,
      teamAName: hasTeams ? teamAName : undefined,
      teamBName: hasTeams ? teamBName : undefined,
      groups,
      games: selectedGames,
      createdAt: new Date().toISOString(),
    };

    addContest(contest);
    router.replace(`/contest/${contest.id}`);
  };

  const renderGameCard = (game: GameTypeInfo) => {
    const isSelected = selectedGames.includes(game.id);
    const isFree = FREE_GAME_IDS.includes(game.id);
    return (
      <AnimatedPressable
        key={game.id}
        onPress={() => toggleGame(game.id)}
        style={{
          backgroundColor: isSelected ? COLORS.surfaceHigh : COLORS.surfaceMid,
          borderRadius: RADII.lg,
          padding: 14,
          marginBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 28 }}>{game.icon}</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontFamily: isSelected ? FONTS.bold : FONTS.semibold, fontSize: 15, color: COLORS.text }}>
              {game.name}
            </Text>
            {!isFree && (
              <View style={{ backgroundColor: COLORS.gold + "22", borderRadius: RADII.md, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Lock size={9} color={COLORS.gold} />
                <Text style={{ fontFamily: FONTS.bold, fontSize: 9, color: COLORS.gold }}>
                  PRO
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
            {game.desc}
          </Text>
          {/* Info badges */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
            <View style={{ backgroundColor: COLORS.secondaryContainer, borderRadius: RADII.md, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 10, color: COLORS.textDim }}>
                {game.minPlayers}-{game.maxPlayers} players
              </Text>
            </View>
            <View style={{ backgroundColor: COLORS.secondaryContainer, borderRadius: RADII.md, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 10, color: COLORS.textDim }}>
                {game.category}
              </Text>
            </View>
          </View>
        </View>
        {/* Toggle circle */}
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isSelected ? COLORS.primary : "transparent",
            borderWidth: isSelected ? 0 : 2,
            borderColor: COLORS.surfaceHighest,
          }}
        >
          {isSelected && <Check size={14} color={COLORS.onPrimary} />}
        </View>
      </AnimatedPressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <AnimatedPressable
          onPress={() => (step > 1 ? setStep(step - 1) : router.back())}
          style={{
            backgroundColor: COLORS.surfaceMid,
            borderRadius: RADII.md,
            padding: 8,
          }}
        >
          <ChevronLeft size={20} color={COLORS.textDim} />
        </AnimatedPressable>
        <Text style={{ fontFamily: FONTS.headline, fontSize: 20, color: COLORS.text, flex: 1 }}>
          New Contest
        </Text>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textDim }}>
          Step {step}/3
        </Text>
      </View>

      {/* Progress bar */}
      <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 20, marginBottom: 16 }}>
        {[1, 2, 3].map((s) => (
          <View
            key={s}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: s <= step ? COLORS.primary : COLORS.surfaceHighest,
            }}
          />
        ))}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={60}
      >
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ═══════ Step 1: Players & Course ═══════ */}
        {step === 1 && (
          <View>
            <View style={{ backgroundColor: COLORS.primary + "1A", borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 8 }}>
              <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: COLORS.primary, letterSpacing: 1 }}>
                STEP 01
              </Text>
            </View>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.text, marginBottom: 20 }}>
              Players & Course
            </Text>

            {/* Contest Name */}
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 6 }}>
              CONTEST NAME
            </Text>
            <TextInput
              value={contestName}
              onChangeText={setContestName}
              placeholder={courseName ? `${dayName} at ${courseName}` : `${dayName} Round`}
              placeholderTextColor={COLORS.textDim}
              style={{
                backgroundColor: COLORS.surfaceLow,
                borderRadius: RADII.md,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 15,
                fontFamily: FONTS.regular,
                color: COLORS.text,
                marginBottom: 16,
              }}
            />

            {/* Course Selection */}
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 6 }}>
              COURSE
            </Text>
            <View style={{ marginBottom: 16 }}>
              <CourseSearch
                initialCourseName={courseName}
                onSelect={(course, name, teeBox) => {
                  setSelectedCourse(course);
                  setCourseName(name);
                  setSelectedTeeBox(teeBox ?? null);
                }}
              />
              {selectedTeeBox && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 4 }}>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim }}>
                    {selectedTeeBox.name} Tees
                    {selectedTeeBox.totalYards > 0 ? ` \u00B7 ${selectedTeeBox.totalYards} yds` : ""}
                    {selectedTeeBox.courseRating ? ` \u00B7 ${selectedTeeBox.courseRating}/${selectedTeeBox.slopeRating}` : ""}
                  </Text>
                </View>
              )}
            </View>

            {/* Teams Toggle */}
            <View
              style={{
                backgroundColor: hasTeams ? COLORS.primary + "15" : COLORS.surfaceMid,
                borderRadius: RADII.lg,
                padding: 16,
                marginBottom: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text }}>
                  Team Mode
                </Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                  Split players into two teams
                </Text>
              </View>
              <Switch
                value={hasTeams}
                onValueChange={setHasTeams}
                trackColor={{ false: COLORS.surfaceHighest, true: COLORS.primary }}
                thumbColor={COLORS.text}
              />
            </View>

            {hasTeams && (
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary }} />
                    <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>
                      Team A
                    </Text>
                  </View>
                  <TextInput
                    value={teamAName}
                    onChangeText={setTeamAName}
                    style={{
                      backgroundColor: COLORS.surfaceLow,
                      borderRadius: RADII.md,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      fontFamily: FONTS.regular,
                      color: COLORS.text,
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.secondary }} />
                    <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>
                      Team B
                    </Text>
                  </View>
                  <TextInput
                    value={teamBName}
                    onChangeText={setTeamBName}
                    style={{
                      backgroundColor: COLORS.surfaceLow,
                      borderRadius: RADII.md,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      fontFamily: FONTS.regular,
                      color: COLORS.text,
                    }}
                  />
                </View>
              </View>
            )}

            {/* Players */}
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 10 }}>
              PLAYERS
            </Text>
            {players.map((player, idx) => (
              <View
                key={player.id}
                style={{
                  backgroundColor: COLORS.surfaceMid,
                  borderRadius: RADII.lg,
                  padding: 12,
                  marginBottom: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {/* Avatar */}
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: COLORS.surfaceHighest,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 14, color: COLORS.text }}>
                    {player.name.trim() ? player.name.trim()[0].toUpperCase() : `${idx + 1}`}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <TextInput
                    value={player.name}
                    onChangeText={(v) => updatePlayer(player.id, "name", v)}
                    placeholder={`Player ${idx + 1}`}
                    placeholderTextColor={COLORS.textDim}
                    style={{ fontSize: 15, fontFamily: FONTS.medium, color: COLORS.text }}
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <View style={{ backgroundColor: COLORS.surfaceHighest, borderRadius: RADII.md, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textDim }}>
                        HCP {player.handicap || "0"}
                      </Text>
                    </View>
                    <TextInput
                      value={player.handicap}
                      onChangeText={(v) =>
                        updatePlayer(player.id, "handicap", v)
                      }
                      keyboardType="numeric"
                      style={{
                        backgroundColor: COLORS.surfaceLow,
                        borderRadius: RADII.md,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        fontSize: 12,
                        fontFamily: FONTS.medium,
                        color: COLORS.text,
                        width: 44,
                        textAlign: "center",
                        display: "none",
                      }}
                    />
                    {numGroups > 1 && (
                      <AnimatedPressable
                        onPress={() =>
                          updatePlayer(
                            player.id,
                            "groupIndex",
                            ((player.groupIndex + 1) % numGroups) as unknown as string
                          )
                        }
                        style={{
                          backgroundColor: COLORS.surfaceHighest,
                          borderRadius: RADII.md,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textDim }}>
                          G{player.groupIndex + 1}
                        </Text>
                      </AnimatedPressable>
                    )}
                  </View>
                </View>

                {hasTeams && (
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <AnimatedPressable
                      onPress={() => updatePlayer(player.id, "team", "A")}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: RADII.md,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: player.team === "A" ? COLORS.primary : COLORS.surfaceHighest,
                      }}
                    >
                      <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: player.team === "A" ? COLORS.onPrimary : COLORS.textDim }}>
                        A
                      </Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      onPress={() => updatePlayer(player.id, "team", "B")}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: RADII.md,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: player.team === "B" ? COLORS.secondary : COLORS.surfaceHighest,
                      }}
                    >
                      <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: player.team === "B" ? COLORS.bg : COLORS.textDim }}>
                        B
                      </Text>
                    </AnimatedPressable>
                  </View>
                )}

                {players.length > 2 && (
                  <AnimatedPressable onPress={() => removePlayer(player.id)} style={{ padding: 4 }}>
                    <X size={16} color={COLORS.textDim} />
                  </AnimatedPressable>
                )}
              </View>
            ))}

            <AnimatedPressable
              onPress={addPlayer}
              style={{
                borderRadius: RADII.lg,
                padding: 14,
                marginBottom: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <UserPlus size={16} color={COLORS.primary} />
              <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.primary }}>
                + ADD PLAYER
              </Text>
            </AnimatedPressable>

            {/* Number of Groups */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>
                NUMBER OF GROUPS
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <AnimatedPressable
                  onPress={() => {
                    if (numGroups > 1) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setNumGroups(numGroups - 1);
                    }
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: RADII.md,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: COLORS.surfaceMid,
                  }}
                >
                  <Minus size={16} color={COLORS.text} />
                </AnimatedPressable>
                <Text style={{ fontFamily: FONTS.headline, fontSize: 20, color: COLORS.text, width: 24, textAlign: "center" }}>
                  {numGroups}
                </Text>
                <AnimatedPressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setNumGroups(numGroups + 1);
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: RADII.md,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: COLORS.surfaceMid,
                  }}
                >
                  <Plus size={16} color={COLORS.text} />
                </AnimatedPressable>
              </View>
            </View>
          </View>
        )}

        {/* ═══════ Step 2: Game Modes ═══════ */}
        {step === 2 && (
          <View>
            <View style={{ backgroundColor: COLORS.primary + "1A", borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 8 }}>
              <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: COLORS.primary, letterSpacing: 1 }}>
                STEP 02
              </Text>
            </View>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.text, marginBottom: 20 }}>
              Select Game Modes
            </Text>

            {/* Popular Formats */}
            {popularFormats.length > 0 && (
              <>
                <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 10 }}>
                  POPULAR FORMATS
                </Text>
                {popularFormats.map(renderGameCard)}
              </>
            )}

            {/* Classic Formats */}
            {classicFormats.length > 0 && (
              <>
                <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginTop: 12, marginBottom: 10 }}>
                  CLASSIC FORMATS
                </Text>
                {classicFormats.map(renderGameCard)}
              </>
            )}

            {/* Incompatible Games */}
            {incompatibleGames.length > 0 && (
              <>
                <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginTop: 12, marginBottom: 10 }}>
                  REQUIRES DIFFERENT PLAYER COUNT
                </Text>
                {incompatibleGames.map((game) => (
                  <View
                    key={game.id}
                    style={{
                      backgroundColor: COLORS.surfaceMid,
                      borderRadius: RADII.lg,
                      padding: 14,
                      marginBottom: 8,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      opacity: 0.4,
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{game.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONTS.medium, fontSize: 15, color: COLORS.textDim }}>
                        {game.name}
                      </Text>
                      <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                        {game.minPlayers}-{game.maxPlayers} players
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ═══════ Step 3: Wager Settings ═══════ */}
        {step === 3 && (
          <View>
            <View style={{ backgroundColor: COLORS.primary + "1A", borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 8 }}>
              <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: COLORS.primary, letterSpacing: 1 }}>
                STEP 03
              </Text>
            </View>
            <Text style={{ fontFamily: FONTS.headline, fontSize: 24, color: COLORS.text, marginBottom: 20 }}>
              Wager Settings
            </Text>

            {/* Active games chips */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
              {selectedGames.map((gameId) => {
                const game = ALL_GAMES.find((g) => g.id === gameId);
                return (
                  <View
                    key={gameId}
                    style={{
                      backgroundColor: COLORS.primary + "1A",
                      borderRadius: RADII.md,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <Text style={{ fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.primary }}>
                      {game?.icon} {game?.name}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Stake per hole */}
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 10 }}>
              STAKE PER HOLE
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 24 }}>
              <Text style={{ fontFamily: FONTS.headline, fontSize: 28, color: COLORS.textDim, marginRight: 2 }}>
                $
              </Text>
              <TextInput
                value={betUnit}
                onChangeText={setBetUnit}
                keyboardType="numeric"
                style={{
                  fontFamily: FONTS.headline,
                  fontSize: 40,
                  color: COLORS.text,
                  minWidth: 60,
                }}
              />
            </View>

            {/* Toggle options */}
            <View
              style={{
                backgroundColor: COLORS.surfaceMid,
                borderRadius: RADII.lg,
                padding: 16,
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text }}>
                  Carryover
                </Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                  Tied skins carry to next hole
                </Text>
              </View>
              <Switch
                value={carryover}
                onValueChange={setCarryover}
                trackColor={{ false: COLORS.surfaceHighest, true: COLORS.primary }}
                thumbColor={COLORS.text}
              />
            </View>

            <View
              style={{
                backgroundColor: COLORS.surfaceMid,
                borderRadius: RADII.lg,
                padding: 16,
                marginBottom: 20,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text }}>
                  Press Rules
                </Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                  Auto-press when 2 down in Nassau
                </Text>
              </View>
              <Switch
                value={pressRules}
                onValueChange={setPressRules}
                trackColor={{ false: COLORS.surfaceHighest, true: COLORS.primary }}
                thumbColor={COLORS.text}
              />
            </View>

            {/* Entry Fee */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textDim }}>
                ENTRY FEE
              </Text>
              <Text style={{ fontFamily: FONTS.headline, fontSize: 18, color: COLORS.text }}>
                ${betAmount}
              </Text>
            </View>

            {/* Estimated Total Pot - Hero Card */}
            <View
              style={{
                backgroundColor: COLORS.surfaceHigh,
                borderRadius: RADII.xl,
                padding: 24,
                alignItems: "center",
                marginBottom: 20,
                ...GLOW.primaryStrong,
              }}
            >
              <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 8 }}>
                ESTIMATED TOTAL POT
              </Text>
              <Text style={{ fontFamily: FONTS.headline, fontSize: 48, color: COLORS.primary, marginBottom: 8 }}>
                ${estimatedPot}
              </Text>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textDim }}>
                  {validPlayerCount} players
                </Text>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textDim }}>
                  18 holes
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 96 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Navigation */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 24,
          paddingTop: 12,
          backgroundColor: COLORS.bg,
          flexDirection: "row",
          gap: 12,
        }}
      >
        {step > 1 && (
          <AnimatedPressable
            onPress={() => setStep(step - 1)}
            style={{
              borderRadius: RADII.lg,
              paddingVertical: 16,
              paddingHorizontal: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.textDim }}>
              {"\u2190"} BACK
            </Text>
          </AnimatedPressable>
        )}
        <AnimatedPressable
          onPress={() => {
            if (step < 3) setStep(step + 1);
            else createContest();
          }}
          disabled={!canProceed()}
          style={{
            flex: 1,
            borderRadius: RADII.lg,
            paddingVertical: 16,
            alignItems: "center",
            backgroundColor: canProceed() ? COLORS.primary : COLORS.surfaceHighest,
            ...(canProceed() && step === 3 ? GLOW.primary : {}),
          }}
        >
          <Text
            style={{
              fontFamily: FONTS.bold,
              fontSize: 15,
              color: canProceed() ? COLORS.onPrimary : COLORS.textDim,
            }}
          >
            {step === 3 ? "START CONTEST \u2713" : "NEXT \u2192"}
          </Text>
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}
