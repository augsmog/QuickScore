import { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  AlertTriangle,
  Camera,
  Edit3,
  UserCheck,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, scoreColor } from "../../src/ui/theme";
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
  const { contestId, groupId, scanData } = useLocalSearchParams<{
    contestId?: string;
    groupId?: string;
    scanData?: string;
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
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "800" }}>
          Review Scanned Scores
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Check size={14} color={COLORS.accent} />
          <Text style={{ color: COLORS.accent, fontSize: 13 }}>
            {scannedPlayers.length} players · 18 holes detected
          </Text>
        </View>
      </View>

      {/* Concerns Banner */}
      {lowConfCount > 0 && (
        <View
          style={{
            marginHorizontal: 20, marginBottom: 12, borderRadius: 14, padding: 14,
            backgroundColor: COLORS.warn + "12", borderColor: COLORS.warn + "33", borderWidth: 1,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={18} color={COLORS.warn} />
            <Text style={{ color: COLORS.warn, fontWeight: "700", fontSize: 14 }}>
              {lowConfCount} item{lowConfCount !== 1 ? "s" : ""} need{lowConfCount === 1 ? "s" : ""} review
            </Text>
          </View>
          {concerns.slice(0, 4).map((c, i) => (
            <Pressable
              key={i}
              onPress={() => { if (c.type === "name") setEditingNameIdx(c.playerIndex); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
            >
              <View
                style={{
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: c.confidence < 0.5 ? COLORS.danger : COLORS.warn,
                }}
              />
              <Text style={{ color: COLORS.text, fontSize: 12, flex: 1 }}>{c.message}</Text>
              <Text style={{ color: COLORS.textDim, fontSize: 10 }}>
                {Math.round(c.confidence * 100)}%
              </Text>
            </Pressable>
          ))}
          {concerns.length > 4 && (
            <Text style={{ color: COLORS.textDim, fontSize: 11, marginTop: 4 }}>
              +{concerns.length - 4} more
            </Text>
          )}
        </View>
      )}

      {/* Group Selector */}
      {contest && contest.groups.length > 1 && (
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={{ color: COLORS.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            Assign to Group
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {contest.groups.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => setSelectedGroupId(g.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                  backgroundColor: selectedGroupId === g.id ? COLORS.accent : COLORS.card,
                  borderColor: selectedGroupId === g.id ? COLORS.accent : COLORS.border, borderWidth: 1,
                }}
              >
                <Text style={{ color: selectedGroupId === g.id ? "#000" : COLORS.textDim, fontSize: 13, fontWeight: "600" }}>
                  {g.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Player Name Cards */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={{ color: COLORS.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Players Detected
          </Text>
          {scannedPlayers.map((player, pi) => {
            const isLowConf = player.nameConfidence < 0.7;
            const isMatched = player.matchedPlayerId !== null;
            return (
              <View
                key={pi}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  backgroundColor: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 6,
                  borderColor: isLowConf ? COLORS.warn + "66" : isMatched ? COLORS.accent + "44" : COLORS.border,
                  borderWidth: 1,
                }}
              >
                <View
                  style={{
                    width: 28, height: 28, borderRadius: 8,
                    backgroundColor: isMatched ? COLORS.accent + "22" : COLORS.bg,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Text style={{ color: isMatched ? COLORS.accent : COLORS.textDim, fontWeight: "700", fontSize: 12 }}>
                    {pi + 1}
                  </Text>
                </View>

                {editingNameIdx === pi ? (
                  <TextInput
                    value={player.name}
                    onChangeText={(v) => updatePlayerName(pi, v)}
                    onBlur={() => setEditingNameIdx(null)}
                    autoFocus
                    style={{
                      flex: 1, color: COLORS.text, fontSize: 14, fontWeight: "600",
                      backgroundColor: COLORS.inputBg, borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 6,
                      borderColor: COLORS.accent, borderWidth: 1,
                    }}
                  />
                ) : (
                  <Pressable
                    onPress={() => setEditingNameIdx(pi)}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: "600" }}>
                      {player.name}
                    </Text>
                    {isLowConf && (
                      <View style={{ backgroundColor: COLORS.warn + "22", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ color: COLORS.warn, fontSize: 9, fontWeight: "700" }}>
                          {Math.round(player.nameConfidence * 100)}%
                        </Text>
                      </View>
                    )}
                    {isMatched && <UserCheck size={14} color={COLORS.accent} />}
                    <Edit3 size={12} color={COLORS.textDim} />
                  </Pressable>
                )}

                {existingPlayers.length > 0 && !isMatched && (
                  <Pressable
                    onPress={() => setShowPlayerMatchModal(pi)}
                    style={{
                      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                      backgroundColor: COLORS.blue + "22", borderColor: COLORS.blue + "44", borderWidth: 1,
                    }}
                  >
                    <Text style={{ color: COLORS.blue, fontSize: 10, fontWeight: "600" }}>Match</Text>
                  </Pressable>
                )}

                <Text style={{ color: COLORS.textDim, fontSize: 13, fontWeight: "700" }}>
                  {player.scores.reduce((a, b) => a + b, 0)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Scorecard Grid */}
        {[
          { label: "Front 9", start: 0, end: 9 },
          { label: "Back 9", start: 9, end: 18 },
        ].map((half) => (
          <View key={half.label} style={{ paddingHorizontal: 8, marginBottom: 16 }}>
            <Text style={{ color: COLORS.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, paddingHorizontal: 12 }}>
              {half.label}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: "row" }}>
                  <View style={{ width: 80, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: "600" }}>Hole</Text>
                  </View>
                  {Array.from({ length: half.end - half.start }, (_, i) => i + half.start + 1).map((hole) => (
                    <View key={hole} style={{ width: 36, alignItems: "center", paddingVertical: 4 }}>
                      <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: "500" }}>{hole}</Text>
                    </View>
                  ))}
                  <View style={{ width: 44, alignItems: "center", paddingVertical: 4 }}>
                    <Text style={{ color: COLORS.accent, fontSize: 10, fontWeight: "700" }}>TOT</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row" }}>
                  <View style={{ width: 80, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: COLORS.textDim, fontSize: 9 }}>Par</Text>
                  </View>
                  {pars.slice(half.start, half.end).map((par, i) => (
                    <View key={i} style={{ width: 36, alignItems: "center", paddingVertical: 2 }}>
                      <Text style={{ color: COLORS.textDim, fontSize: 9 }}>{par}</Text>
                    </View>
                  ))}
                  <View style={{ width: 44, alignItems: "center", paddingVertical: 2 }}>
                    <Text style={{ color: COLORS.textDim, fontSize: 9, fontWeight: "600" }}>
                      {pars.slice(half.start, half.end).reduce((a, b) => a + b, 0)}
                    </Text>
                  </View>
                </View>
                {scannedPlayers.map((player, pi) => (
                  <View key={pi} style={{ flexDirection: "row", borderTopColor: COLORS.border + "44", borderTopWidth: 1 }}>
                    <View style={{ width: 80, paddingHorizontal: 8, paddingVertical: 6, justifyContent: "center" }}>
                      <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: "600" }} numberOfLines={1}>
                        {player.name.split(" ")[0]}
                      </Text>
                    </View>
                    {player.scores.slice(half.start, half.end).map((score, si) => {
                      const holeIdx = half.start + si;
                      const par = pars[holeIdx];
                      const conf = player.confidence[holeIdx];
                      const isLowConf = conf < 0.7;
                      const color = scoreColor(score, par);
                      return (
                        <View key={si} style={{ width: 36, alignItems: "center", paddingVertical: 4 }}>
                          <TextInput
                            value={String(score)}
                            onChangeText={(v) => updateScore(pi, holeIdx, v)}
                            keyboardType="number-pad"
                            maxLength={2}
                            style={{
                              width: 28, height: 28, textAlign: "center", borderRadius: 6,
                              fontSize: 12, fontWeight: "700", color,
                              backgroundColor: isLowConf ? COLORS.warn + "25" : "transparent",
                              borderColor: isLowConf ? COLORS.warn + "88" : "transparent",
                              borderWidth: isLowConf ? 1.5 : 0,
                            }}
                          />
                        </View>
                      );
                    })}
                    <View style={{ width: 44, alignItems: "center", paddingVertical: 6, justifyContent: "center" }}>
                      <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: "700" }}>
                        {player.scores.slice(half.start, half.end).reduce((a, b) => a + b, 0)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        ))}

        {/* Scan Another Group */}
        {contest && contest.groups.length > 1 && (
          <Pressable
            onPress={() => router.push(`/scan?contestId=${contestId}`)}
            style={{
              marginHorizontal: 20, marginBottom: 12, borderRadius: 12, padding: 14,
              backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Camera size={16} color={COLORS.blue} />
            <Text style={{ color: COLORS.blue, fontSize: 13, fontWeight: "600" }}>
              Scan Another Group's Card
            </Text>
          </Pressable>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Actions */}
      <View
        style={{
          paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12,
          backgroundColor: COLORS.bg, borderTopColor: COLORS.border, borderTopWidth: 1,
          flexDirection: "row", gap: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
            backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Camera size={16} color={COLORS.textDim} />
          <Text style={{ color: COLORS.textDim, fontWeight: "600", fontSize: 14 }}>Re-scan</Text>
        </Pressable>
        <Pressable
          onPress={handleCommit}
          style={{
            flex: 1, borderRadius: 14, paddingVertical: 14,
            backgroundColor: lowConfCount > 0 ? COLORS.warn : COLORS.accent,
            alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6,
          }}
        >
          {lowConfCount > 0 && <AlertTriangle size={16} color="#000" />}
          <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
            {contestId
              ? lowConfCount > 0
                ? `Confirm (${lowConfCount} uncertain)`
                : "Confirm Scores"
              : lowConfCount > 0
              ? `Quick Settle (${lowConfCount} uncertain)`
              : "Quick Settle"}
          </Text>
        </Pressable>
      </View>

      {/* Player Match Modal */}
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
              backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40,
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 20 }} />
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 18, marginBottom: 4 }}>
              Match Player
            </Text>
            <Text style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 16 }}>
              Link "{showPlayerMatchModal !== null ? scannedPlayers[showPlayerMatchModal]?.name : ""}" to an existing contest player
            </Text>

            {existingPlayers.map((player) => (
              <Pressable
                key={player.id}
                onPress={() => {
                  if (showPlayerMatchModal !== null) matchToPlayer(showPlayerMatchModal, player.id);
                }}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  backgroundColor: COLORS.bg, borderRadius: 12, padding: 14, marginBottom: 8,
                  borderColor: COLORS.border, borderWidth: 1,
                }}
              >
                <View
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: COLORS.accent + "22", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Text style={{ color: COLORS.accent, fontWeight: "700", fontSize: 14 }}>
                    {player.name.charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 14 }}>{player.name}</Text>
                  <Text style={{ color: COLORS.textDim, fontSize: 11 }}>
                    HCP {player.handicap}{player.team ? ` · Team ${player.team}` : ""}
                  </Text>
                </View>
                <UserCheck size={18} color={COLORS.accent} />
              </Pressable>
            ))}

            <Pressable onPress={() => setShowPlayerMatchModal(null)} style={{ alignItems: "center", paddingVertical: 12, marginTop: 8 }}>
              <Text style={{ color: COLORS.textDim, fontSize: 14 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Confetti celebration */}
      <ConfettiOverlay visible={showConfetti} onDone={handleConfettiDone} />
    </SafeAreaView>
  );
}
