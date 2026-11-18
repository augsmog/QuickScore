import { SafeScreen } from "../../src/ui/SafeScreen";
import { useMemo, useState, useRef, useEffect } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { X, Check, AlertTriangle } from "lucide-react-native";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW } from "../../src/ui/theme";
import { useContestStore } from "../../src/stores/contest-store";
import type { ContestGroup } from "../../src/stores/contest-store";
import { useAuthStore } from "../../src/stores/auth-store";
import { parseReviewData, autoMatchPlayers, grossScore, fullHoles } from "../../src/services/ocr-review";
import type { ScannedPlayer } from "../../src/services/score-parser";
import { buildPartialImport, MIN_PARTIAL_IMPORT_CONFIDENCE } from "../../src/services/partial-import";
import type { PartialImportTarget } from "../../src/services/partial-import";
import { PartialImportSession } from "../../src/services/partial-import-session";
import type { PartialImportSessionContext } from "../../src/services/partial-import-session";
import { confirmPartialImportToStore } from "../../src/services/partial-import-confirm";

// AUG-1171 approved copy batch (AUG-1174, Augie: "Approved"). Do not edit without a fresh batch item.
const COPY = {
  entry: "Scan partial card",
  heading: "Review partial card",
  intro: "Choose the group and played holes, match each row to a player, and check the scores before saving.",
  group: "Group",
  played: "Played holes",
  playedHelp: "Select only the holes already played. Other holes stay blank.",
  playerHelp: "Choose a player for each row. Check the player ID when names match.",
  conflict: "A saved score differs from this card. Resolve the difference before saving.",
  stale: "The account, round, or group changed. Return to the active round and review again.",
  invalidScan: "This scan could not be opened. Return to the camera and try again.",
  player: "Match player",
  cellReview: "Check score",
  cellConfirm: "Confirm score",
  blank: "Unplayed",
  confirm: "Save reviewed scores",
  cancel: "Cancel",
  noContext: "Open partial-card scanning from an active round.",
  missing: "Enter and confirm a score for every played hole.",
  mapping: "Match each row to a different player in the selected group.",
  failure: "Scores were not saved. Your review is still here. Check the active round and review again.",
  back: "Back to round",
} as const;

interface ScreenDraft {
  playedHoles: Set<number>;
  manualMap: Record<number, string | null>;
  corrections: Record<string, string>;
  confirmedCells: Set<string>;
}

// Module-level: keeps the reviewed draft and the apply-once guard alive across this screen's
// own Back/Cancel/remount (AUG-348's "retain draft" rule), scoped per contest+round+group+account.
const sessionsByKey = new Map<string, PartialImportSession>();
const draftsByKey = new Map<string, ScreenDraft>();

function accountKey(state: ReturnType<typeof useAuthStore.getState>): string {
  return state.isAnonymous ? "anonymous" : state.session?.user.id ?? "signed-out";
}
// Clear retained drafts even if the review screen is currently unmounted.
useAuthStore.subscribe((next, previous) => {
  if (accountKey(next) !== accountKey(previous)) {
    draftsByKey.clear();
    for (const session of sessionsByKey.values()) session.setAccount(null);
    sessionsByKey.clear();
  }
});

function cellKey(rowIndex: number, hole: number): string {
  return `${rowIndex}:${hole}`;
}

export default function ScanPartialReviewScreen() {
  const router = useRouter();
  const { contestId, groupId: groupIdParam, scanData, sourceContext } = useLocalSearchParams<{
    contestId?: string;
    groupId?: string;
    scanData?: string;
    sourceContext?: string;
  }>();

  const auth = useAuthStore();
  const accountId = accountKey(auth);
  const applyReviewedPartialImport = useContestStore((s) => s.applyReviewedPartialImport);
  const storedContest = useContestStore((s) => s.contests.find((c) => c.id === contestId));
  const activeRound = storedContest?.isTournament
    ? storedContest.rounds?.find((r) => r.number === storedContest.currentRound)
    : undefined;
  const groups: ContestGroup[] = activeRound?.groups ?? storedContest?.groups ?? [];
  const course = activeRound?.course ?? storedContest?.course;
  const roundId = activeRound?.id ?? null;

  const [groupId, setGroupId] = useState<string | null>(
    groupIdParam || (groups.length === 1 ? groups[0].id : null)
  );
  const group = groups.find((g) => g.id === groupId) ?? null;

  const draftKey = contestId && groupId ? JSON.stringify([accountId, contestId, roundId, groupId, scanData]) : null;
  const entryContext = useRef({ accountId, contestId, roundId });
  const attemptedPatch = useRef<string | null>(null);
  const contextCurrent = entryContext.current.accountId === accountId &&
    entryContext.current.contestId === contestId && entryContext.current.roundId === roundId &&
    sourceContext === JSON.stringify([accountId, contestId, roundId]);


  const { initialRows, parseError } = useMemo(() => {
    if (!contestId || !storedContest || !course) return { initialRows: null, parseError: COPY.noContext };
    if (!scanData) return { initialRows: null, parseError: COPY.noContext };
    try {
      // Unlike the full-card flow, a partial scan legitimately covers only some of the course's
      // holes (the rest blank/null) -- ocr-review's applyCourseHoles enforces full coverage and
      // would misclassify every genuinely partial card as a hole-alignment error, so it isn't used here.
      return { initialRows: parseReviewData(scanData), parseError: null };
    } catch {
      return { initialRows: null, parseError: COPY.invalidScan };
    }
  }, [contestId, storedContest, course, scanData]);

  const autoRows: ScannedPlayer[] = useMemo(() => {
    if (!initialRows) return [];
    if (!group) return initialRows;
    return autoMatchPlayers(initialRows.map(row => ({ ...row, matchedPlayerId: null })), group.players.map((p) => ({ id: p.id, name: p.name })));
  }, [initialRows, group]);

  // A hole counts as played by default when at least one scanned row has a non-blank reading
  // there; a hole every row left blank is presumed unplayed. The toggle row below lets the
  // reviewer correct either direction before confirming.
  const defaultPlayedHoles = useMemo(() => {
    const holes = new Set<number>();
    for (const row of initialRows ?? []) {
      const rowHoles = row.requiredHoles ?? fullHoles;
      rowHoles.forEach((hole, idx) => {
        if (grossScore(row.scores[idx]) !== null) holes.add(hole);
      });
    }
    return holes;
  }, [initialRows]);

  const existingDraft = draftKey ? draftsByKey.get(draftKey) : undefined;
  const [playedHoles, setPlayedHoles] = useState<Set<number>>(
    () => existingDraft?.playedHoles ?? defaultPlayedHoles
  );
  const [manualMap, setManualMap] = useState<Record<number, string | null>>(() => existingDraft?.manualMap ?? {});
  const [corrections, setCorrections] = useState<Record<string, string>>(() => existingDraft?.corrections ?? {});
  const [confirmedCells, setConfirmedCells] = useState<Set<string>>(
    () => existingDraft?.confirmedCells ?? new Set()
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(() => Boolean(draftKey && sessionsByKey.get(draftKey)?.getState().status === "confirmed"));

  useEffect(() => {
    const draft = draftKey ? draftsByKey.get(draftKey) : undefined;
    setPlayedHoles(draft?.playedHoles ?? defaultPlayedHoles);
    setManualMap(draft?.manualMap ?? {});
    setCorrections(draft?.corrections ?? {});
    setConfirmedCells(draft?.confirmedCells ?? new Set());
    attemptedPatch.current = null;
    setSaveError(null);
    setSaved(Boolean(draftKey && sessionsByKey.get(draftKey)?.getState().status === "confirmed"));
  }, [draftKey]);

  function persistDraft(next: Partial<ScreenDraft>) {
    if (!draftKey) return;
    const current = draftsByKey.get(draftKey) ?? {
      playedHoles, manualMap, corrections, confirmedCells,
    };
    draftsByKey.set(draftKey, { ...current, ...next });
  }

  function togglePlayedHole(hole: number) {
    setPlayedHoles((prev) => {
      const next = new Set(prev);
      if (next.has(hole)) next.delete(hole); else next.add(hole);
      persistDraft({ playedHoles: next });
      return next;
    });
  }

  function setMapping(rowIndex: number, playerId: string | null) {
    setManualMap((prev) => {
      const base = { ...prev };
      for (const key of Object.keys(base)) {
        if (Number(key) !== rowIndex && base[Number(key)] === playerId) base[Number(key)] = null;
      }
      base[rowIndex] = playerId;
      persistDraft({ manualMap: base });
      return base;
    });
  }

  function setCorrection(rowIndex: number, hole: number, text: string) {
    setConfirmedCells(prev => {
      const next = new Set(prev);
      next.delete(cellKey(rowIndex, hole));
      persistDraft({ confirmedCells: next });
      return next;
    });
    setCorrections((prev) => {
      const next = { ...prev, [cellKey(rowIndex, hole)]: text };
      persistDraft({ corrections: next });
      return next;
    });
  }

  function confirmCell(rowIndex: number, hole: number) {
    setConfirmedCells((prev) => {
      const next = new Set(prev);
      next.add(cellKey(rowIndex, hole));
      persistDraft({ confirmedCells: next });
      return next;
    });
  }

  const rowsDisplayed: ScannedPlayer[] = useMemo(
    () => autoRows.map((row, i) => ({ ...row, matchedPlayerId: Object.prototype.hasOwnProperty.call(manualMap, i) ? manualMap[i] : row.matchedPlayerId })),
    [autoRows, manualMap]
  );

  const holeIdentities = useMemo(() => (course?.holes ?? []).map((h) => h.num), [course]);

  const reviewedRows: ScannedPlayer[] = useMemo(
    () =>
      rowsDisplayed.map((row, i) => {
        // Align by identity so a shorter scan retains blank cells that can be corrected
        // for any explicitly played course hole, without inventing a reading.
        const rowHoles = row.requiredHoles ?? fullHoles;
        const scores = holeIdentities.map(hole => row.scores[rowHoles.indexOf(hole)] ?? null);
        const confidence = holeIdentities.map(hole => row.confidence[rowHoles.indexOf(hole)] ?? 0);
        holeIdentities.forEach((hole, hIdx) => {
          if (!playedHoles.has(hole)) return;
          const key = cellKey(i, hole);
          const typed = corrections[key];
          if (typed !== undefined) {
            const n = Number(typed.trim());
            if (Number.isSafeInteger(n) && n > 0) {
              scores[hIdx] = n;
              confidence[hIdx] = 1;
              return;
            }
            scores[hIdx] = null;
            confidence[hIdx] = 0;
            return;
          }
          const raw = grossScore(scores[hIdx]);
          if (confirmedCells.has(key) && raw !== null) {
            confidence[hIdx] = 1;
          }
        });
        return { ...row, requiredHoles: holeIdentities, scores, confidence };
      }),
    [rowsDisplayed, playedHoles, corrections, confirmedCells, holeIdentities]
  );

  const targets: PartialImportTarget[] = useMemo(
    () =>
      (group?.players ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        scores: Object.fromEntries((course?.holes ?? []).map((h, idx) => [h.num, p.scores[idx]])),
      })),
    [group, course]
  );


  const result = useMemo(
    () =>
      group && course
        ? buildPartialImport({
            rows: reviewedRows,
            players: targets,
            holeIdentities,
            playedHoles,
            coverage: "full-group",
          })
        : null,
    [group, course, reviewedRows, targets, holeIdentities, playedHoles]
  );

  const mappingResolved = autoRows.every((row, i) => row.nameConfidence >= MIN_PARTIAL_IMPORT_CONFIDENCE || Boolean(manualMap[i]));
  const patchKey = result?.ok ? JSON.stringify(result.patch) : null;
  const canConfirm = contextCurrent && storedContest?.status === "active" && mappingResolved &&
    result !== null && result.ok && result.complete && playedHoles.size > 0 && !saved && attemptedPatch.current !== patchKey;

  function handleCancel() {
    router.back();
  }

  function handleConfirm() {
    if (!canConfirm || !draftKey || !contestId || !group || !result || !result.ok || !result.complete) return;
    // Read canonical identity/context at the event boundary: render closures may be stale.
    const latestAuth = useAuthStore.getState();
    const latestAccount = accountKey(latestAuth);
    const latestContest = useContestStore.getState().contests.find(c => c.id === contestId);
    const latestRound = latestContest?.isTournament ? latestContest.rounds?.find(r => r.number === latestContest.currentRound) : undefined;
    const latestGroup = (latestRound?.groups ?? latestContest?.groups)?.find(g => g.id === group.id);
    if (latestAccount !== accountId || latestContest?.status !== "active" ||
        (latestRound?.id ?? null) !== roundId || !latestGroup || !course ||
        latestContest.isTournament && !latestRound) {
      setSaveError(COPY.failure);
      return;
    }
    const fresh = buildPartialImport({ rows: reviewedRows, holeIdentities, playedHoles, coverage: "full-group",
      players: latestGroup.players.map(p => ({id:p.id,name:p.name,
        scores:Object.fromEntries(((latestRound?.course ?? latestContest.course).holes).map((h,i)=>[h.num,p.scores[i]]))})) });
    if (!fresh.ok || !fresh.complete || JSON.stringify(fresh.patch) !== patchKey) {
      setSaveError(COPY.failure);
      return;
    }
    // Fence before calling the store, including reentrant callbacks and failed writes.
    attemptedPatch.current = patchKey;
    const context: PartialImportSessionContext = {
      accountId, contestId, roundId, groupId: group.id,
    };
    let session = sessionsByKey.get(draftKey);
    if (!session) {
      session = new PartialImportSession();
      sessionsByKey.set(draftKey, session);
    }
    session.setAccount(accountId);
    if (session.getState().status === "confirmed") {
      setSaved(true);
      router.back();
      return;
    }
    const token = session.beginReview(accountId, context);
    const state = session.completeReview(token, context, {
      rows: reviewedRows, players: targets, holeIdentities, playedHoles, coverage: "full-group",
    });
    if (!state || state.status !== "draft" || !state.result.ok) {
      setSaveError(COPY.failure);
      return;
    }
    const outcome = confirmPartialImportToStore(session, accountId, context, {
      applyReviewedPartialImport,
    });
    if (outcome.ok) {
      setSaveError(null);
      setSaved(true);
      draftsByKey.delete(draftKey);
      router.back();
      return;
    }
    setSaveError(COPY.failure);
  }

  if (parseError || !contestId || !storedContest || !course || !contextCurrent || accountId === "signed-out" || storedContest.isTournament && !activeRound) {
    return (
      <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
          <AlertTriangle size={32} color={COLORS.warn} />
          <Text style={{ ...TYPOGRAPHY.body, color: COLORS.text, textAlign: "center" }}>
            {parseError || (!contextCurrent ? COPY.stale : COPY.noContext)}
          </Text>
          <Pressable testID="partial-review-back" accessibilityRole="button" onPress={handleCancel}>
            <Text style={{ color: COLORS.primary }}>{COPY.back}</Text>
          </Pressable>
        </View>
      </SafeScreen>
    );
  }

  if (!group) {
    return (
      <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
          <Text style={{ ...TYPOGRAPHY.title, color: COLORS.text }}>{COPY.group}</Text>
          {groups.map((g) => (
            <Pressable
              key={g.id}
              testID={`partial-group-${g.id}`}
              accessibilityRole="button"
              onPress={() => setGroupId(g.id)}
              style={{
                padding: 16,
                borderRadius: RADII.lg,
                backgroundColor: COLORS.surfaceMid,
              }}
            >
              <Text style={{ color: COLORS.text, fontFamily: FONTS.semibold }}>{g.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={{ ...TYPOGRAPHY.title, color: COLORS.text }}>{COPY.heading}</Text>
        <Text style={{ color: COLORS.textDim }}>{COPY.intro}</Text>

        <View style={{ gap: 8 }}>
          <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>{COPY.played}</Text>
          <Text style={{ color: COLORS.textDim }}>{COPY.playedHelp}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {holeIdentities.map((hole) => (
              <Pressable
                key={hole}
                testID={`partial-hole-${hole}`}
                accessibilityRole="button"
                onPress={() => togglePlayedHole(hole)}
                style={{
                  minWidth: 44, minHeight: 44, borderRadius: RADII.md, alignItems: "center", justifyContent: "center",
                  backgroundColor: playedHoles.has(hole) ? COLORS.primary : COLORS.surfaceMid,
                }}
              >
                <Text style={{ color: playedHoles.has(hole) ? COLORS.onPrimary : COLORS.textDim, fontFamily: FONTS.semibold }}>
                  {hole}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>{COPY.player}</Text>
        <Text style={{ color: COLORS.textDim }}>{COPY.playerHelp}</Text>
        {!mappingResolved && <Text accessibilityRole="alert" style={{ color: COLORS.warn }}>{COPY.mapping}</Text>}
        {rowsDisplayed.map((row, rowIndex) => (
          <View key={rowIndex} testID={`partial-row-${rowIndex}`} style={{ gap: 8, padding: 12, borderRadius: RADII.lg, backgroundColor: COLORS.surfaceLow }}>
            <Text style={{ color: COLORS.text, fontFamily: FONTS.semibold }}>{row.name}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {(group.players as { id: string; name: string }[]).map((p) => (
                <Pressable
                  key={p.id}
                  testID={`partial-map-${rowIndex}-${p.id}`}
                  accessibilityRole="button"
                  onPress={() => setMapping(rowIndex, p.id)}
                  style={{
                    minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADII.sm,
                    backgroundColor: row.matchedPlayerId === p.id ? COLORS.primary : COLORS.surfaceMid,
                  }}
                >
                  <Text style={{ color: row.matchedPlayerId === p.id ? COLORS.onPrimary : COLORS.textDim, fontSize: 12 }}>
                    {p.name} ({p.id})
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {holeIdentities.filter((h) => playedHoles.has(h)).map((hole) => {
                const hIdx = row.requiredHoles?.indexOf(hole) ?? -1;
                const raw = hIdx >= 0 ? grossScore(row.scores[hIdx]) : null;
                const rawConfidence = hIdx >= 0 ? row.confidence[hIdx] : 0;
                const key = cellKey(rowIndex, hole);
                const needsReview = raw === null || rawConfidence < MIN_PARTIAL_IMPORT_CONFIDENCE;
                const resolved = !needsReview || confirmedCells.has(key) ||
                  (() => { const n = Number((corrections[key] ?? "").trim()); return Number.isSafeInteger(n) && n > 0; })();
                return (
                  <View key={hole} style={{ width: 96, gap: 4 }}>
                    <Text style={{ color: COLORS.textDim, fontSize: 11 }}>{hole}</Text>
                    <>
                        {needsReview &&
                        <Text testID={`partial-cell-status-${key}`} style={{ color: COLORS.warn, fontSize: 11 }}>
                          {COPY.cellReview}
                        </Text>}
                        <TextInput
                          testID={`partial-cell-input-${key}`}
                          accessibilityLabel={`${row.name} (${row.matchedPlayerId ?? ""}), hole ${hole}`}
                          keyboardType="number-pad"
                          value={corrections[key] ?? (raw === null ? "" : String(raw))}
                          onChangeText={(text) => setCorrection(rowIndex, hole, text)}
                          style={{ borderWidth: 1, borderColor: COLORS.textDim, borderRadius: RADII.sm, padding: 8, color: COLORS.text }}
                        />
                        {needsReview && raw !== null && (
                          <Pressable
                            testID={`partial-cell-confirm-${key}`}
                            accessibilityRole="button"
                            onPress={() => confirmCell(rowIndex, hole)}
                            style={{ paddingVertical: 6, alignItems: "center", backgroundColor: COLORS.surfaceMid, borderRadius: RADII.sm }}
                          >
                            <Text style={{ color: COLORS.text, fontSize: 11 }}>{COPY.cellConfirm}</Text>
                          </Pressable>
                        )}
                        {!resolved && <AlertTriangle size={14} color={COLORS.warn} />}
                    </>
                  </View>
                );
              })}
              {holeIdentities.filter((h) => !playedHoles.has(h)).length > 0 && (
                <Text style={{ color: COLORS.textDim, fontSize: 11, alignSelf: "center" }}>{COPY.blank}</Text>
              )}
            </View>
          </View>
        ))}

        {result && !result.ok && result.blockers.length > 0 ? (
          <View style={{ gap: 4 }}>
            {result.blockers.map((b, i) => (
              <Text key={i} testID={`partial-blocker-${i}`} style={{ color: COLORS.warn, fontSize: 12 }}>
                {b.startsWith("Score conflict") ? COPY.conflict : /roster|mapping|player id|rows map/.test(b) ? COPY.mapping : COPY.missing}
              </Text>
            ))}
          </View>
        ) : null}

        {saveError && (
          <Text testID="partial-save-error" accessibilityRole="alert" style={{ color: COLORS.error }}>
            {saveError}
          </Text>
        )}

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            testID="partial-cancel"
            accessibilityRole="button"
            onPress={handleCancel}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: COLORS.surfaceMid, borderRadius: RADII.lg, paddingVertical: 14 }}
          >
            <X size={18} color={COLORS.textDim} />
            <Text style={{ color: COLORS.textDim, fontFamily: FONTS.semibold }}>{COPY.cancel}</Text>
          </Pressable>
          <Pressable
            testID="partial-confirm"
            accessibilityRole="button"
            disabled={!canConfirm}
            onPress={handleConfirm}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              backgroundColor: canConfirm ? COLORS.primary : COLORS.surfaceMid, borderRadius: RADII.lg, paddingVertical: 14,
              ...GLOW.primary,
            }}
          >
            <Check size={18} color={canConfirm ? COLORS.onPrimary : COLORS.textDim} />
            <Text style={{ color: canConfirm ? COLORS.onPrimary : COLORS.textDim, fontFamily: FONTS.bold }}>
              {COPY.confirm}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}
