import { SheetSurface, FullScreenSheet, SafeScreen } from "../../src/ui/SafeScreen";
import { GAME_MODE_LIBRARY } from "../../src/engine/game-mode-library";
import { useScanStore } from "../../src/stores/scan-store";
import { canUseGame, defaultRoundGames } from "../../src/services/entitlements";
import { GAME_SHEET_STYLE } from "../../src/ui/gameSheetStyle";
import { CROSS_DEVICE_SHARING_ENABLED } from "../../src/config/features";
import { localDate } from "../../src/utils/local-date";
import { REAL_AUTH_CONFIGURED } from "../../src/config/auth";
import { useAuthStore } from "../../src/stores/auth-store";
import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, FlatList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Camera, ChevronRight, X, Users, Plus, Hash } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, FONTS, TYPOGRAPHY, RADII } from "../../src/ui/theme";
import {
  useContestStore,
  generateId,
  defaultCourse,
  createSampleContest,
} from "../../src/stores/contest-store";
import { ALL_GAMES, FREE_GAME_IDS, isGameImplemented, GameTypeInfo } from "../../src/engine/types";
import { AnimatedPressable } from "../../src/ui/AnimatedPressable";
import type { Contest, ContestGroup } from "../../src/stores/contest-store";
import { useOnboardingStore } from "../../src/stores/onboarding-store";

export default function HomeScreen() {
  const router = useRouter();
  const tier = useScanStore(s => s.tier);
  const storedContests = useContestStore((s) => s.contests);
  const demoMode = process.env.EXPO_PUBLIC_DEMO_MODE === "true";
  // Also hide demo rounds persisted before the explicit isDemo flag existed.
  const contests = storedContests.filter((c) => demoMode || !(c.isDemo || (
    c.name === "Sample Round" && c.course.name === "Pine Valley GC" &&
    c.groups.flatMap((g) => g.players).map((p) => p.name).join(",") === "Mike T.,Dave R.,Chris L.,Jake P."
  )));
  const addContest = useContestStore((s) => s.addContest);
  const deleteContest = useContestStore((s) => s.deleteContest);
  const activeContests = contests.filter((c) => c.status === "active");
  const completedContests = contests.filter((c) => c.status === "completed");
  const [showGameLibrary, setShowGameLibrary] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameTypeInfo | null>(null);
  const hasSeenDemo = useOnboardingStore((s) => s.hasSeenDemo);
  const markDemoSeen = useOnboardingStore((s) => s.markDemoSeen);

  const handleDeleteContest = (contest: Contest) => {
    Alert.alert(
      "Delete Contest",
      `Are you sure you want to delete "${contest.name || contest.course.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteContest(contest.id),
        },
      ]
    );
  };

  useEffect(() => {
    if (demoMode && !hasSeenDemo) {
      addContest(createSampleContest());
      markDemoSeen();
    }
  }, [demoMode, hasSeenDemo, addContest, markDemoSeen]);

  const handleQuickStart = () => {
    if (REAL_AUTH_CONFIGURED && (useAuthStore.getState().isAnonymous || !useAuthStore.getState().session)) { router.push("/auth/sign-in"); return; }
    const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const course = defaultCourse("Quick Round");
    const players = [
      { id: generateId(), name: "Player 1", handicap: 15, team: null, scores: new Array(18).fill(0) },
      { id: generateId(), name: "Player 2", handicap: 18, team: null, scores: new Array(18).fill(0) },
      { id: generateId(), name: "Player 3", handicap: 12, team: null, scores: new Array(18).fill(0) },
      { id: generateId(), name: "Player 4", handicap: 20, team: null, scores: new Array(18).fill(0) },
    ];
    const group: ContestGroup = {
      id: generateId(),
      name: "Group 1",
      players,
    };
    const contest: Contest = {
      id: generateId(),
      name: `${dayName} Quick Round`,
      course,
      status: "active",
      betUnit: 5,
      hasTeams: false,
      groups: [group],
      games: defaultRoundGames(tier),
      createdAt: new Date().toISOString(),
    };
    addContest(contest);
    router.push(`/contest/${contest.id}`);
  };

  // Flatten all game names for horizontal scroll
  const allGameNames = ALL_GAMES.map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

  return (
    <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <ScrollView
        testID="home-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Wordmark ── */}
        <View style={{ alignItems: "center", marginTop: 18, marginBottom: 28 }}>
          <Text
            style={{
              fontFamily: FONTS.headline,
              fontSize: 14,
              color: COLORS.text,
              textTransform: "uppercase",
              letterSpacing: 3,
            }}
          >
            SNAPSCORE
          </Text>
        </View>

        {/* ── Hero Section ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text
            style={{
              fontFamily: FONTS.headline,
              fontSize: 28,
              color: COLORS.text,
              marginBottom: 8,
              lineHeight: 34,
            }}
          >
            Build contests. Settle up.
          </Text>
          <Text
            style={{
              fontFamily: FONTS.regular,
              fontSize: 14,
              color: COLORS.textDim,
              lineHeight: 20,
              marginBottom: 20,
            }}
          >
            Add your group, pick your games, and see who owes what. Scan a card if you've got one.
          </Text>

          {/* CTA Buttons Row */}
          <View style={{ gap: 12 }}>
            {/* New Contest — gradient primary */}
            <AnimatedPressable
              testID="home-new-contest"
              accessibilityRole="button"
              accessibilityLabel="New Contest"
              onPress={() => router.push("/contest/new")}
              style={{ minHeight: 52, borderRadius: RADII.full, overflow: "hidden" }}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryContainer]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  minHeight: 52,
                  borderRadius: RADII.full,
                  paddingVertical: 15,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Plus size={18} color={COLORS.onPrimary} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{
                    flexShrink: 1,
                    fontFamily: FONTS.semibold,
                    fontSize: 13,
                    color: COLORS.onPrimary,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  New Contest
                </Text>
              </LinearGradient>
            </AnimatedPressable>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <AnimatedPressable
                testID="home-scan"
                accessibilityRole="button"
                accessibilityLabel="Scan Scorecard"
                onPress={() => router.push("/scan")}
                style={{
                  flex: 1,
                  minHeight: 52,
                  borderRadius: RADII.full,
                  borderWidth: 1,
                  borderColor: COLORS.accentGlow,
                  paddingVertical: 15,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: "transparent",
                }}
              >
                <Camera size={18} color={COLORS.primary} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{
                    flexShrink: 1,
                    fontFamily: FONTS.semibold,
                    fontSize: 13,
                    color: COLORS.primary,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  Scan Scorecard
                </Text>
              </AnimatedPressable>
              {CROSS_DEVICE_SHARING_ENABLED && (
                <AnimatedPressable
                  testID="home-join-code"
                  accessibilityRole="button"
                  accessibilityLabel="Join with code"
                  onPress={() => router.push("/join/enter")}
                  style={{
                    flex: 1,
                    minHeight: 52,
                    borderRadius: RADII.full,
                    borderWidth: 1,
                    borderColor: COLORS.accentGlow,
                    paddingVertical: 15,
                    paddingHorizontal: 12,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    backgroundColor: "transparent",
                  }}
                >
                  <Hash size={18} color={COLORS.primary} />
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    style={{
                      flexShrink: 1,
                      fontFamily: FONTS.semibold,
                      fontSize: 13,
                      color: COLORS.primary,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                    }}
                  >
                    Join with code
                  </Text>
                </AnimatedPressable>
              )}
            </View>
          </View>
        </View>

        {/* ── Your Active Games ── */}
        {activeContests.length > 0 && (
          <View style={{ marginBottom: 28, paddingHorizontal: 20 }}>
            <Text
              style={{
                ...TYPOGRAPHY.label,
                color: COLORS.textDim,
                marginBottom: 12,
              }}
            >
              YOUR ACTIVE GAMES
            </Text>

            {activeContests.map((contest) => {
              const playerCount = contest.groups.reduce(
                (s, g) => s + g.players.length,
                0
              );
              const gameNames = ALL_GAMES.filter((g) =>
                contest.games.includes(g.id)
              ).map((g) => g.name);

              return (
                <AnimatedPressable
                  key={contest.id}
                  onPress={() => router.push(`/contest/${contest.id}`)}
                  onLongPress={() => handleDeleteContest(contest)}
                  style={{
                    backgroundColor: COLORS.surfaceHigh,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 10,
                  }}
                >
                  {/* Course name */}
                  <Text
                    style={{
                      fontFamily: FONTS.bold,
                      fontSize: 15,
                      color: COLORS.text,
                      marginBottom: 8,
                    }}
                  >
                    {contest.course.name}
                  </Text>

                  {/* Game mode chips */}
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 10,
                    }}
                  >
                    {gameNames.slice(0, 4).map((name) => (
                      <View
                        key={name}
                        style={{
                          backgroundColor: COLORS.secondaryContainer,
                          borderRadius: RADII.full,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FONTS.medium,
                            fontSize: 11,
                            color: COLORS.secondary,
                          }}
                        >
                          {name}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Meta row */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.medium,
                        fontSize: 12,
                        color: COLORS.textDim,
                      }}
                    >
                      {playerCount} players
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONTS.medium,
                        fontSize: 12,
                        color: COLORS.textDim,
                      }}
                    >
                      ${contest.betUnit}/unit
                    </Text>
                  </View>

                  {/* Green progress bar */}
                  <View
                    style={{
                      height: 3,
                      borderRadius: 2,
                      backgroundColor: COLORS.surfaceHighest,
                    }}
                  >
                    <View
                      style={{
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: COLORS.primary,
                        width: "35%",
                      }}
                    />
                  </View>
                </AnimatedPressable>
              );
            })}
          </View>
        )}

        {/* ── Game Modes ── */}
        <View style={{ marginBottom: 28 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                ...TYPOGRAPHY.label,
                color: COLORS.textDim,
              }}
            >
              GAME MODES
            </Text>
            <Pressable
              onPress={() => setShowGameLibrary(true)}
              accessibilityRole="button"
              accessibilityLabel="See all game modes"
              testID="home-see-all-modes"
              style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }}
            >
              <Text
                style={{
                  fontFamily: FONTS.semibold,
                  fontSize: 12,
                  color: COLORS.primary,
                }}
              >
                See All
              </Text>
            </Pressable>
          </View>

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            data={allGameNames}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const implemented = isGameImplemented(item.id);
              return (
                <Pressable
                  onPress={() => {
                    const game = ALL_GAMES.find((g) => g.id === item.id);
                    if (game) setSelectedGame(game);
                  }}
                  style={{
                    backgroundColor: COLORS.secondaryContainer,
                    borderRadius: RADII.full,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: implemented ? 1 : 0.55,
                  }}
                >
                  {/* icon removed */}
                  <Text
                    style={{
                      fontFamily: FONTS.medium,
                      fontSize: 12,
                      color: COLORS.secondary,
                    }}
                  >
                    {item.name}
                  </Text>
                  {!implemented && (
                    <Text
                      style={{
                        fontFamily: FONTS.bold,
                        fontSize: 8,
                        color: COLORS.textDim,
                        textTransform: "uppercase",
                      }}
                    >
                      Soon
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        </View>

        {/* ── Recent Rounds ── */}
        {completedContests.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
            <Text
              style={{
                ...TYPOGRAPHY.label,
                color: COLORS.textDim,
                marginBottom: 12,
              }}
            >
              RECENT ROUNDS
            </Text>

            {completedContests.slice(0, 3).map((contest) => {
              const playerCount = contest.groups.reduce(
                (s, g) => s + g.players.length,
                0
              );
              return (
                <AnimatedPressable
                  key={contest.id}
                  onPress={() => router.push(`/contest/${contest.id}`)}
                  onLongPress={() => handleDeleteContest(contest)}
                  style={{
                    backgroundColor: COLORS.surfaceLow,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: FONTS.bold,
                        fontSize: 14,
                        color: COLORS.text,
                        marginBottom: 3,
                      }}
                    >
                      {contest.course.name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONTS.regular,
                        fontSize: 12,
                        color: COLORS.textDim,
                      }}
                    >
                      {localDate(contest.createdAt)} · {playerCount} players
                    </Text>
                  </View>
                  <ChevronRight size={16} color={COLORS.textDim} />
                </AnimatedPressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <FullScreenSheet visible={showGameLibrary} animationType="slide" onRequestClose={() => setShowGameLibrary(false)}>
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <View style={{ paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text accessibilityRole="header" style={{ fontFamily: FONTS.semibold, fontSize: 24, color: COLORS.text }}>50+ game modes</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close game mode library" onPress={() => setShowGameLibrary(false)} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <X size={24} color={COLORS.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
            {GAME_MODE_LIBRARY.map(mode => {
              const content = <>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.text }}>{mode.name}</Text>
                <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textDim, marginTop: 6 }}>{mode.desc}</Text>
              </>;
              const style = { padding: 16, borderRadius: 12, backgroundColor: COLORS.secondaryContainer, minHeight: 44 };
              return mode.game ? (
                <Pressable key={mode.id} testID={`game-mode-row-${mode.id}`} accessibilityRole="button" accessibilityLabel={mode.name} style={style} onPress={() => {
                  setShowGameLibrary(false);
                  setSelectedGame(mode.game!);
                }}>{content}</Pressable>
              ) : <View key={mode.id} testID={`game-mode-row-${mode.id}`} style={style}>{content}</View>;
            })}
          </ScrollView>
        </View>
      </FullScreenSheet>

      {/* ── Game Info Modal ── */}
      <FullScreenSheet
        visible={selectedGame !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedGame(null)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            testID="game-info-scrim"
            style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: COLORS.sheetScrim }}
            onPress={() => setSelectedGame(null)}
          />
          {selectedGame && (
            <SheetSurface
              testID="game-info-sheet"
              style={[GAME_SHEET_STYLE, {
                paddingHorizontal: 24,
                paddingTop: 20,
                paddingBottom: 40,
                maxHeight: "75%",
              }]}
            >
              {/* Handle bar */}
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: COLORS.surfaceHighest,
                  alignSelf: "center",
                  marginBottom: 20,
                }}
              />

              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.headline,
                        fontSize: 20,
                        color: COLORS.text,
                      }}
                    >
                      {selectedGame.name}
                    </Text>
                    {!isGameImplemented(selectedGame.id) ? (
                      <View
                        style={{
                          backgroundColor: COLORS.secondary + "22",
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FONTS.bold,
                            color: COLORS.secondary,
                            fontSize: 9,
                          }}
                        >
                          COMING SOON
                        </Text>
                      </View>
                    ) : !FREE_GAME_IDS.includes(selectedGame.id) ? (
                      <View
                        style={{
                          backgroundColor: COLORS.gold + "22",
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FONTS.bold,
                            color: COLORS.gold,
                            fontSize: 9,
                          }}
                        >
                          PRO
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      fontFamily: FONTS.regular,
                      color: COLORS.textDim,
                      fontSize: 13,
                      marginTop: 2,
                    }}
                  >
                    {selectedGame.desc}
                  </Text>
                </View>
                <Pressable
                  testID="game-info-close"
                  onPress={() => setSelectedGame(null)}
                  style={{ padding: 4 }}
                >
                  <X size={20} color={COLORS.textDim} />
                </Pressable>
              </View>

              {/* Player Count Badge */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: COLORS.bg,
                  borderRadius: RADII.md,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Users size={18} color={COLORS.primary} />
                <Text
                  style={{
                    fontFamily: FONTS.semibold,
                    color: COLORS.text,
                    fontSize: 14,
                  }}
                >
                  {selectedGame.minPlayers === selectedGame.maxPlayers
                    ? `${selectedGame.minPlayers} players`
                    : `${selectedGame.minPlayers}--${selectedGame.maxPlayers} players`}
                </Text>
                <View
                  style={{
                    marginLeft: "auto",
                    backgroundColor: COLORS.secondaryContainer,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.bold,
                      color: COLORS.secondary,
                      fontSize: 11,
                    }}
                  >
                    {selectedGame.category}
                  </Text>
                </View>
              </View>

              {/* Rules */}
              <ScrollView
                style={{ maxHeight: 200 }}
                showsVerticalScrollIndicator={false}
              >
                <Text
                  style={{
                    ...TYPOGRAPHY.label,
                    color: COLORS.textDim,
                    marginBottom: 6,
                  }}
                >
                  How to Play
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.regular,
                    color: COLORS.text,
                    fontSize: 14,
                    lineHeight: 22,
                  }}
                >
                  {selectedGame.rules}
                </Text>
              </ScrollView>

              {/* Add to Contest CTA */}
              {isGameImplemented(selectedGame.id) ? (
                <AnimatedPressable
                  onPress={() => {
                    setSelectedGame(null);
                    if (!canUseGame(selectedGame.id, tier)) { router.push("/paywall"); return; }
                    router.push("/contest/new");
                  }}
                  style={{
                    borderRadius: 14,
                    overflow: "hidden",
                    marginTop: 20,
                  }}
                >
                  <LinearGradient
                    colors={[COLORS.primary, COLORS.primaryContainer]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.semibold,
                        color: COLORS.onPrimary,
                        fontSize: 15,
                      }}
                    >
                      {!canUseGame(selectedGame.id, tier) ? "Try Pro with" : "Play"} {selectedGame.name}
                    </Text>
                  </LinearGradient>
                </AnimatedPressable>
              ) : (
                <View
                  style={{
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginTop: 20,
                    backgroundColor: COLORS.surfaceHighest,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FONTS.semibold,
                      color: COLORS.textDim,
                      fontSize: 15,
                    }}
                  >
                    Coming Soon
                  </Text>
                </View>
              )}
            </SheetSurface>
          )}
        </View>
      </FullScreenSheet>
    </SafeScreen>
  );
}
