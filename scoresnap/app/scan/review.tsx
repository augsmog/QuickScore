import { FullScreenSheet, SafeScreen } from "../../src/ui/SafeScreen";
import { defaultRoundGames } from "../../src/services/entitlements";
import { useScanStore } from "../../src/stores/scan-store";
import { useState, useMemo, useEffect } from "react";
import {
  AccessibilityInfo,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
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

import type { ScannedPlayer } from "../../src/services/score-parser";
import { applyCourseHoles, autoMatchPlayers, parseReviewData, grossScore, subtotal, blockingReason, completeScores, commitQuickSettle } from "../../src/services/ocr-review";

interface ConcernItem {
  type: "name" | "score";
  playerIndex: number;
  holeIndex?: number;
  message: string;
  confidence: number;
}

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
  const storedContest = contests.find((c) => c.id === contestId);
  const activeRound = storedContest?.isTournament ? storedContest.rounds?.find(r => r.number === storedContest.currentRound) : undefined;
  const contest = storedContest && activeRound ? { ...storedContest, groups: activeRound.groups, course: activeRound.course ?? storedContest.course } : storedContest;

  // Parse OCR data - require valid scanData, no fallback to sample data
  const { initialPlayers, parseError } = useMemo(() => {
    if (!scanData) {
      return {
        initialPlayers: null,
        parseError: "No scorecard data provided. Please scan a scorecard first.",
      };
    }
    
    try {
      const rows = JSON.parse(scanData);
      if (!Array.isArray(rows) || rows.length === 0) {
        return {
          initialPlayers: null,
          parseError: "Invalid scorecard data: no players found in the scan.",
        };
      }
      return { initialPlayers: autoMatchPlayers(applyCourseHoles(parseReviewData(scanData), contest?.course.holes.map(h => h.num)), contest?.groups.flatMap(g => g.players) ?? []), parseError: null };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {
          initialPlayers: null,
          parseError: "Malformed scorecard data. Please rescan the scorecard.",
        };
      }
      return {
        initialPlayers: null,
        parseError: "Failed to parse scorecard data. Please try scanning again.",
      };
    }
  }, [scanData]);

  const [scannedPlayers, setScannedPlayers] = useState<ScannedPlayer[]>(initialPlayers || []);

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
            message: `${p.name} hole ${p.requiredHoles?.[hi] ?? hi + 1}: score "${p.scores[hi]}" is uncertain`,
            confidence: c,
          });
        }
      });
    });
    return items.sort((a, b) => a.confidence - b.confidence);
  }, [scannedPlayers]);

  const lowConfCount = concerns.length;
  const [commitError, setCommitError] = useState<string | null>(null);
  // Main imports only the selected group. Exclude another group's row only
  // when its exact name uniquely identifies that player across the whole card.
  const excludedGroups = scannedPlayers.map(player => {
    const key = player.name.trim().toLowerCase();
    const owners = contest?.groups.flatMap(g => g.players
      .filter(p => p.name.trim().toLowerCase() === key).map(p => ({ group: g, player: p }))) ?? [];
    return owners.length === 1 && owners[0].group.id !== selectedGroupId &&
      owners[0].player.id === player.matchedPlayerId &&
      scannedPlayers.filter(p => p.name.trim().toLowerCase() === key).length === 1
      ? owners[0].group : null;
  });
  const importPlayers = scannedPlayers.filter((_, i) => !excludedGroups[i]);
  const reason = blockingReason(scannedPlayers, !!contestId, contest?.course.holes.map(h => h.num)) || (contestId &&
    (!importPlayers.length || !contest?.groups.some(g => g.id === selectedGroupId &&
      importPlayers.every(p => g.players.some(cp => cp.id === p.matchedPlayerId))))
    ? "Match players to the selected group" : null);
  useEffect(() => { AccessibilityInfo.announceForAccessibility(reason || "All required scores entered. Confirm and Calculate available."); setCommitError(null); }, [reason]);

  const updatePlayerName = (idx: number, name: string) => {
    setScannedPlayers((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, name, nameConfidence: 1 } : p))
    );
  };

  const updateScore = (playerIdx: number, holeIdx: number, score: string) => {
    const val = grossScore(score);
    setScannedPlayers((prev) =>
      prev.map((p, i) =>
        i === playerIdx
          ? {
              ...p,
              scores: p.scores.map((s, hi) => (hi === holeIdx ? val : s)),
              confidence: p.confidence.map((c, hi) => (hi === holeIdx ? (val === null ? 0 : 1) : c)),
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
    updateScore(selectedCell.player, selectedCell.hole, "");
    setSelectedCell(null);
  };

  const matchToPlayer = (scannedIdx: number, playerId: string | null) => {
    if (playerId === null) {
      setScannedPlayers(prev => prev.map((p, i) => i === scannedIdx ? { ...p, matchedPlayerId: null } : p));
      setShowPlayerMatchModal(null);
      return;
    }
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

  const addContest = useContestStore((s) => s.addContest);

  const [pendingNavTarget, setPendingNavTarget] = useState<string | null>(null);

  const handleCommit = () => {
    if (reason) return;
    try {

    if (contestId && selectedGroupId) {
      // Flow 1: Importing into existing contest
      const group = contest?.groups.find((g) => g.id === selectedGroupId);
      if (group) {
        const playerScores = importPlayers.map(sp => ({ playerId: sp.matchedPlayerId!, source: sp.source, scores: completeScores(sp.scores, contest?.course.holes.length, sp.source) }));
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
        scores: completeScores(sp.scores, 18, sp.source),
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
        games: defaultRoundGames(useScanStore.getState().tier),
        createdAt: new Date().toISOString(),
      };

      commitQuickSettle(scannedPlayers, () => addContest(newContest));
      setPendingNavTarget(`/contest/${newContest.id}`);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowConfetti(true);
    } catch (error) { setCommitError(error instanceof Error ? error.message : "Import rejected"); }
  };

  const handleConfettiDone = () => {
    setShowConfetti(false);
    if (pendingNavTarget) {
      router.replace(pendingNavTarget as any);
    }
  };

  const existingPlayers = contest?.groups.find(g => g.id === selectedGroupId)?.players || [];

  // Show error screen if parsing failed
  if (parseError) {
    return (
      <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: RADII.xl,
              backgroundColor: COLORS.error + "18",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <AlertTriangle size={32} color={COLORS.error} />
          </View>
          <Text
            style={{
              fontSize: 20,
              fontFamily: FONTS.headline,
              color: COLORS.text,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Invalid Scorecard Data
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: FONTS.regular,
              color: COLORS.textDim,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 24,
            }}
          >
            {parseError}
          </Text>

          <Pressable
            onPress={() => router.push(contestId ? `/scan?contestId=${contestId}` : "/scan")}
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: RADII.lg,
              paddingVertical: 14,
              paddingHorizontal: 24,
              width: "100%",
              alignItems: "center",
              marginBottom: 12,
              ...GLOW.primary,
            }}
          >
            <Text
              style={{
                color: COLORS.onPrimary,
                fontFamily: FONTS.bold,
                fontSize: 15,
              }}
            >
              Rescan Scorecard
            </Text>
          </Pressable>

          <Pressable
            testID="review-back" accessibilityRole="button" accessibilityLabel="Go Back"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/")}
            style={{ padding: 12 }}
          >
            <Text
              style={{
                color: COLORS.textDim,
                fontSize: 14,
                fontFamily: FONTS.medium,
              }}
            >
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
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
          SNAPSCORE
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

        {scannedPlayers.length > 0 && scannedPlayers.every(p => p.scores.length === 18 && p.scores.slice(9).every(s => s === null)) && (
          <View style={{ padding: 16, gap: 8 }}>
            <Text style={{ color: COLORS.text }}>Required holes: 18. If you have reviewed this as a nine-hole card, choose its course holes:</Text>
            {[1, 10].map(first => <Pressable key={first} accessibilityRole="button" onPress={() => {
              setScannedPlayers(prev => prev.map(p => ({ ...p, scores: p.scores.slice(0, 9), confidence: p.confidence.slice(0, 9), requiredHoles: Array.from({ length: 9 }, (_, i) => first + i) })));
            }}><Text style={{ color: COLORS.primary }}>Confirm {first === 1 ? "front nine (1–9)" : "back nine (10–18)"}</Text></Pressable>)}
          </View>
        )}
        {/* ========== PLAYER SCORE GRID ========== */}
        <View style={{ paddingHorizontal: 12, marginBottom: 16 }}>
          {scannedPlayers.map((player, pi) => {
            const isLowConf = player.nameConfidence < 0.7;
            const isMatched = player.matchedPlayerId !== null;
            const totalScore = subtotal(player);

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
                    {contestId && (
                      <Pressable
                        onPress={() => setShowPlayerMatchModal(pi)}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: RADII.md,
                          backgroundColor: COLORS.secondaryContainer,
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontFamily: FONTS.semibold, fontSize: 10 }}>{isMatched ? "Rematch" : "Match"}</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 16, color: COLORS.text }}>
                    {player.scores.some(s => s === null) ? `Partial: ${totalScore}` : totalScore}
                  </Text>
                </View>

                {excludedGroups[pi] && (
                  <Text accessibilityLabel={`${player.name}: Not imported — belongs to ${excludedGroups[pi]!.name}`}
                    style={{ color: COLORS.textDim, paddingHorizontal: 12, marginBottom: 8 }}>
                    {`Not imported — belongs to ${excludedGroups[pi]!.name}`}
                  </Text>
                )}
                {/* Score cells grid */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingBottom: 10, gap: 4 }}>
                    {player.scores.map((score, hi) => {
                      const conf = player.confidence[hi];
                      const isFlagged = conf < 0.7;
                      const isSelected = selectedCell?.player === pi && selectedCell?.hole === hi;
                      const par = pars[hi];
                      const color = score === null ? COLORS.error : scoreColor(score, par);

                      return (
                        <Pressable
                          key={hi}
                          accessibilityLabel={`${player.name}, hole ${player.requiredHoles?.[hi] ?? hi + 1}, ${score === null ? "blank, needs review" : score}`}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedCell(
                              isSelected ? null : { player: pi, hole: hi }
                            );
                          }}
                          style={{
                            minWidth: 44,
                            minHeight: 44,
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
                            {score ?? ""}
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



      {/* ========== NUMBER PAD (bottom) ========== */}
      {selectedCell !== null && (
        <View
          style={{
            marginHorizontal: 20,
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
            {scannedPlayers[selectedCell.player]?.name} — Hole {scannedPlayers[selectedCell.player]?.requiredHoles?.[selectedCell.hole] ?? selectedCell.hole + 1}
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
                  <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 20, color: COLORS.text }}>{d}</Text>
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
                  <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 20, color: COLORS.text }}>{d}</Text>
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
                  <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 20, color: COLORS.text }}>{d}</Text>
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
                disabled
                accessibilityState={{ disabled: true }}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: RADII.md,
                  backgroundColor: COLORS.surfaceHighest,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 20, color: COLORS.text }}>0</Text>
              </Pressable>
              <Pressable
                onPress={handleNumpadDelete}
                accessibilityLabel="Delete score, leave blank"
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

          paddingHorizontal: 20,
          paddingBottom: 36,
          paddingTop: 14,
          backgroundColor: COLORS.bg,
        }}
      >
        {(reason || commitError) && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: COLORS.error, marginBottom: 8 }}>{reason || commitError}</Text>}
        {/* Confirm & Calculate — primary CTA */}
        <Pressable
          onPress={handleCommit}
          disabled={!!reason}
          accessibilityState={{ disabled: !!reason }}
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

      </ScrollView>

      {/* ========== PLAYER MATCH MODAL ========== */}
      <FullScreenSheet
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

            <Pressable accessibilityLabel="Clear player match" onPress={() => {
              if (showPlayerMatchModal !== null) matchToPlayer(showPlayerMatchModal, null);
            }}><Text>Clear match</Text></Pressable>
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
      </FullScreenSheet>

      {/* Confetti celebration */}
      <ConfettiOverlay visible={showConfetti} onDone={handleConfettiDone} />
    </SafeScreen>
  );
}
