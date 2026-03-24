import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Trophy, Zap } from "lucide-react-native";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW } from "../../src/ui/theme";
import { useContestStore } from "../../src/stores/contest-store";
import { AnimatedPressable } from "../../src/ui/AnimatedPressable";
import { ALL_GAMES } from "../../src/engine/types";

export default function ContestsScreen() {
  const router = useRouter();
  const contests = useContestStore((s) => s.contests);

  const sorted = [...contests].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const activeContests = sorted.filter((c) => c.status === "active");
  const completedContests = sorted.filter((c) => c.status === "completed");
  const featured = activeContests[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: FONTS.headline, fontSize: 28, color: COLORS.text, letterSpacing: -0.5 }}>
          CONTESTS
        </Text>
        <AnimatedPressable
          onPress={() => router.push("/contest/new")}
          style={{
            backgroundColor: COLORS.primary + "1A",
            borderRadius: RADII.lg,
            paddingHorizontal: 14,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Zap size={14} color={COLORS.primary} />
          <Text style={{ fontFamily: FONTS.bold, fontSize: 13, color: COLORS.primary }}>
            Live Contest
          </Text>
        </AnimatedPressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        {contests.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 64 }}>
            <Trophy size={48} color={COLORS.textDim} />
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.textDim, marginTop: 16 }}>
              No contests yet
            </Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textDim, textAlign: "center", paddingHorizontal: 32, marginTop: 8 }}>
              Tap "Live Contest" to create your first scoring contest.
            </Text>
          </View>
        ) : (
          <>
            {/* Featured Active Contest */}
            {featured && (
              <AnimatedPressable
                onPress={() => router.push(`/contest/${featured.id}`)}
                style={{
                  backgroundColor: COLORS.surfaceHigh,
                  borderRadius: RADII.xl,
                  padding: 20,
                  marginBottom: 16,
                  ...GLOW.primary,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <View style={{ backgroundColor: COLORS.primary + "22", borderRadius: RADII.md, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.primary, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      LIVE
                    </Text>
                  </View>
                </View>
                <Text style={{ fontFamily: FONTS.headline, fontSize: 22, color: COLORS.text, marginBottom: 4 }}>
                  {featured.name}
                </Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textDim, marginBottom: 16 }}>
                  {featured.course.name}
                </Text>
                <AnimatedPressable
                  onPress={() => router.push(`/contest/${featured.id}`)}
                  style={{
                    backgroundColor: COLORS.primary,
                    borderRadius: RADII.md,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: FONTS.bold, fontSize: 14, color: COLORS.onPrimary }}>
                    VIEW LEADERBOARD
                  </Text>
                </AnimatedPressable>
              </AnimatedPressable>
            )}

            {/* Active Contests (excluding featured) */}
            {activeContests.length > 1 && (
              <>
                <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 10, marginTop: 4 }}>
                  ACTIVE CONTESTS
                </Text>
                {activeContests.slice(1).map((contest) => {
                  const playerCount = contest.groups.reduce(
                    (s, g) => s + g.players.length,
                    0
                  );
                  const holesPlayed = Math.max(
                    ...contest.groups.flatMap((g) =>
                      g.players.map((p) => p.scores.filter((s) => s > 0).length)
                    ),
                    0
                  );
                  return (
                    <AnimatedPressable
                      key={contest.id}
                      onPress={() => router.push(`/contest/${contest.id}`)}
                      style={{
                        backgroundColor: COLORS.surfaceMid,
                        borderRadius: RADII.lg,
                        padding: 16,
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: COLORS.text }}>
                            {contest.name}
                          </Text>
                          <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim, marginTop: 2 }}>
                            {contest.course.name}
                          </Text>
                        </View>
                        {contest.betUnit > 0 && (
                          <View style={{ backgroundColor: COLORS.primaryContainer + "22", borderRadius: RADII.md, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: COLORS.primaryContainer }}>
                              ${contest.betUnit}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Game chips */}
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {contest.games.map((gameId) => {
                          const game = ALL_GAMES.find((g) => g.id === gameId);
                          return (
                            <View
                              key={gameId}
                              style={{
                                backgroundColor: COLORS.secondaryContainer,
                                borderRadius: RADII.md,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                              }}
                            >
                              <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: COLORS.text }}>
                                {game?.icon} {game?.name}
                              </Text>
                            </View>
                          );
                        })}
                      </View>

                      {/* Stats row */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                        <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textDim }}>
                          {playerCount} players
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <View style={{ height: 4, width: 40, borderRadius: 2, backgroundColor: COLORS.surfaceHighest }}>
                            <View style={{ height: 4, width: 40 * (holesPlayed / 18), borderRadius: 2, backgroundColor: COLORS.primary }} />
                          </View>
                          <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textDim }}>
                            {holesPlayed}/18
                          </Text>
                        </View>
                      </View>

                      {/* Teams */}
                      {contest.hasTeams && contest.teamAName && contest.teamBName && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                          <View style={{ backgroundColor: COLORS.primary + "22", borderRadius: RADII.md, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: COLORS.primary }}>
                              {contest.teamAName}
                            </Text>
                          </View>
                          <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textDim }}>
                            vs
                          </Text>
                          <View style={{ backgroundColor: COLORS.secondary + "22", borderRadius: RADII.md, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontFamily: FONTS.bold, fontSize: 11, color: COLORS.secondary }}>
                              {contest.teamBName}
                            </Text>
                          </View>
                        </View>
                      )}
                    </AnimatedPressable>
                  );
                })}
              </>
            )}

            {/* Completed Contests */}
            {completedContests.length > 0 && (
              <>
                <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginBottom: 10, marginTop: 16 }}>
                  COMPLETED
                </Text>
                {completedContests.map((contest) => {
                  const playerCount = contest.groups.reduce(
                    (s, g) => s + g.players.length,
                    0
                  );
                  return (
                    <AnimatedPressable
                      key={contest.id}
                      onPress={() => router.push(`/contest/${contest.id}`)}
                      style={{
                        backgroundColor: COLORS.surfaceLow,
                        borderRadius: RADII.md,
                        padding: 14,
                        marginBottom: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
                          {contest.name}
                        </Text>
                        <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                          {contest.course.name} {"\u00B7"} {playerCount} players
                        </Text>
                      </View>
                      <View style={{ backgroundColor: COLORS.surfaceHighest, borderRadius: RADII.md, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          FINAL
                        </Text>
                      </View>
                    </AnimatedPressable>
                  );
                })}
              </>
            )}
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
