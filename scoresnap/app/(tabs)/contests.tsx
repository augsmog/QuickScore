import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, Trophy } from "lucide-react-native";
import { COLORS } from "../../src/ui/theme";
import { useContestStore } from "../../src/stores/contest-store";
import { AnimatedPressable } from "../../src/ui/AnimatedPressable";

export default function ContestsScreen() {
  const router = useRouter();
  const contests = useContestStore((s) => s.contests);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="px-5 pt-4 pb-3 flex-row justify-between items-center">
        <Text className="text-text-primary text-2xl font-extrabold">
          Contests
        </Text>
        <AnimatedPressable
          onPress={() => router.push("/contest/new")}
          className="rounded-xl px-4 py-2 flex-row items-center gap-1.5"
          style={{ backgroundColor: COLORS.accent }}
        >
          <Plus size={16} color="#000" />
          <Text className="font-bold text-sm" style={{ color: "#000" }}>
            New
          </Text>
        </AnimatedPressable>
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {contests.length === 0 ? (
          <View className="items-center py-16">
            <Trophy size={48} color={COLORS.textDim} />
            <Text className="text-text-dim text-base mt-4 font-semibold">
              No contests yet
            </Text>
            <Text className="text-text-dim text-sm text-center px-8 mt-2">
              Tap "New" to create your first scoring contest.
            </Text>
          </View>
        ) : (
          contests
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
            .map((contest) => {
              const playerCount = contest.groups.reduce(
                (s, g) => s + g.players.length,
                0
              );
              return (
                <AnimatedPressable
                  key={contest.id}
                  onPress={() => router.push(`/contest/${contest.id}`)}
                  className="rounded-2xl p-4 mb-3"
                  style={{
                    backgroundColor: COLORS.card,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                  }}
                >
                  <View className="flex-row justify-between items-start mb-1">
                    <Text className="text-text-primary font-bold text-base flex-1 mr-2">
                      {contest.name}
                    </Text>
                    <View
                      className="rounded-md px-2 py-0.5"
                      style={{
                        backgroundColor:
                          contest.status === "active"
                            ? COLORS.warn
                            : COLORS.accent,
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: "#000" }}
                      >
                        {contest.status === "active" ? "LIVE" : "FINAL"}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-text-dim text-sm mb-2">
                    {contest.course.name}
                  </Text>
                  <View className="flex-row gap-4">
                    <Text className="text-text-dim text-xs">
                      👥 {playerCount} Players
                    </Text>
                    <Text className="text-text-dim text-xs">
                      🏌️ {contest.groups.length} Groups
                    </Text>
                    <Text className="text-text-dim text-xs">
                      🎮 {contest.games.length} Games
                    </Text>
                  </View>
                  {contest.hasTeams && contest.teamAName && contest.teamBName && (
                    <View className="flex-row items-center gap-2 mt-2">
                      <View
                        className="rounded-md px-2 py-0.5"
                        style={{
                          backgroundColor: COLORS.accent + "22",
                          borderColor: COLORS.accent + "44",
                          borderWidth: 1,
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: COLORS.accent }}
                        >
                          {contest.teamAName}
                        </Text>
                      </View>
                      <Text className="text-text-dim text-xs">vs</Text>
                      <View
                        className="rounded-md px-2 py-0.5"
                        style={{
                          backgroundColor: COLORS.blue + "22",
                          borderColor: COLORS.blue + "44",
                          borderWidth: 1,
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: COLORS.blue }}
                        >
                          {contest.teamBName}
                        </Text>
                      </View>
                    </View>
                  )}
                </AnimatedPressable>
              );
            })
        )}
        <View className="h-4" />
      </ScrollView>
    </SafeAreaView>
  );
}
