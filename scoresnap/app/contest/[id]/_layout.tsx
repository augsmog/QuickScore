import { SafeScreen } from "../../../src/ui/SafeScreen";
import { RoundStatusSheet } from "../../../src/ui/RoundStatusSheet";
import { ContestJoinCode } from "../../../src/ui/ContestJoinCode";
import { isCompactViewport } from "../../../src/ui/compact-viewport";
import { useState, useCallback } from "react";
import { Dimensions, View, Text, Pressable } from "react-native";
import { Slot, useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Camera, Edit3, Calendar } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, RADII } from "../../../src/ui/theme";
import { useContestStore } from "../../../src/stores/contest-store";
import { AnimatedPressable } from "../../../src/ui/AnimatedPressable";
import { contestChildHref } from "../../../src/ui/contest-back";

const TABS = [
  { key: "scorecard", label: "Scorecard" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "games", label: "Games" },
  { key: "settlement", label: "Settlement" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ContestLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const contest = useContestStore((s) =>
    s.contests.find((c) => c.id === id)
  );
  const [statusOpen, setStatusOpen] = useState(false);
  const closeStatus = useCallback(() => setStatusOpen(false), []);
  const route = pathname.replace(/\/$/, "").split("/").slice(3).join("/");
  const activeTab: TabKey = TABS.find((tab) => tab.key === route)?.key ?? "scorecard";
  const isTabRoute = route === "" || TABS.some((tab) => tab.key === route);

  const handleTabPress = useCallback(
    (tabKey: TabKey) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (tabKey === activeTab) return;
      router.replace(`/contest/${id}/${tabKey}` as any);
    },
    [activeTab, id, router]
  );

  if (!contest) {
    return (
      <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
            Contest Not Found
          </Text>
          <Text style={{ color: COLORS.textDim, fontSize: 14, textAlign: "center", marginBottom: 20 }}>
            This contest may have been deleted or doesn't exist.
          </Text>
          <AnimatedPressable
            onPress={() => router.canGoBack() ? router.back() : router.replace("/")}
            style={{
              backgroundColor: COLORS.accent,
              borderRadius: RADII.md,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ color: COLORS.onPrimary, fontWeight: "700", fontSize: 15 }}>Go Back</Text>
          </AnimatedPressable>
        </View>
      </SafeScreen>
    );
  }

  const allPlayers = contest.groups.flatMap((g) => g.players);
  const compactViewport = isCompactViewport(Dimensions.get("window"));

  return (
    // One stable tree for every child route: the Slot navigator must stay mounted so Expo Router
    // keeps real history for tab routes (otherwise Back after reload+push falls to the default route).
    // Nested screens (edit, tournament-rounds) own their header, so chrome renders only on tab routes.
    <SafeScreen testID={isTabRoute ? "contest-screen" : undefined} style={{ flex: 1, backgroundColor: COLORS.bg }} edges={isTabRoute ? ["top", "bottom"] : []}>
      {/* Header */}
      {isTabRoute ? <View testID="contest-header" style={{ paddingHorizontal: 20, paddingTop: compactViewport ? 4 : 8, paddingBottom: compactViewport ? 4 : 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: compactViewport ? 6 : 12 }}>
          <AnimatedPressable
            onPress={() => router.back()}
            style={{
              borderRadius: RADII.sm,
              padding: 8,
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: COLORS.card,
              borderColor: COLORS.border,
              borderWidth: 1,
            }}
          >
            <ChevronLeft size={20} color={COLORS.textDim} />
          </AnimatedPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontFamily: FONTS.headline, fontSize: 18 }}>
              {contest.name}
            </Text>
            <Text style={{ color: COLORS.textDim, fontFamily: FONTS.regular, fontSize: 13 }}>
              {contest.course.name} · {allPlayers.length} players
              {contest.isTournament && contest.rounds && ` · Round ${contest.currentRound || 1}`}
            </Text>
          </View>
          {contest.status === "active" && contest.isTournament && (
            <AnimatedPressable
              testID="round-tournament-rounds"
              onPress={() => router.push(contestChildHref(id, "tournament-rounds", activeTab) as any)}
              style={{
                borderRadius: RADII.sm,
                padding: 8,
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <Calendar size={16} color={COLORS.textDim} />
            </AnimatedPressable>
          )}
          {contest.status === "active" && (
            <AnimatedPressable
              testID="round-edit"
              onPress={() => router.push(contestChildHref(id, "edit", activeTab) as any)}
              style={{
                borderRadius: RADII.sm,
                padding: 8,
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                borderWidth: 1,
              }}
            >
              <Edit3 size={16} color={COLORS.textDim} />
            </AnimatedPressable>
          )}
          <AnimatedPressable
            onPress={() => router.push(`/scan?contestId=${id}`)}
            style={{
              borderRadius: RADII.sm,
              padding: 8,
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: COLORS.accentGlow,
              borderColor: COLORS.accent + "44",
              borderWidth: 1,
            }}
          >
            <Camera size={18} color={COLORS.accent} />
          </AnimatedPressable>
        </View>

        <Pressable
          testID="round-status-chip"
          accessibilityRole="button"
          accessibilityLabel={contest.status === "completed" ? "Share and sync" : "Round status"}
          onPress={() => setStatusOpen(true)}
          style={{ minHeight: 44, borderRadius: RADII.full, backgroundColor: COLORS.surfaceLow,
            flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8,
            paddingHorizontal: 12, marginBottom: 12 }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary }} />
          <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
            {contest.status === "completed" ? "Share and sync" : "Round status"}
          </Text>
          <ChevronRight size={14} color={COLORS.textDim} />
        </Pressable>

        {/* Team Score Banner */}
        {contest.hasTeams && contest.teamAName && contest.teamBName && (
          <View
            style={{
              borderRadius: RADII.md,
              padding: 12,
              flexDirection: "row",
              marginBottom: 12,
              backgroundColor: COLORS.card,
            }}
          >
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: COLORS.accent }}>
                {contest.teamAName}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "800", marginTop: 4 }}>
                {allPlayers
                  .filter((p) => p.team === "A")
                  .reduce((s, p) => s + p.scores.reduce((a, b) => a + b, 0), 0)}
              </Text>
            </View>
            <View style={{ width: 1, marginHorizontal: 8, backgroundColor: COLORS.border }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: COLORS.blue }}>
                {contest.teamBName}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "800", marginTop: 4 }}>
                {allPlayers
                  .filter((p) => p.team === "B")
                  .reduce((s, p) => s + p.scores.reduce((a, b) => a + b, 0), 0)}
              </Text>
            </View>
          </View>
        )}

        {/* Tabs — URL selection, tonal layering */}
        <View
          style={{
            flexDirection: "row",
            borderRadius: RADII.md,
            padding: 4,
            backgroundColor: COLORS.surfaceLow,
          }}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: activeTab === tab.key }}
              aria-selected={activeTab === tab.key}
              onPress={() => handleTabPress(tab.key)}
              style={{
                flex: 1,
                borderRadius: RADII.sm,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 8,
                paddingHorizontal: 2,
                backgroundColor:
                  activeTab === tab.key ? COLORS.surfaceHighest : "transparent",
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{
                  fontSize: 10,
                  fontFamily: FONTS.bold,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                  color: activeTab === tab.key ? COLORS.primary : COLORS.textDim,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View> : null}

      {/* Keep the organizer invite visible on the round; sync controls stay in the sheet. */}
      {isTabRoute ? <ContestJoinCode contest={contest} /> : null}

      <Slot />
      {isTabRoute ? <RoundStatusSheet contest={contest} visible={statusOpen} onClose={closeStatus} /> : null}
    </SafeScreen>
  );
}
