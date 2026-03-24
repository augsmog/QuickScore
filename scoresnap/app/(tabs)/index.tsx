import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Modal, FlatList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, ChevronRight, X, Lock, Users, Plus } from "lucide-react-native";
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
  const contests = useContestStore((s) => s.contests);
  const addContest = useContestStore((s) => s.addContest);
  const deleteContest = useContestStore((s) => s.deleteContest);
  const activeContests = contests.filter((c) => c.status === "active");
  const completedContests = contests.filter((c) => c.status === "completed");
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
    if (!hasSeenDemo) {
      addContest(createSampleContest());
      markDemoSeen();
    }
  }, []);

  const handleQuickStart = () => {
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
      games: ["stroke_play", "skins"],
      createdAt: new Date().toISOString(),
    };
    addContest(contest);
    router.push(`/contest/${contest.id}`);
  };

  // Flatten all game names for horizontal scroll
  const allGameNames = ALL_GAMES.map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <ScrollView
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
            SCORESNAP
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
            Precision Scoring{"\n"}in a Snap
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
            Scan any physical scorecard and let AI read every stroke. Then settle bets across 8 game modes with more coming soon.
          </Text>

          {/* CTA Buttons Row */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            {/* Scan Scorecard — gradient primary */}
            <AnimatedPressable
              onPress={() => router.push("/scan")}
              style={{ flex: 1, borderRadius: RADII.xl, overflow: "hidden" }}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryContainer]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: RADII.xl,
                  paddingVertical: 15,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Camera size={18} color={COLORS.onPrimary} />
                <Text
                  style={{
                    fontFamily: FONTS.headline,
                    fontSize: 13,
                    color: COLORS.onPrimary,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  Scan Scorecard
                </Text>
              </LinearGradient>
            </AnimatedPressable>

            {/* New Contest — ghost button */}
            <AnimatedPressable
              onPress={() => router.push("/contest/new")}
              style={{
                flex: 1,
                borderRadius: RADII.xl,
                borderWidth: 1,
                borderColor: "rgba(91,243,147,0.25)",
                paddingVertical: 15,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                backgroundColor: "transparent",
              }}
            >
              <Plus size={18} color={COLORS.primary} />
              <Text
                style={{
                  fontFamily: FONTS.headline,
                  fontSize: 13,
                  color: COLORS.primary,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                New Contest
              </Text>
            </AnimatedPressable>
          </View>
        </View>

        {/* ── Your Active Bets ── */}
        {activeContests.length > 0 && (
          <View style={{ marginBottom: 28, paddingHorizontal: 20 }}>
            <Text
              style={{
                ...TYPOGRAPHY.label,
                color: COLORS.textDim,
                marginBottom: 12,
              }}
            >
              YOUR ACTIVE BETS
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
                      backgroundColor: "rgba(91,243,147,0.12)",
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
            <Pressable onPress={() => setSelectedGame(ALL_GAMES[0])}>
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
                  <Text style={{ fontSize: 14 }}>{item.icon}</Text>
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
                      {contest.createdAt.split("T")[0]} · {playerCount} players
                    </Text>
                  </View>
                  <ChevronRight size={16} color={COLORS.textDim} />
                </AnimatedPressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Game Info Modal ── */}
      <Modal
        visible={selectedGame !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedGame(null)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setSelectedGame(null)}
          />
          {selectedGame && (
            <View
              style={{
                backgroundColor: COLORS.surfaceMid,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingHorizontal: 24,
                paddingTop: 20,
                paddingBottom: 40,
                maxHeight: "75%",
              }}
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
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    backgroundColor: COLORS.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 28 }}>{selectedGame.icon}</Text>
                </View>
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
                        fontFamily: FONTS.headline,
                        color: COLORS.onPrimary,
                        fontSize: 15,
                      }}
                    >
                      Play {selectedGame.name}
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
                      fontFamily: FONTS.headline,
                      color: COLORS.textDim,
                      fontSize: 15,
                    }}
                  >
                    Coming Soon
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
