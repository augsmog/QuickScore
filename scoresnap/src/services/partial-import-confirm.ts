/**
 * AUG-348f: binds the mid-round `PartialImportSession` confirm step to the contest store's
 * `applyReviewedPartialImport` action, and computes the hole to resume scoring on.
 *
 * Still unmounted: no React, no screen, no auth wiring. The store is injected (only the one
 * action is needed) so this stays pure and testable. Callers get a result object instead of an
 * exception, so a screen can show the reason and keep the user's review draft on failure.
 */
import type { PartialImportCell } from "./partial-import";
import type { PartialImportSession, PartialImportSessionContext } from "./partial-import-session";

/** The single store action this binder needs (matches `useContestStore.getState()`). */
export interface PartialImportStoreAction {
  applyReviewedPartialImport: (
    contestId: string,
    roundId: string | null,
    groupId: string,
    patch: readonly PartialImportCell[],
    playedHoles: readonly number[]
  ) => void;
}

export type PartialImportConfirmOutcome =
  | { ok: true; patch: readonly PartialImportCell[] }
  | { ok: false; error: string; needsReReview: boolean };

/**
 * Confirms the session's draft for `context` and writes it through the store action, which
 * re-validates every cell (group/course membership, conflicts, locked contests, stale round).
 *
 * Never throws. A rejected write leaves the draft in the session so the screen can keep it on
 * screen. Because the session marks a draft as applied before calling the store, a rejected
 * draft cannot be retried as-is: the result says `needsReReview`, and a fresh
 * `beginReview`/`completeReview` gives the user a new draft to confirm.
 */
export function confirmPartialImportToStore(
  session: PartialImportSession,
  accountId: string,
  context: PartialImportSessionContext,
  store: PartialImportStoreAction
): PartialImportConfirmOutcome {
  let storeError: string | null = null;
  try {
    const state = session.confirm(accountId, context, (patch, playedHoles) => {
      try {
        store.applyReviewedPartialImport(context.contestId, context.roundId, context.groupId, patch, playedHoles);
      } catch (error) {
        storeError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    });
    if (state.status === "confirmed") return { ok: true, patch: state.patch };
    return { ok: false, error: "This review was already tried and not saved; review the card again", needsReReview: true };
  } catch (error) {
    if (storeError !== null) return { ok: false, error: storeError, needsReReview: true };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message, needsReReview: /stale|re-run review/i.test(message) };
  }
}

/**
 * The hole to resume scoring on after a confirmed import: the first hole in `playOrder` that is
 * not fully scored for every player. `playOrder` is the group's real order of play (for a
 * shotgun or back-nine start, e.g. [10..18, 1..9]); nothing assumes play began on hole 1.
 * Returns null when every hole is scored (the caller must still not auto-finalize).
 */
export function nextHoleToScore(
  playOrder: readonly number[],
  playerIds: readonly string[],
  scored: readonly Pick<PartialImportCell, "playerId" | "hole">[]
): number | null {
  if (!playerIds.length) return playOrder[0] ?? null;
  const have = new Set(scored.map((cell) => `${cell.playerId}\u0000${cell.hole}`));
  for (const hole of playOrder) {
    if (playerIds.some((id) => !have.has(`${id}\u0000${hole}`))) return hole;
  }
  return null;
}
