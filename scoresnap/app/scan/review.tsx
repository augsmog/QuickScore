import { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  AlertTriangle,
  Camera,
  Edit3,
  UserCheck,
  HelpCircle,
  Delete,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW, scoreColor } from "../../src/ui/theme";
import { useContestStore, generateId, defaultCourse } from "../../src/stores/contest-store";
import type { Contest, ContestGroup } from "../../src/stores/contest-store";
import { ConfettiOverlay } from "../../src/ui/animations/ConfettiOverlay";

interface ScannedPlayer {
  name: string;
  scores: number[];
  confidence: number[]; // 0-1 per hole
  nameConfidence: number; // 0-1
  matchedPlayerId: string | null;
}

interface ConcernItem {
  type: "name" | "score";
  playerIndex: number;
  holeIndex?: number;
  message: string;
  confidence: number;
}

// Sample data used as fallback when no OCR data is passed
const SAMPLE_PLAYERS: ScannedPlayer[] = [
  {
    name: "M. Thompson",
    scores: [4, 5, 4, 3, 5, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4],
    confidence: Array(18).fill(0.95),
    nameConfidence: 0.92,
    matchedPlayerId: null,
  },
  {
    name: "D.R.",
    scores: [5, 6, 4, 4, 5, 4, 5, 6, 5, 5, 5, 4, 5, 5, 6, 4, 5, 5],
    confidence: Array(18).fill(0.9).map((c, i) => (i === 3 || i === 11 ? 0.55 : c)),
    nameConfidence: 0.45,
    matchedPlayerId: null,
  },
  {
    name: "Chris L",
    scores: [4, 5, 5, 3, 4, 3, 5, 5, 4, 5, 4, 3, 5, 5, 5, 3, 4, 5],
    confidence: Array(18).fill(0.92),
    nameConfidence: 0.88,
    matchedPlayerId: null,
  },
  {
    name: "J. Parks",
    scores: [5, 5, 4, 4, 6, 4, 4, 5, 5, 4, 5, 4, 6, 4, 5, 4, 5, 4],
    confidence: Array(18).fill(0.88).map((c, i) => (i === 7 ? 0.48 : c)),
    nameConfidence: 0.85,
    matchedPlayerId: null,
  },
];

export default function ScanReviewScreen() {
  const router = useRouter();
  const { contestId, groupId, scanData, photoUri } = useLocalSearchParams<{
    contestId?: string;
    groupId?: string;
    scanData?: string;
    photoUri?: string;
  }>();

  const contests = useContestStore((s) => s.contests);
  const importScores = useContestStore((s) => s.importScores);
  const contest = contests.find((c) => c.id === contestId);

  // Use real OCR data from scan flow, or sample data for demo/testing
  const initialPlayers = useMemo(() => {
    if (scanData) {
      try {
        return JSON.parse(scanData) as ScannedPlayer[];
      } catch {
        return SAMPLE_PLAYERS;
      }
    }
    return SAMPLE_PLAYERS;
  }, [scanData]);

  const [scannedPlayers, setScannedPlayers] = useState<ScannedPlayer[]>(initialPlayers);

  const [editingNameIdx, setEditingNameIdx] = useState<number | null>(null);
  const [showPlayerMatchModal, setShowPlayerMatchModal] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState(groupId || contest?.groups[0]?.id || "");
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ player: number; hole: number } | null>(null);

  const pars = contest?.course.holes.map((h) => h.par) || [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];

  // Identify all concerns
  const concerns = useMemo<ConcernItem[]>(() => {
    const items: ConcernItem[] = [];
    scannedPlayers.forEach((p, pi) => {
      if (p.nameConfidence < 0.7) {
        items.push({
          type: "name", playerIndex: pi,
          message: `"${p.name}" — name may be abbreviated or misread`,
          confidence: p.nameConfidence,
        });
      }
      p.confidence.forEach((c, hi) => {
        if (c < 0.7) {
          items.push({
            type: "score", playerIndex: pi, holeIndex: hi,
            message: `${p.name} hole ${hi + 1}: score "${p.scores[hi]}" is uncertain`,
            confidence: c,
          });
        }
      });
    });
    return items.sort((a, b) => a.confidence - b.confidence);
  }, [scannedPlayers]);

  const lowConfCount = concerns.length;

  const updatePlayerName = (idx: number, name: string) => {
    setScannedPlayers((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, name, nameConfidence: 1 } : p))
    );
  };

  const updateScore = (playerIdx: number, holeIdx: number, score: string) => {
    const val = parseInt(score) || 0;
    setScannedPlayers((prev) =>
      prev.map((p, i) =>
        i === playerIdx
          ? {
              ...p,
              scores: p.scores.map((s, hi) => (hi === holeIdx ? val : s)),
              confidence: p.confidence.map((c, hi) => (hi === holeIdx ? 1 : c)),
            }
          : p
      )
    );
  };

  const handleNumpadPress = (digit: number) => {
    if (!selectedCell) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateScore(selectedCell.player, selectedCell.hole, String(digit));
    // Auto-advance to next flagged cell or deselect
    setSelectedCell(null);
  };

  const handleNumpadDelete = () => {
    if (!selectedCell) return;
    updateScore(selectedCell.player, selectedCell.hole, "0");
    setSelectedCell(null);
  };

  const matchToPlayer = (scannedIdx: number, playerId: string) => {
    const player = contest?.groups.flatMap((g) => g.players).find((p) => p.id === playerId);
    if (player) {
      setScannedPlayers((prev) =>
        prev.map((p, i) =>
          i === scannedIdx
            ? { ...p, name: player.name, matchedPlayerId: playerId, nameConfidence: 1 }
            : p
        )
      );
    }
    setShowPlayerMatchModal(null);
  };

  // Auto-match scanned players to contest players by name similarity
  const autoMatchPlayers = useCallback(() => {
    if (!contest) return;
    const allContestPlayers = contest.groups.flatMap((g) => g.players);

    setScannedPlayers((prev) =>
      prev.map((sp) => {
        if (sp.matchedPlayerId) return sp; // Already matched

        // Try exact match first
        const exact = allContestPlayers.find(
          (cp) => cp.name.toLowerCase() === sp.name.toLowerCase()
        );
        if (exact) return { ...sp, matchedPlayerId: exact.id, nameConfidence: 1 };

        // Try partial match (first name or last name)
        const scannedParts = sp.name.toLowerCase().split(/[\s.]+/).filter(Boolean);
        const partial = allContestPlayers.find((cp) => {
          const cpParts = cp.name.toLowerCase().split(/[\s.]+/).filter(Boolean);
          return scannedParts.some((sp) => cpParts.some((cp) => cp.startsWith(sp) || sp.startsWith(cp)));
        });
        if (partial) return { ...sp, matchedPlayerId: partial.id, name: partial.name, nameConfidence: 0.8 };

        return sp;
      })
    );
  }, [contest]);

  // Run auto-match on mount when contest exists
  useEffect(() => {
    if (contest && scannedPlayers.some((sp) => !sp.matchedPlayerId)) {
      autoMatchPlayers();
    }
  }, [contest?.id]);

  const addContest = useContestStore((s) => s.addContest);

  const [pendingNavTarget, setPendingNavTarget] = useState<string | null>(null);

  const handleCommit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowConfetti(true);

    if (contestId && selectedGroupId) {
      // Flow 1: Importing into existing contest
      const group = contest?.groups.find((g) => g.id === selectedGroupId);
      if (group) {
        const playerScores = group.players.map((contestPlayer, i) => {
          const matched = scannedPlayers.find(
            (sp) => sp.matchedPlayerId === contestPlayer.id
          );
          return {
            playerId: contestPlayer.id,
            scores: matched?.scores || scannedPlayers[i]?.scores || new Array(18).fill(0),
          };
        });
        importScores(contestId, selectedGroupId, playerScores);
      }
      setPendingNavTarget(`/contest/${contestId}`);
    } else {
      // Flow 3: "Quick Settle" — create contest from scanned data
      const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
      const players = scannedPlayers.map((sp) => ({
        id: generateId(),
        name: sp.name,
        handicap: 0,
        team: null,
        scores: sp.scores,
      }));

      const group: ContestGroup = {
        id: generateId(),
        name: "Group 1",
        players,
      };

      const newContest: Contest = {
        id: generateId(),
        name: `${dayName} Round`,
        course: defaultCourse("Scanned Course"),
        status: "active",
        betUnit: 5,
        hasTeams: false,
        groups: [group],
        games: ["stroke_play", "skins"],
        createdAt: new Date().toISOString(),
      };

      addContest(newContest);
      setPendingNavTarget(`/contest/${newContest.id}`);
    }
  };

  const handleConfettiDone = () => {
    setShowConfetti(false);
    if (pendingNavTarget) {
      router.replace(pendingNavTarget as any);
    }
  };

  const existingPlayers = contest?.groups.flatMap((g) => g.players) || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* ========== HEADER ========== */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: FONTS.headline,
            fontSize: 16,
            color: COLORS.text,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          SCORESNAP
        </Text>
        <Pressable
          style={{
            width: 32,
            height: 32,
            borderRadius: RADII.full,
            backgroundColor: COLORS.surfaceHigh,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <HelpCircle size={16} color={COLORS.textDim} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* ========== PHOTO PREVIEW ========== */}
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 16,
            borderRadius: RADII.xl,
            overflow: "hidden",
            backgroundColor: COLORS.surfaceMid,
            height: 160,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
              <Camera size={32} color={COLORS.textDim} />
              <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textDim, marginTop: 8 }}>
                Scorecard preview
              </Text>
            </View>
          )}
          {/* Pinch to zoom chip */}
          <View
            style={{
              position: "absolute",
              bottom: 10,
              alignSelf: "center",
              backgroundColor: COLORS.bg + "cc",
              borderRadius: RADII.full,
              paddingHorizontal: 12,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontFamily: FONTS.bold,
                fontSize: 9,
                color: COLORS.textDim,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              PINCH TO ZOOM
            </Text>
          </View>
        </View>

        {/* ========== DIGITIZED SCORES HEADER ========== */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text
                style={{
                  ...TYPOGRAPHY.headline,
                  color: COLORS.text,
                  marginBottom: 2,
                }}
              >
                Digitized Scores
              </Text>
              <Text
                style={{
                  ...TYPOGRAPHY.labelSm,
                  color: COLORS.textDim,
                }}
              >
                VERIFICATION MODE
              </Text>
            </View>
            {/* Flagged count badge */}
            {lowConfCount > 0 && (
              <View
                style={{
                  backgroundColor: COLORS.warn + "22",
                  borderRadius: RADII.md,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.bold,
                    fontSize: 12,
                    color: COLORS.warn,
                  }}
                >
                  ⚠ {lowConfCount} FLAGGED
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ========== GROUP SELECTOR ========== */}
        {contest && contest.groups.length > 1 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <Text
              style={{
                ...TYPOGRAPHY.label,
                color: COLORS.textDim,
                marginBottom: 6,
              }}
            >
              Assign to Group
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {contest.groups.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setSelectedGroupId(g.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: RADII.md,
                    backgroundColor: selectedGroupId === g.id ? COLORS.primary : COLORS.surfaceMid,
                  }}
                >
                  <Text
                    style={{
                      color: selectedGroupId === g.id ? COLORS.onPrimary : COLORS.textDim,
                      fontFamily: FONTS.semibold,
                      fontSize: 13,
                    }}
                  >
                    {g.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ========== PLAYER SCORE GRID ========== */}
        <View style={{ paddingHorizontal: 12, marginBottom: 16 }}>
          {scannedPlayers.map((player, pi) => {
            const isLowConf = player.nameConfidence < 0.7;
            const isMatched = player.matchedPlayerId !== null;
            const totalScore = player.scores.reduce((a, b) => a + b, 0);

            return (
              <View
                key={pi}
                style={{
                  backgroundColor: COLORS.surfaceHigh,
                  borderRadius: RADII.md,
                  marginBottom: 8,
                  overflow: "hidden",
                }}
              >
                {/* Player header row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 12,
                    paddingBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    {editingNameIdx === pi ? (
                      <TextInput
                        value={player.name}
                        onChangeText={(v) => updatePlayerName(pi, v)}
                        onBlur={() => setEditingNameIdx(null)}
                        autoFocus
                        style={{
                          flex: 1,
                          color: COLORS.text,
                          fontFamily: FONTS.semibold,
                          fontSize: 14,
                          backgroundColor: COLORS.surfaceLow,
                          borderRadius: RADII.md,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      />
                    ) : (
                      <Pressable
                        onPress={() => setEditingNameIdx(pi)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                      >
                        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
                          {player.name}
                        </Text>
                        {isLowConf && (
                          <View style={{ backgroundColor: COLORS.warn + "22", borderRadius: RADII.md, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ color: COLORS.warn, fontFamily: FONTS.bold, fontSize: 9 }}>
                              {Math.round(player.nameConfidence * 100)}%
                            </Text>
                          </View>
                        )}
                        {isMatched && <UserCheck size={14} color={COLORS.primary} />}
                        <Edit3 size={11} color={COLORS.textDim} />
                      </Pressable>
                    )}
                    {existingPlayers.length > 0 && !isMatched && (
                      <Pressable
                        onPress={() => setShowPlayerMatchModal(pi)}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: RADII.md,
                          backgroundColor: COLORS.secondaryContainer,
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontFamily: FONTS.semibold, fontSize: 10 }}>Match</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={{ fontFamily: FONTS.headline, fontSize: 16, color: COLORS.text }}>
                    {totalScore}
                  </Text>
                </View>

                {/* Score cells grid */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingBottom: 10, gap: 4 }}>
                    {player.scores.map((score, hi) => {
                      const conf = player.confidence[hi];
                      const isFlagged = conf < 0.7;
                      const isSelected = selectedCell?.player === pi && selectedCell?.hole === hi;
                      const par = pars[hi];
                      const color = scoreColor(score, par);

                      return (
                        <Pressable
                          key={hi}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedCell(
                              isSelected ? null : { player: pi, hole: hi }
                            );
                          }}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: RADII.md,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isFlagged
                              ? COLORS.error + "33"
                              : isSelected
                              ? COLORS.primary + "33"
                              : COLORS.surfaceHighest,
                            borderWidth: isSelected ? 2 : 0,
                            borderColor: isSelected ? COLORS.primary : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: FONTS.bold,
                              fontSize: isFlagged ? 15 : 13,
                              color: isFlagged ? COLORS.error : color,
                            }}
                          >
                            {score}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            );
          })}
        </View>

        {/* Scan Another Group */}
        {contest && contest.groups.length > 1 && (
          <Pressable
            onPress={() => router.push(`/scan?contestId=${contestId}`)}
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              borderRadius: RADII.md,
              padding: 14,
              backgroundColor: COLORS.surfaceLow,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Camera size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontFamily: FONTS.semibold, fontSize: 13 }}>
              Scan Another Group's Card
            </Text>
          </Pressable>
        )}

        <View style={{ height: 220 }} />
      </ScrollView>

      {/* ========== NUMBER PAD (bottom) ========== */}
      {selectedCell !== null && (
        <View
          style={{
            position: "absolute",
            bottom: 100,
            left: 20,
            right: 20,
            backgroundColor: COLORS.surfaceMid,
            borderRadius: RADII.xl,
            padding: 16,
            ...GLOW.primary,
          }}
        >
          <Text
            style={{
              fontFamily: FONTS.medium,
              fontSize: 12,
              color: COLORS.textDim,
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            {scannedPlayers[selectedCell.player]?.name} — Hole {selectedCell.hole + 1}
          </Text>
          <View style={{ gap: 8 }}>
            {/* Row 1: 1 2 3 */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[1, 2, 3].map((d) => (
                <Pressable
                  key={d}
                  onPress={() => handleNumpadPress(d)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.surfaceHighest,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: FONTS.headline, fontSize: 20, color: COLORS.text }}>{d}</Text>
                </Pressable>
              ))}
            </View>
            {/* Row 2: 4 5 6 */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[4, 5, 6].map((d) => (
                <Pressable
                  key={d}
                  onPress={() => handleNumpadPress(d)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.surfaceHighest,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: FONTS.headline, fontSize: 20, color: COLORS.text }}>{d}</Text>
                </Pressable>
              ))}
            </View>
            {/* Row 3: 7 8 9 */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[7, 8, 9].map((d) => (
                <Pressable
                  key={d}
                  onPress={() => handleNumpadPress(d)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.surfaceHighest,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: FONTS.headline, fontSize: 20, color: COLORS.text }}>{d}</Text>
                </Pressable>
              ))}
            </View>
            {/* Row 4: (empty) 0 (delete) */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setSelectedCell(null)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: RADII.md,
                  backgroundColor: COLORS.surfaceHigh,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textDim }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => handleNumpadPress(0)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: RADII.md,
                  backgroundColor: COLORS.surfaceHighest,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: FONTS.headline, fontSize: 20, color: COLORS.text }}>0</Text>
              </Pressable>
              <Pressable
                onPress={handleNumpadDelete}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: RADII.md,
                  backgroundColor: COLORS.error + "22",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Delete size={20} color={COLORS.error} />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ========== BOTTOM ACTIONS ========== */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 20,
          paddingBottom: 36,
          paddingTop: 14,
          backgroundColor: COLORS.bg,
        }}
      >
        {/* Confirm & Calculate — primary CTA */}
        <Pressable
          onPress={handleCommit}
          style={{
            borderRadius: RADII.lg,
            paddingVertical: 16,
            backgroundColor: COLORS.primary,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
            marginBottom: 10,
            ...GLOW.primary,
          }}
        >
          {lowConfCount > 0 && <AlertTriangle size={16} color={COLORS.onPrimary} />}
          <Text
            style={{
              fontFamily: FONTS.bold,
              fontSize: 16,
              color: COLORS.onPrimary,
            }}
          >
            {contestId
              ? lowConfCount > 0
                ? `Confirm (${lowConfCount} uncertain)`
                : "Confirm & Calculate"
              : lowConfCount > 0
              ? `Quick Settle (${lowConfCount} uncertain)`
              : "Confirm & Calculate"}
          </Text>
        </Pressable>

        {/* Rescan — ghost link */}
        <Pressable
          onPress={() => router.back()}
          style={{
            alignItems: "center",
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              fontFamily: FONTS.semibold,
              fontSize: 14,
              color: COLORS.primary,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            RESCAN SCORECARD
          </Text>
        </Pressable>
      </View>

      {/* ========== PLAYER MATCH MODAL ========== */}
      <Modal
        visible={showPlayerMatchModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPlayerMatchModal(null)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowPlayerMatchModal(null)} />
          <View
            style={{
              backgroundColor: COLORS.surfaceMid,
              borderTopLeftRadius: RADII.xl,
              borderTopRightRadius: RADII.xl,
              paddingHorizontal: 24,
              paddingTop: 20,
              paddingBottom: 40,
            }}
          >
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
            <Text
              style={{
                fontFamily: FONTS.headline,
                fontSize: 18,
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              Match Player
            </Text>
            <Text
              style={{
                fontFamily: FONTS.regular,
                fontSize: 13,
                color: COLORS.textDim,
                marginBottom: 16,
              }}
            >
              Link "{showPlayerMatchModal !== null ? scannedPlayers[showPlayerMatchModal]?.name : ""}" to an existing contest player
            </Text>

            {existingPlayers.map((player) => (
              <Pressable
                key={player.id}
                onPress={() => {
                  if (showPlayerMatchModal !== null) matchToPlayer(showPlayerMatchModal, player.id);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: COLORS.surfaceLow,
                  borderRadius: RADII.md,
                  padding: 14,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.primary + "22",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: COLORS.primary, fontFamily: FONTS.bold, fontSize: 14 }}>
                    {player.name.charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
                    {player.name}
                  </Text>
                  <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>
                    HCP {player.handicap}{player.team ? ` · Team ${player.team}` : ""}
                  </Text>
                </View>
                <UserCheck size={18} color={COLORS.primary} />
              </Pressable>
            ))}

            <Pressable
              onPress={() => setShowPlayerMatchModal(null)}
              style={{ alignItems: "center", paddingVertical: 12, marginTop: 8 }}
            >
              <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textDim }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Confetti celebration */}
      <ConfettiOverlay visible={showConfetti} onDone={handleConfettiDone} />
    </SafeAreaView>
  );
}
