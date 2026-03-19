import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
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
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS } from "../../src/ui/theme";
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

  const canProceed = () => {
    if (step === 1) {
      return (
        players.filter((p) => p.name.trim()).length >= 2
      );
    }
    if (step === 2) {
      return selectedGames.length > 0;
    }
    return true;
  };

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

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      {/* Header */}
      <View className="px-5 pt-2 pb-3 flex-row items-center gap-3">
        <Pressable
          onPress={() => (step > 1 ? setStep(step - 1) : router.back())}
          className="rounded-xl p-2"
          style={{
            backgroundColor: COLORS.card,
            borderColor: COLORS.border,
            borderWidth: 1,
          }}
        >
          <ChevronLeft size={20} color={COLORS.textDim} />
        </Pressable>
        <Text className="text-text-primary text-xl font-bold flex-1">
          New Contest
        </Text>
        <Text className="text-text-dim text-sm">Step {step}/3</Text>
      </View>

      {/* Progress */}
      <View className="flex-row gap-1 px-5 mb-4">
        {[1, 2, 3].map((s) => (
          <View
            key={s}
            className="flex-1 h-1 rounded-full"
            style={{
              backgroundColor: s <= step ? COLORS.accent : COLORS.border,
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
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step 1: Players & Course */}
        {step === 1 && (
          <View>
            <Text className="text-xs font-bold mb-1" style={{ color: COLORS.accent }}>
              STEP 1
            </Text>
            <Text className="text-text-primary text-xl font-bold mb-5">
              Players & Course
            </Text>

            {/* Contest Name */}
            <Text className="text-text-dim text-xs font-semibold mb-1.5">
              Contest Name
            </Text>
            <TextInput
              value={contestName}
              onChangeText={setContestName}
              placeholder={courseName ? `${dayName} at ${courseName}` : `${dayName} Round`}
              placeholderTextColor={COLORS.textDim}
              className="rounded-xl px-4 py-3 text-sm mb-4"
              style={{
                backgroundColor: COLORS.inputBg,
                borderColor: COLORS.border,
                borderWidth: 1,
                color: COLORS.text,
              }}
            />

            {/* Course Selection */}
            <Text className="text-text-dim text-xs font-semibold mb-1.5">
              Course
            </Text>
            <View className="mb-4">
              <CourseSearch
                initialCourseName={courseName}
                onSelect={(course, name, teeBox) => {
                  setSelectedCourse(course);
                  setCourseName(name);
                  setSelectedTeeBox(teeBox ?? null);
                }}
              />
              {selectedTeeBox && (
                <View className="flex-row items-center gap-2 mt-2 px-1">
                  <Text className="text-text-dim text-xs">
                    {selectedTeeBox.name} Tees
                    {selectedTeeBox.totalYards > 0 ? ` · ${selectedTeeBox.totalYards} yds` : ""}
                    {selectedTeeBox.courseRating ? ` · ${selectedTeeBox.courseRating}/${selectedTeeBox.slopeRating}` : ""}
                  </Text>
                </View>
              )}
            </View>

            {/* Teams Toggle */}
            <View
              className="rounded-xl p-4 mb-4 flex-row items-center justify-between"
              style={{
                backgroundColor: hasTeams ? COLORS.accentGlow : COLORS.card,
                borderColor: hasTeams ? COLORS.accent : COLORS.border,
                borderWidth: 1,
              }}
            >
              <View className="flex-1 mr-3">
                <Text className="text-text-primary font-semibold text-sm">
                  Team Mode
                </Text>
                <Text className="text-text-dim text-xs mt-0.5">
                  Split players into two teams
                </Text>
              </View>
              <Switch
                value={hasTeams}
                onValueChange={setHasTeams}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor="#fff"
              />
            </View>

            {hasTeams && (
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <View
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS.accent }}
                    />
                    <Text className="text-text-dim text-xs font-semibold">
                      Team A
                    </Text>
                  </View>
                  <TextInput
                    value={teamAName}
                    onChangeText={setTeamAName}
                    className="rounded-xl px-3 py-2.5 text-sm"
                    style={{
                      backgroundColor: COLORS.inputBg,
                      borderColor: COLORS.border,
                      borderWidth: 1,
                      color: COLORS.text,
                    }}
                  />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <View
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS.blue }}
                    />
                    <Text className="text-text-dim text-xs font-semibold">
                      Team B
                    </Text>
                  </View>
                  <TextInput
                    value={teamBName}
                    onChangeText={setTeamBName}
                    className="rounded-xl px-3 py-2.5 text-sm"
                    style={{
                      backgroundColor: COLORS.inputBg,
                      borderColor: COLORS.border,
                      borderWidth: 1,
                      color: COLORS.text,
                    }}
                  />
                </View>
              </View>
            )}

            {/* Players */}
            <Text className="text-text-dim text-xs font-semibold mb-2">
              PLAYERS
            </Text>
            {players.map((player, idx) => (
              <View
                key={player.id}
                className="rounded-xl p-3 mb-2 flex-row items-center gap-2"
                style={{
                  backgroundColor: COLORS.card,
                  borderColor:
                    hasTeams && player.team === "A"
                      ? COLORS.accent + "44"
                      : hasTeams && player.team === "B"
                      ? COLORS.blue + "44"
                      : COLORS.border,
                  borderWidth: 1,
                }}
              >
                <View className="flex-1 gap-2">
                  <TextInput
                    value={player.name}
                    onChangeText={(v) => updatePlayer(player.id, "name", v)}
                    placeholder={`Player ${idx + 1}`}
                    placeholderTextColor={COLORS.textDim}
                    className="text-sm"
                    style={{ color: COLORS.text }}
                  />
                  <View className="flex-row items-center gap-2">
                    <Text className="text-text-dim text-xs">HCP:</Text>
                    <TextInput
                      value={player.handicap}
                      onChangeText={(v) =>
                        updatePlayer(player.id, "handicap", v)
                      }
                      keyboardType="numeric"
                      className="text-xs rounded-md px-2 py-1 w-12 text-center"
                      style={{
                        backgroundColor: COLORS.inputBg,
                        color: COLORS.text,
                        borderColor: COLORS.border,
                        borderWidth: 1,
                      }}
                    />
                    {numGroups > 1 && (
                      <>
                        <Text className="text-text-dim text-xs ml-2">
                          Group:
                        </Text>
                        <Pressable
                          onPress={() =>
                            updatePlayer(
                              player.id,
                              "groupIndex",
                              ((player.groupIndex + 1) % numGroups) as unknown as string
                            )
                          }
                          className="rounded-md px-2 py-1"
                          style={{
                            backgroundColor: COLORS.inputBg,
                            borderColor: COLORS.border,
                            borderWidth: 1,
                          }}
                        >
                          <Text className="text-xs" style={{ color: COLORS.text }}>
                            {player.groupIndex + 1}
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>

                {hasTeams && (
                  <View className="flex-row gap-1">
                    <Pressable
                      onPress={() => updatePlayer(player.id, "team", "A")}
                      className="w-8 h-8 rounded-lg items-center justify-center"
                      style={{
                        backgroundColor:
                          player.team === "A" ? COLORS.accent : "transparent",
                        borderColor:
                          player.team === "A" ? COLORS.accent : COLORS.border,
                        borderWidth: 2,
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{
                          color: player.team === "A" ? "#000" : COLORS.textDim,
                        }}
                      >
                        A
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => updatePlayer(player.id, "team", "B")}
                      className="w-8 h-8 rounded-lg items-center justify-center"
                      style={{
                        backgroundColor:
                          player.team === "B" ? COLORS.blue : "transparent",
                        borderColor:
                          player.team === "B" ? COLORS.blue : COLORS.border,
                        borderWidth: 2,
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{
                          color: player.team === "B" ? "#fff" : COLORS.textDim,
                        }}
                      >
                        B
                      </Text>
                    </Pressable>
                  </View>
                )}

                {players.length > 2 && (
                  <Pressable onPress={() => removePlayer(player.id)} className="p-1">
                    <X size={16} color={COLORS.textDim} />
                  </Pressable>
                )}
              </View>
            ))}

            <Pressable
              onPress={addPlayer}
              className="rounded-xl p-3 mb-4 flex-row items-center justify-center gap-2"
              style={{
                borderColor: COLORS.border,
                borderWidth: 1,
                borderStyle: "dashed",
              }}
            >
              <UserPlus size={16} color={COLORS.accent} />
              <Text className="text-sm font-semibold" style={{ color: COLORS.accent }}>
                Add Player
              </Text>
            </Pressable>

            {/* Number of Groups */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-text-dim text-xs font-semibold">
                NUMBER OF GROUPS
              </Text>
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => {
                    if (numGroups > 1) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setNumGroups(numGroups - 1);
                    }
                  }}
                  className="w-9 h-9 rounded-lg items-center justify-center"
                  style={{
                    backgroundColor: COLORS.card,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                  }}
                >
                  <Minus size={16} color={COLORS.text} />
                </Pressable>
                <Text className="text-text-primary text-lg font-bold w-6 text-center">
                  {numGroups}
                </Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setNumGroups(numGroups + 1);
                  }}
                  className="w-9 h-9 rounded-lg items-center justify-center"
                  style={{
                    backgroundColor: COLORS.card,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                  }}
                >
                  <Plus size={16} color={COLORS.text} />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Step 2: Games */}
        {step === 2 && (
          <View>
            <Text className="text-xs font-bold mb-1" style={{ color: COLORS.accent }}>
              STEP 2
            </Text>
            <Text className="text-text-primary text-xl font-bold mb-5">
              Select Games
            </Text>

            {/* Bet Unit */}
            <View className="flex-row items-center gap-3 mb-5">
              <Text className="text-text-dim text-sm font-semibold">
                Bet Unit:
              </Text>
              <View className="flex-row items-center">
                <Text className="text-text-primary text-lg font-bold mr-1">
                  $
                </Text>
                <TextInput
                  value={betUnit}
                  onChangeText={setBetUnit}
                  keyboardType="numeric"
                  className="rounded-lg px-3 py-2 text-base font-bold w-20 text-center"
                  style={{
                    backgroundColor: COLORS.inputBg,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                    color: COLORS.text,
                  }}
                />
              </View>
            </View>

            {/* Recommended Games */}
            {recommendedGames.length > 0 && (
              <Text
                style={{
                  color: COLORS.accent,
                  fontSize: 11,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 8,
                }}
              >
                Recommended for {playerCount} players
              </Text>
            )}
            {recommendedGames.map((game) => {
              const isSelected = selectedGames.includes(game.id);
              const isFree = FREE_GAME_IDS.includes(game.id);
              return (
                <Pressable
                  key={game.id}
                  onPress={() => toggleGame(game.id)}
                  className="rounded-xl p-3.5 mb-2 flex-row items-center gap-3"
                  style={{
                    backgroundColor: isSelected
                      ? COLORS.accentGlow
                      : COLORS.card,
                    borderColor: isSelected
                      ? COLORS.accent + "44"
                      : COLORS.border,
                    borderWidth: 1,
                  }}
                >
                  <Text className="text-2xl">{game.icon}</Text>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text
                        className="text-sm"
                        style={{
                          color: COLORS.text,
                          fontWeight: isSelected ? "700" : "400",
                        }}
                      >
                        {game.name}
                      </Text>
                      {!isFree && (
                        <View
                          className="rounded px-1.5 py-0.5 flex-row items-center gap-1"
                          style={{ backgroundColor: COLORS.gold + "22" }}
                        >
                          <Lock size={10} color={COLORS.gold} />
                          <Text
                            className="text-[9px] font-bold"
                            style={{ color: COLORS.gold }}
                          >
                            PRO
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-text-dim text-xs mt-0.5">
                      {game.desc}
                    </Text>
                  </View>
                  <View
                    className="w-6 h-6 rounded-md items-center justify-center"
                    style={{
                      borderColor: isSelected ? COLORS.accent : COLORS.border,
                      borderWidth: 2,
                      backgroundColor: isSelected ? COLORS.accent : "transparent",
                    }}
                  >
                    {isSelected && <Check size={14} color="#000" />}
                  </View>
                </Pressable>
              );
            })}

            {/* Incompatible Games */}
            {incompatibleGames.length > 0 && (
              <Text
                style={{
                  color: COLORS.textDim,
                  fontSize: 11,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginTop: 12,
                  marginBottom: 8,
                }}
              >
                Requires different player count
              </Text>
            )}
            {incompatibleGames.map((game) => (
              <View
                key={game.id}
                className="rounded-xl p-3.5 mb-2 flex-row items-center gap-3"
                style={{
                  backgroundColor: COLORS.card,
                  borderColor: COLORS.border,
                  borderWidth: 1,
                  opacity: 0.45,
                }}
              >
                <Text className="text-2xl">{game.icon}</Text>
                <View className="flex-1">
                  <Text
                    className="text-sm"
                    style={{ color: COLORS.textDim }}
                  >
                    {game.name}
                  </Text>
                  <Text className="text-text-dim text-xs mt-0.5">
                    {game.minPlayers}–{game.maxPlayers} players
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Step 3: Review & Create */}
        {step === 3 && (
          <View>
            <Text className="text-xs font-bold mb-1" style={{ color: COLORS.accent }}>
              STEP 3
            </Text>
            <Text className="text-text-primary text-xl font-bold mb-5">
              Review & Create
            </Text>

            <View
              className="rounded-2xl p-4"
              style={{
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              {[
                ["Contest", contestName || (courseName ? `${dayName} at ${courseName}` : `${dayName} Round`)],
                ["Course", courseName || "My Course"],
                [
                  "Players",
                  `${players.filter((p) => p.name.trim()).length} players in ${numGroups} group${numGroups > 1 ? "s" : ""}`,
                ],
                ...(hasTeams
                  ? [["Teams", `${teamAName} vs ${teamBName}`]]
                  : []),
                [
                  "Games",
                  selectedGames
                    .map(
                      (id) =>
                        ALL_GAMES.find((g) => g.id === id)?.icon || ""
                    )
                    .join(" "),
                ],
                ["Bet Unit", `$${betUnit}`],
              ].map(([label, value]) => (
                <View
                  key={label}
                  className="flex-row justify-between py-2"
                  style={{
                    borderBottomColor: COLORS.border + "22",
                    borderBottomWidth: 1,
                  }}
                >
                  <Text className="text-text-dim text-sm">{label}</Text>
                  <Text className="text-text-primary text-sm font-semibold">
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Player List Preview */}
            <Text className="text-text-dim text-xs font-semibold mt-4 mb-2">
              PLAYERS
            </Text>
            {players
              .filter((p) => p.name.trim())
              .map((p) => (
                <View
                  key={p.id}
                  className="flex-row items-center gap-2 py-1.5"
                >
                  {hasTeams && (
                    <View
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          p.team === "A"
                            ? COLORS.accent
                            : p.team === "B"
                            ? COLORS.blue
                            : COLORS.textDim,
                      }}
                    />
                  )}
                  <Text className="text-text-primary text-sm flex-1">
                    {p.name}
                  </Text>
                  <Text className="text-text-dim text-xs">
                    HCP {p.handicap}
                  </Text>
                  {numGroups > 1 && (
                    <Text className="text-text-dim text-xs">
                      G{p.groupIndex + 1}
                    </Text>
                  )}
                </View>
              ))}
          </View>
        )}

        <View className="h-24" />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Navigation */}
      <View
        className="px-5 pb-6 pt-3"
        style={{
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        }}
      >
        <Pressable
          onPress={() => {
            if (step < 3) setStep(step + 1);
            else createContest();
          }}
          disabled={!canProceed()}
          className="rounded-xl py-4 items-center"
          style={{
            backgroundColor: canProceed()
              ? step === 3
                ? COLORS.accent
                : COLORS.blue
              : COLORS.border,
          }}
        >
          <Text
            className="font-bold text-base"
            style={{ color: canProceed() ? "#000" : COLORS.textDim }}
          >
            {step === 3 ? "Create Contest ⛳" : "Next"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
