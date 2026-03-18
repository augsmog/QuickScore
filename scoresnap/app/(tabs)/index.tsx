import { useState } from "react";
import { View, Text, ScrollView, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, Camera, ChevronRight, X, Lock, Users } from "lucide-react-native";
import { COLORS } from "../../src/ui/theme";
import { useContestStore } from "../../src/stores/contest-store";
import { ALL_GAMES, FREE_GAME_IDS, GameTypeInfo } from "../../src/engine/types";

const CATEGORY_COLORS: Record<string, string> = {
  Classic: COLORS.accent,
  "Money Games": COLORS.gold,
  Strategy: COLORS.purple,
  Pressure: "#ff4757",
  Putting: "#2ed573",
  Points: COLORS.blue,
  Chase: COLORS.warn,
  "Team Money": COLORS.gold,
  Rotating: "#a855f7",
  Match: COLORS.warn,
  Handicap: COLORS.silver,
  "Par 3s": COLORS.accent,
  Bonus: "#ffd700",
  Team: COLORS.blue,
};

export default function HomeScreen() {
  const router = useRouter();
  const contests = useContestStore((s) => s.contests);
  const activeContests = contests.filter((c) => c.status === "active");
  const completedContests = contests.filter((c) => c.status === "completed");
  const [selectedGame, setSelectedGame] = useState<GameTypeInfo | null>(null);

  // Group games by category for compact display
  const categories = [...new Set(ALL_GAMES.map((g) => g.category))];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: "center", marginTop: 16, marginBottom: 20, paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 48, marginBottom: 4 }}>⛳</Text>
          <Text style={{ fontSize: 30, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 }}>
            ScoreSnap
          </Text>
          <Text style={{ color: COLORS.textDim, fontSize: 14, marginTop: 2 }}>
            Scan. Score. Settle.
          </Text>
        </View>

        {/* Scan Card — Hero CTA */}
        <Pressable
          onPress={() => router.push("/scan")}
          style={{
            marginHorizontal: 20,
            marginBottom: 12,
            borderRadius: 20,
            backgroundColor: COLORS.accent + "12",
            borderColor: COLORS.accent + "44",
            borderWidth: 1,
          }}
        >
          <View style={{ paddingVertical: 28, paddingHorizontal: 24, flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.accent,
                alignItems: "center", justifyContent: "center", marginRight: 16,
              }}
            >
              <Camera size={28} color="#000" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 18, marginBottom: 3 }}>
                Scan Scorecard
              </Text>
              <Text style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 18 }}>
                AI-powered OCR reads handwritten & printed scores instantly
              </Text>
            </View>
            <ChevronRight size={20} color={COLORS.accent} />
          </View>
        </Pressable>

        {/* New Contest — Secondary CTA */}
        <Pressable
          onPress={() => router.push("/contest/new")}
          style={{
            marginHorizontal: 20, marginBottom: 20, borderRadius: 16,
            backgroundColor: COLORS.blue + "12", borderColor: COLORS.blue + "33", borderWidth: 1,
            paddingVertical: 16, paddingHorizontal: 20, flexDirection: "row", alignItems: "center",
          }}
        >
          <View
            style={{
              width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.blue,
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}
          >
            <Plus size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 15 }}>New Contest</Text>
            <Text style={{ color: COLORS.textDim, fontSize: 12 }}>Set up players, games & start scoring</Text>
          </View>
          <ChevronRight size={18} color={COLORS.blue} />
        </Pressable>

        {/* Active Contests */}
        {activeContests.length > 0 && (
          <View style={{ marginBottom: 20, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 16 }}>Active Contests</Text>
              <View style={{ backgroundColor: COLORS.warn + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: COLORS.warn, fontSize: 11, fontWeight: "700" }}>{activeContests.length} LIVE</Text>
              </View>
            </View>
            {activeContests.map((contest) => (
              <Pressable
                key={contest.id}
                onPress={() => router.push(`/contest/${contest.id}`)}
                style={{
                  backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
                  borderRadius: 16, padding: 16, marginBottom: 10,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 15 }}>{contest.name}</Text>
                <Text style={{ color: COLORS.textDim, fontSize: 13, marginTop: 4 }}>
                  {contest.course.name} · {contest.groups.reduce((s, g) => s + g.players.length, 0)} players
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Completed Contests */}
        {completedContests.length > 0 && (
          <View style={{ marginBottom: 20, paddingHorizontal: 20 }}>
            <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 16, marginBottom: 10 }}>Recent Results</Text>
            {completedContests.slice(0, 3).map((contest) => (
              <Pressable
                key={contest.id}
                onPress={() => router.push(`/contest/${contest.id}`)}
                style={{
                  backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
                  borderRadius: 16, padding: 16, marginBottom: 10,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 15 }}>{contest.name}</Text>
                <Text style={{ color: COLORS.textDim, fontSize: 13, marginTop: 4 }}>
                  {contest.course.name} · {contest.createdAt.split("T")[0]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Game Modes — Condensed Grid */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 18, marginBottom: 4 }}>
            25+ Game Modes
          </Text>
          <Text style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 16 }}>
            Tap any game to learn how it works
          </Text>

          {categories.map((category) => {
            const games = ALL_GAMES.filter((g) => g.category === category);
            const color = CATEGORY_COLORS[category] || COLORS.textDim;
            return (
              <View key={category} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: color }} />
                  <Text style={{ color, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    {category}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {games.map((game) => {
                    const isFree = FREE_GAME_IDS.includes(game.id);
                    return (
                      <Pressable
                        key={game.id}
                        onPress={() => setSelectedGame(game)}
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 6,
                          backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
                          borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
                        }}
                      >
                        <Text style={{ fontSize: 16 }}>{game.icon}</Text>
                        <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: "500" }}>{game.name}</Text>
                        {!isFree && <Lock size={10} color={COLORS.gold} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Game Info Modal */}
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
                backgroundColor: COLORS.card,
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
                  width: 40, height: 4, borderRadius: 2,
                  backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 20,
                }}
              />

              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <View
                  style={{
                    width: 52, height: 52, borderRadius: 14,
                    backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 28 }}>{selectedGame.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 20 }}>
                      {selectedGame.name}
                    </Text>
                    {!FREE_GAME_IDS.includes(selectedGame.id) && (
                      <View
                        style={{
                          backgroundColor: COLORS.gold + "22", borderRadius: 4,
                          paddingHorizontal: 6, paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: COLORS.gold, fontSize: 9, fontWeight: "800" }}>PRO</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: COLORS.textDim, fontSize: 13, marginTop: 2 }}>
                    {selectedGame.desc}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedGame(null)} style={{ padding: 4 }}>
                  <X size={20} color={COLORS.textDim} />
                </Pressable>
              </View>

              {/* Player Count Badge */}
              <View
                style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, marginBottom: 16,
                }}
              >
                <Users size={18} color={COLORS.accent} />
                <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 14 }}>
                  {selectedGame.minPlayers === selectedGame.maxPlayers
                    ? `${selectedGame.minPlayers} players`
                    : `${selectedGame.minPlayers}–${selectedGame.maxPlayers} players`}
                </Text>
                <View
                  style={{
                    marginLeft: "auto",
                    backgroundColor:
                      CATEGORY_COLORS[selectedGame.category] + "22",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text
                    style={{
                      color: CATEGORY_COLORS[selectedGame.category] || COLORS.textDim,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {selectedGame.category}
                  </Text>
                </View>
              </View>

              {/* Rules */}
              <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                <Text style={{ color: COLORS.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                  How to Play
                </Text>
                <Text style={{ color: COLORS.text, fontSize: 14, lineHeight: 22 }}>
                  {selectedGame.rules}
                </Text>
              </ScrollView>

              {/* Add to Contest CTA */}
              <Pressable
                onPress={() => {
                  setSelectedGame(null);
                  router.push("/contest/new");
                }}
                style={{
                  backgroundColor: COLORS.accent, borderRadius: 14,
                  paddingVertical: 14, alignItems: "center", marginTop: 20,
                }}
              >
                <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                  Play {selectedGame.name}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
