import * as Crypto from 'expo-crypto';
import { useScanStore } from "../../src/stores/scan-store";
import { canUseGame, canHostTournament } from "../../src/services/entitlements";
import { COURSE_SEARCH_ENABLED } from "../../src/config/features";
import { REAL_AUTH_CONFIGURED } from "../../src/config/auth";
import { useState, useMemo } from "react";
import {
  View,
  Alert,
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
  Info,
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
import { useAuthStore } from "../../src/stores/auth-store";
import CourseSearch from "../../src/ui/CourseSearch";
import type { Course } from "../../src/engine/types";
import type { TeeBox } from "../../src/services/course-api";
import {
  ALL_GAMES,
  FREE_GAME_IDS,
  IMPLEMENTED_GAME_IDS,
  isGameImplemented,
  GameType,
  GameTypeInfo,
  GameConfig,
  GAME_VARIATIONS,
  validateVariationSetup,
  Player,
} from "../../src/engine/types";
import { AnimatedPressable } from "../../src/ui/AnimatedPressable";

interface PlayerInput {
  id: string;
  name: string;
  handicap: string;
  team: string | null; // team ID, null = no team
  groupIndex: number;
  /** Player 1 is the signed-in host. The flag stays if they edit the name. */
  host?: boolean;
}

interface TeamInput {
  id: string;
  name: string;
}

export default function NewContestScreen() {
  const router = useRouter();
  const tier = useScanStore(s => s.tier);
  const addContest = useContestStore((s) => s.addContest);
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState(1);

  // Auto-generate contest name
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Auto-populate Player 1 with signed-in user's first name
  const userFirstName = user?.firstName || user?.name?.split(" ")[0] || "";

  // Step 1: Players & Course
  const [contestName, setContestName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [isTournament, setIsTournament] = useState(false);
  const [numRounds, setNumRounds] = useState(2);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedTeeBox, setSelectedTeeBox] = useState<TeeBox | null>(null);
  const [numGroups, setNumGroups] = useState(1);
  const [players, setPlayers] = useState<PlayerInput[]>([
    { id: generateId(), name: userFirstName, handicap: "0", team: null, groupIndex: 0, host: true },
    { id: generateId(), name: "", handicap: "0", team: null, groupIndex: 0 },
  ]);
  const [hasTeams, setHasTeams] = useState(false);
  const [teams, setTeams] = useState<TeamInput[]>([
    { id: "A", name: "Eagles" },
    { id: "B", name: "Birdies" },
  ]);

  const addTeam = () => {
    if (teams.length >= 20) return;
    const letter = String.fromCharCode(65 + teams.length); // C, D, E...
    setTeams([...teams, { id: letter, name: `Team ${letter}` }]);
  };

  const removeTeam = (id: string) => {
    if (teams.length <= 2) return;
    setTeams(teams.filter((t) => t.id !== id));
    // Unassign players from removed team
    setPlayers(players.map((p) => p.team === id ? { ...p, team: null } : p));
  };

  const updateTeamName = (id: string, name: string) => {
    setTeams(teams.map((t) => t.id === id ? { ...t, name } : t));
  };

  // Legacy compat
  const teamAName = teams[0]?.name || "Eagles";
  const teamBName = teams[1]?.name || "Birdies";

  // Step 2: Games
  const [selectedGames, setSelectedGames] = useState<GameType[]>(["stroke_play"]);
  const [betUnit, setBetUnit] = useState("5");

  // Step 3: Wager settings & game variations
  const [gameConfig, setGameConfig] = useState<GameConfig>({ rulesVersion: 1, inputRulesVersion: 1, skinsMode: "net", skinsScope: "field" });
  const [expandedTooltip, setExpandedTooltip] = useState<string | null>(null);

  // Filter variations to only show ones relevant to selected games
  const applicableVariations = useMemo(
    () =>
      GAME_VARIATIONS.filter((v) =>
        v.appliesTo.some((gameId) => selectedGames.includes(gameId) && canUseGame(gameId, tier))
      ),
    [selectedGames]
  );

  const valuesMatch = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b))
      return a.length === b.length && a.every((v, i) => v === b[i]);
    return JSON.stringify(a) === JSON.stringify(b);
  };

  const toggleVariation = (variation: typeof GAME_VARIATIONS[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGameConfig((prev) => {
      const currentVal = prev[variation.configKey];
      // If already set to this value, remove it (toggle off)
      if (valuesMatch(currentVal, variation.configValue)) {
        const next = { ...prev };
        delete next[variation.configKey];
        if (variation.configKey === "birdieFlip") delete next.birdieBlocksBirdie;
        return next;
      }
      // Otherwise set it
      const next = { ...prev, [variation.configKey]: variation.configValue };
      if (variation.configKey === "alohaPressOn18") delete next.noPressLast;
      if (variation.configKey === "noPressLast") delete next.alohaPressOn18;
      if (variation.configKey === "birdieBlocksBirdie") next.birdieFlip = true;
      return next;
    });
  };

  const isVariationActive = (variation: typeof GAME_VARIATIONS[number]) => {
    return valuesMatch(gameConfig[variation.configKey], variation.configValue);
  };

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
    if (!selectedGames.includes(gameId) && !canUseGame(gameId, tier)) { router.push("/paywall"); return; }
    if (!isGameImplemented(gameId)) return; // Coming Soon — can't select
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGames((prev) =>
      prev.includes(gameId)
        ? prev.filter((g) => g !== gameId)
        : [...prev.filter(g => !(["skins", "skins_carry"].includes(gameId) && ["skins", "skins_carry"].includes(g)) && !(["nassau", "nassau_press"].includes(gameId) && ["nassau", "nassau_press"].includes(g))), gameId]
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
      ALL_GAMES
        .filter((g) => playerCount < g.minPlayers || playerCount > g.maxPlayers)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [playerCount]
  );

  // Separate popular vs classic, sort alphabetically within each
  const sortByName = (a: GameTypeInfo, b: GameTypeInfo) =>
    a.name.localeCompare(b.name);
  const popularFormats = recommendedGames
    .filter((g) => ["stroke_play", "skins", "skins_carry", "nassau", "stableford", "best_ball", "match_play"].includes(g.id))
    .sort(sortByName);
  const classicFormats = recommendedGames
    .filter((g) => !["stroke_play", "skins", "skins_carry", "nassau", "stableford", "best_ball", "match_play"].includes(g.id))
    .sort(sortByName);

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
    if (!canHostTournament({numGroups, numRounds: isTournament ? numRounds : 1}, tier)) { router.push("/paywall?tier=td"); return; }
    if (selectedGames.some(g => !canUseGame(g, tier))) { router.push("/paywall"); return; }
    if (REAL_AUTH_CONFIGURED && (useAuthStore.getState().isAnonymous || !useAuthStore.getState().session)) {
      router.push("/auth/sign-in"); return;
    }
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
          host: p.host === true,
          scores: new Array(18).fill(0),
        })),
      })
    );

    const cleanConfig: GameConfig = {rulesVersion:1,inputRulesVersion:1};
    if (selectedGames.some(g => g === "skins" || g === "skins_carry")) { cleanConfig.skinsMode = gameConfig.skinsMode; cleanConfig.skinsScope = gameConfig.skinsScope; }
    for (const v of GAME_VARIATIONS) if (v.appliesTo.some(g => selectedGames.includes(g)) && gameConfig[v.configKey] !== undefined) cleanConfig[v.configKey] = gameConfig[v.configKey];
    const error = validateVariationSetup(groups, selectedGames, cleanConfig, Number(betUnit));
    if (error) { Alert.alert("Review contest rules", error); return; }
    const contest: Contest = {
      id: Crypto.randomUUID(),
      name: contestName || autoName,
      course,
      status: "active",
      betUnit: Number(betUnit),
      hasTeams,
      teams: hasTeams ? teams.map((t) => ({ id: t.id, name: t.name })) : undefined,
      teamAName: hasTeams ? teams[0]?.name : undefined,
      teamBName: hasTeams ? teams[1]?.name : undefined,
      groups,
      games: selectedGames,
      gameConfig: cleanConfig,
      createdAt: new Date().toISOString(),
    };

    addContest(contest);
    router.replace(`/contest/${contest.id}`);
  };

  const renderGameCard = (game: GameTypeInfo) => {
    const isSelected = selectedGames.includes(game.id);
    const isFree = FREE_GAME_IDS.includes(game.id);
    const isImplemented = isGameImplemented(game.id);
    const isComingSoon = !isImplemented;
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
          opacity: isComingSoon ? 0.5 : 1,
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontFamily: isSelected ? FONTS.bold : FONTS.semibold, fontSize: 15, color: isComingSoon ? COLORS.textDim : COLORS.text }}>
              {!canUseGame(game.id, tier) ? "🔒 " : ""}{game.name}
            </Text>
            {isComingSoon ? (
              <View style={{ backgroundColor: COLORS.secondary + "22", borderRadius: RADII.md, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontFamily: FONTS.bold, fontSize: 9, color: COLORS.secondary }}>
                  COMING SOON
                </Text>
              </View>
            ) : !isFree ? (
              <View style={{ backgroundColor: COLORS.gold + "22", borderRadius: RADII.md, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Lock size={9} color={COLORS.gold} />
                <Text style={{ fontFamily: FONTS.bold, fontSize: 9, color: COLORS.gold }}>
                  PRO
                </Text>
              </View>
            ) : null}
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
        {/* Toggle circle or Coming Soon indicator */}
        {isComingSoon ? (
          <View style={{ width: 26, height: 26 }} />
        ) : (
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
        )}
      </AnimatedPressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <AnimatedPressable
          testID="new-contest-back" accessibilityRole="button" accessibilityLabel="Back"
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
        nestedScrollEnabled
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>
                CONTEST NAME
              </Text>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 10, color: COLORS.textDim }}>
                (optional)
              </Text>
            </View>
            <TextInput
              value={contestName}
              onChangeText={setContestName}
              placeholder={courseName ? `${dayName} at ${courseName}` : `${dayName} Round`}
              placeholderTextColor={COLORS.textDim}
              style={{
                backgroundColor: COLORS.surfaceLow,
                borderColor: COLORS.border,
                borderWidth: 1,
                borderRadius: RADII.md,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 15,
                fontFamily: FONTS.regular,
                color: COLORS.text,
                marginBottom: 16,
              }}
            />

            {/* Tournament Toggle */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <Switch
                testID="tournament-toggle"
                value={isTournament}
                onValueChange={(val) => {
                  if (val && !canHostTournament({numRounds}, tier)) { router.push("/paywall?tier=td"); return; }
                  setIsTournament(val);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={COLORS.card}
              />
              <Text style={{ color: COLORS.text, fontSize: 15, marginLeft: 12 }}>
                Multi-Day Tournament
              </Text>
            </View>

            {isTournament && (
              <View style={{ marginBottom: 16, paddingLeft: 48 }}>
                <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 8, fontSize: 11 }}>
                  NUMBER OF ROUNDS
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[2, 3, 4].map((n) => (
                    <AnimatedPressable
                      key={n}
                      testID={`rounds-${n}`}
                      onPress={() => {
                        setNumRounds(n);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: RADII.md,
                        borderWidth: 1,
                        borderColor: numRounds === n ? COLORS.primary : COLORS.border,
                        backgroundColor: numRounds === n ? COLORS.primary + "20" : COLORS.surfaceLow,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: numRounds === n ? FONTS.semibold : FONTS.regular,
                          color: numRounds === n ? COLORS.primary : COLORS.text,
                        }}
                      >
                        {n}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
            )}

            {/* Course Selection */}
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 6 }}>
              COURSE
            </Text>
            <View style={{ marginBottom: 16 }}>
              {COURSE_SEARCH_ENABLED ? (
                <CourseSearch
                  initialCourseName={courseName}
                  onSelect={(course, name, teeBox) => {
                    setSelectedCourse(course);
                    setCourseName(name);
                    setSelectedTeeBox(teeBox ?? null);
                  }}
                />
              ) : (
                <TextInput
                  accessibilityLabel="Course name"
                  value={courseName}
                  onChangeText={setCourseName}
                  placeholder="My Course"
                  placeholderTextColor={COLORS.textDim}
                  style={{
                    backgroundColor: COLORS.surfaceLow,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                    borderRadius: RADII.md,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 15,
                    fontFamily: FONTS.regular,
                    color: COLORS.text,
                  }}
                />
              )}
              {selectedTeeBox && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 4 }}>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim }}>
                    {selectedTeeBox.name} Tees
                    {(selectedTeeBox.totalYards ?? 0) > 0 ? ` \u00B7 ${selectedTeeBox.totalYards} yds` : ""}
                    {selectedTeeBox.courseRating ? ` \u00B7 ${selectedTeeBox.courseRating}/${selectedTeeBox.slopeRating ?? ""}` : ""}
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
                  Split players into teams (up to 20)
                </Text>
              </View>
              <Switch
                testID="team-mode"
                value={hasTeams}
                onValueChange={setHasTeams}
                trackColor={{ false: COLORS.surfaceHighest, true: COLORS.primary }}
                thumbColor={COLORS.text}
              />
            </View>

            {hasTeams && (
              <View style={{ marginBottom: 16 }}>
                {teams.map((t, ti) => (
                  <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: RADII.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: COLORS.onPrimary }}>{t.id}</Text>
                    </View>
                    <TextInput
                      value={t.name}
                      onChangeText={(v) => updateTeamName(t.id, v)}
                      style={{
                        flex: 1,
                        backgroundColor: COLORS.surfaceLow,
                        borderRadius: RADII.md,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 14,
                        fontFamily: FONTS.regular,
                        color: COLORS.text,
                      }}
                    />
                    {teams.length > 2 && (
                      <AnimatedPressable onPress={() => removeTeam(t.id)} style={{ padding: 4 }}>
                        <X size={14} color={COLORS.textDim} />
                      </AnimatedPressable>
                    )}
                  </View>
                ))}
                {teams.length < 20 && (
                  <AnimatedPressable
                    onPress={addTeam}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: RADII.md,
                      backgroundColor: COLORS.surfaceLow,
                    }}
                  >
                    <Plus size={14} color={COLORS.primary} />
                    <Text style={{ fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.primary }}>
                      Add Team ({teams.length}/20)
                    </Text>
                  </AnimatedPressable>
                )}
              </View>
            )}

            {/* Players */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>
                PLAYERS
              </Text>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: validPlayerCount >= 2 ? COLORS.primary : COLORS.gold }}>
                {validPlayerCount >= 2 ? `${validPlayerCount} ready` : "Min 2 required"}
              </Text>
            </View>
            {players.map((player, idx) => {
              const nameEmpty = !player.name.trim();
              return (
              <View
                key={player.id}
                style={{
                  backgroundColor: COLORS.surfaceMid,
                  borderColor: nameEmpty ? COLORS.warn + "66" : COLORS.border,
                  borderWidth: 1,
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
                    placeholder={idx === 0 ? "Your name" : `Player ${idx + 1} name`}
                    placeholderTextColor={nameEmpty ? COLORS.warn : COLORS.textDim}
                    style={{
                      fontSize: 15,
                      fontFamily: FONTS.medium,
                      color: COLORS.text,
                      backgroundColor: nameEmpty ? COLORS.warn + "08" : "transparent",
                      borderRadius: RADII.sm,
                      paddingHorizontal: nameEmpty ? 8 : 0,
                      paddingVertical: 2,
                      marginHorizontal: nameEmpty ? -8 : 0,
                    }}
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textDim }}>
                      HCP
                    </Text>
                    <TextInput
                      accessibilityLabel={`Handicap for ${player.name || "player"}`}
                      testID={`player-handicap-${player.name}`}
                      value={player.handicap}
                      onChangeText={(v) => {
                        // Allow +, -, digits, and decimal point
                        // "+" prefix means plus handicap (better than scratch) = stored as negative
                        const cleaned = v.replace(/[^0-9.+\-]/g, "");
                        updatePlayer(player.id, "handicap", cleaned);
                      }}
                      onBlur={() => {
                        let raw = player.handicap.trim();
                        // Convert "+2" to "-2" (plus handicap = negative number internally)
                        if (raw.startsWith("+")) {
                          raw = "-" + raw.slice(1);
                        }
                        const num = parseFloat(raw) || 0;
                        const clamped = Math.min(54, Math.max(-10, num));
                        updatePlayer(player.id, "handicap", String(clamped));
                      }}
                      placeholder="0"
                      placeholderTextColor={COLORS.textDim}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      style={{
                        backgroundColor: COLORS.surfaceHighest,
                        borderRadius: RADII.md,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        fontSize: 14,
                        fontFamily: FONTS.bold,
                        color: parseFloat(player.handicap) < 0 ? COLORS.gold : COLORS.primary,
                        width: 60,
                        textAlign: "center",
                      }}
                    />
                    {numGroups > 1 && (
                      <AnimatedPressable testID={`player-group-${player.name}`} accessibilityLabel={`Change group for ${player.name}`}
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

                {hasTeams && teams.length <= 4 && (
                  <View style={{ flexDirection: "row", gap: 3, flexWrap: "wrap" }}>
                    {teams.map((t) => {
                      const isActive = player.team === t.id;
                      return (
                        <AnimatedPressable
                          key={t.id}
                          testID={`player-team-${player.name}-${t.id}`}
                          onPress={() => updatePlayer(player.id, "team", isActive ? null : t.id)}
                          style={{
                            minWidth: 28,
                            height: 28,
                            borderRadius: RADII.md,
                            alignItems: "center",
                            justifyContent: "center",
                            paddingHorizontal: 6,
                            backgroundColor: isActive ? COLORS.primary : COLORS.surfaceHighest,
                          }}
                        >
                          <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: isActive ? COLORS.onPrimary : COLORS.textDim }}>
                            {t.id}
                          </Text>
                        </AnimatedPressable>
                      );
                    })}
                  </View>
                )}

                {hasTeams && teams.length > 4 && (
                  <AnimatedPressable
                    onPress={() => {
                      const currentIdx = teams.findIndex((t) => t.id === player.team);
                      const nextIdx = (currentIdx + 1) % (teams.length + 1);
                      const nextTeam = nextIdx === teams.length ? null : teams[nextIdx].id;
                      updatePlayer(player.id, "team", nextTeam);
                    }}
                    style={{
                      minWidth: 36,
                      height: 28,
                      borderRadius: RADII.md,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 8,
                      backgroundColor: player.team ? COLORS.primary : COLORS.surfaceHighest,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.bold,
                        fontSize: 11,
                        color: player.team ? COLORS.onPrimary : COLORS.textDim,
                      }}
                    >
                      {player.team || "—"}
                    </Text>
                  </AnimatedPressable>
                )}

                {players.length > 2 && (
                  <AnimatedPressable onPress={() => removePlayer(player.id)} style={{ padding: 4 }}>
                    <X size={16} color={COLORS.textDim} />
                  </AnimatedPressable>
                )}
              </View>
            );
            })}

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
                <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 20, color: COLORS.text, width: 24, textAlign: "center" }}>
                  {numGroups}
                </Text>
                <AnimatedPressable
                  testID="add-group" accessibilityLabel="Add group"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (!canHostTournament({numGroups: numGroups + 1}, tier)) { router.push("/paywall?tier=td"); return; }
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

            {selectedGames.some((g) => g === "skins" || g === "skins_carry") && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: COLORS.text, marginBottom: 8 }}>Skins scoring</Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {(["net", "gross"] as const).map((mode) => (
                    <AnimatedPressable key={mode} testID={`skins-mode-${mode}`}
                      accessibilityRole="radio" accessibilityLabel={mode === "net" ? "Net skins" : "Gross skins"}
                      aria-checked={(gameConfig.skinsMode ?? "net") === mode}
                      accessibilityState={{ checked: (gameConfig.skinsMode ?? "net") === mode }}
                      onPress={() => setGameConfig((prev) => ({ ...prev, skinsMode: mode }))}
                      style={{ padding: 12, borderRadius: 8, backgroundColor: (gameConfig.skinsMode ?? "net") === mode ? COLORS.primary : COLORS.surfaceMid }}>
                      <Text style={{ color: COLORS.text }}>{mode === "net" ? "Net" : "Gross"}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
                <Text style={{ color: COLORS.text, marginTop: 12, marginBottom: 8 }}>Skins scope</Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {(["field", "group"] as const).map((scope) => (
                    <AnimatedPressable key={scope} testID={`skins-scope-${scope}`}
                      accessibilityRole="radio" accessibilityLabel={scope === "field" ? "Whole field" : "Each group"}
                      aria-checked={(gameConfig.skinsScope ?? "field") === scope}
                      accessibilityState={{ checked: (gameConfig.skinsScope ?? "field") === scope }}
                      onPress={() => setGameConfig(prev => ({ ...prev, skinsScope: scope }))}
                      style={{ padding: 12, borderRadius: 8, backgroundColor: (gameConfig.skinsScope ?? "field") === scope ? COLORS.primary : COLORS.surfaceMid }}>
                      <Text style={{ color: COLORS.text }}>{scope === "field" ? "Whole field" : "Each group"}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
                <Text style={{ color: COLORS.textDim, marginTop: 8 }}>Net applies handicap strokes by hole; Gross uses scores as entered.</Text>
              </View>
            )}

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
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONTS.medium, fontSize: 15, color: COLORS.textDim }}>
                        {!canUseGame(game.id, tier) ? "🔒 " : ""}{game.name}
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
                      {game?.name}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Stake per hole */}
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 10 }}>
              BET UNIT
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 24 }}>
              <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 28, color: COLORS.textDim, marginRight: 2 }}>
                $
              </Text>
              <TextInput
                value={betUnit}
                onChangeText={setBetUnit}
                keyboardType="numeric"
                style={{
                  fontFamily: FONTS.score, fontVariant: ['tabular-nums'],
                  fontSize: 40,
                  color: COLORS.text,
                  minWidth: 60,
                }}
              />
            </View>

            {/* Game Variations */}
            {applicableVariations.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 10 }}>
                  GAME VARIATIONS
                </Text>
                {applicableVariations.map((variation) => {
                  const active = isVariationActive(variation);
                  const tooltipOpen = expandedTooltip === variation.id;
                  const tagColor =
                    variation.tag === "wild"
                      ? COLORS.error
                      : variation.tag === "spicy"
                      ? COLORS.gold
                      : COLORS.primary;
                  return (
                    <View key={variation.id} style={{ marginBottom: 8 }}>
                      <View
                        style={{
                          backgroundColor: active
                            ? COLORS.primary + "15"
                            : COLORS.surfaceMid,
                          borderRadius: RADII.lg,
                          padding: 14,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        {/* Tag indicator */}
                        <View
                          style={{
                            width: 4,
                            height: 36,
                            borderRadius: 2,
                            backgroundColor: tagColor,
                          }}
                        />

                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: active
                                  ? FONTS.bold
                                  : FONTS.semibold,
                                fontSize: 14,
                                color: COLORS.text,
                              }}
                            >
                              {variation.label}
                            </Text>
                            <View
                              style={{
                                backgroundColor: tagColor + "22",
                                borderRadius: RADII.md,
                                paddingHorizontal: 5,
                                paddingVertical: 1,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: FONTS.bold,
                                  fontSize: 9,
                                  color: tagColor,
                                  textTransform: "uppercase",
                                }}
                              >
                                {variation.tag}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={{
                              fontFamily: FONTS.regular,
                              fontSize: 12,
                              color: COLORS.textDim,
                              marginTop: 2,
                            }}
                          >
                            {variation.appliesTo
                              .filter((g) => selectedGames.includes(g))
                              .map(
                                (g) =>
                                  ALL_GAMES.find((ag) => ag.id === g)?.name || g
                              )
                              .join(", ")}
                          </Text>
                        </View>

                        {/* Info tooltip button */}
                        <AnimatedPressable
                          onPress={() =>
                            setExpandedTooltip(
                              tooltipOpen ? null : variation.id
                            )
                          }
                          style={{ padding: 4 }}
                        >
                          <Info
                            size={18}
                            color={
                              tooltipOpen ? COLORS.primary : COLORS.textDim
                            }
                          />
                        </AnimatedPressable>

                        {/* Toggle */}
                        <Switch
                          value={active}
                          onValueChange={() => toggleVariation(variation)}
                          trackColor={{
                            false: COLORS.surfaceHighest,
                            true: COLORS.primary,
                          }}
                          thumbColor={COLORS.text}
                        />
                      </View>

                      {/* Expanded tooltip */}
                      {tooltipOpen && (
                        <View
                          style={{
                            backgroundColor: COLORS.surfaceHigh,
                            borderRadius: RADII.md,
                            padding: 12,
                            marginTop: 4,
                            borderLeftWidth: 3,
                            borderLeftColor: COLORS.primary,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: FONTS.regular,
                              fontSize: 13,
                              color: COLORS.text,
                              lineHeight: 19,
                            }}
                          >
                            {variation.desc}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {applicableVariations.length === 0 && (
              <View
                style={{
                  backgroundColor: COLORS.surfaceMid,
                  borderRadius: RADII.lg,
                  padding: 16,
                  marginBottom: 20,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.regular,
                    fontSize: 13,
                    color: COLORS.textDim,
                    textAlign: "center",
                  }}
                >
                  No variations available for the selected game modes.
                </Text>
              </View>
            )}

            {/* Entry Fee */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textDim }}>
                ENTRY FEE
              </Text>
              <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 18, color: COLORS.text }}>
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
              <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 48, color: COLORS.primary, marginBottom: 8 }}>
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
