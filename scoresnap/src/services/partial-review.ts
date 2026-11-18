/** Pure helpers for the scan review "partial scorecard" confirm panel (AUG-348 / AUG-1171). */
import type { ScannedPlayer } from "./score-parser";
import { buildPartialImport, type PartialImportResult, type PartialImportTarget } from "./partial-import";

export function togglePlayedHole(played: ReadonlySet<number>, hole: number): Set<number> {
  const next = new Set(played);
  if (next.has(hole)) next.delete(hole); else next.add(hole);
  return next;
}

export interface PartialReviewPlan {
  result: PartialImportResult;
  /** One-line summary for the confirm button / screen reader. */
  summary: string;
}

/** Group-scoped sparse review: only the selected played holes are imported. */
export function planPartialReview(
  rows: readonly ScannedPlayer[],
  players: readonly PartialImportTarget[],
  holeIdentities: readonly number[],
  playedHoles: ReadonlySet<number>,
): PartialReviewPlan {
  const result = buildPartialImport({ rows, players, holeIdentities, playedHoles, coverage: "sparse" });
  const summary = result.ok
    ? result.patch.length
      ? `${result.patch.length} score${result.patch.length === 1 ? "" : "s"} across ${playedHoles.size} hole${playedHoles.size === 1 ? "" : "s"} ready to import`
      : "Nothing new to import — selected holes already match"
    : `${result.blockers.length} issue${result.blockers.length === 1 ? "" : "s"} to fix before importing`;
  return { result, summary };
}
