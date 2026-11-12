import type { LeaderboardRow } from "./leaderboard-rows";

export type CutRule =
  | { kind: "top_n_and_ties"; n: number }
  | { kind: "within_strokes"; strokes: number };

export interface CutLineResult {
  /** Player ids in their original standings order. */
  made: string[];
  /** Player ids in their original standings order, including players without a completed round. */
  missed: string[];
  /** The inclusive total-score boundary, or null when no player makes the cut. */
  cutScore: number | null;
}

/**
 * Apply a cut to already-ranked leaderboard rows. `total` is used as given,
 * so callers can pass gross or net rows without this model recalculating scores.
 * Rows with `thru === null` have no completed holes and are treated as missed.
 */
export function applyCut(
  standings: Pick<LeaderboardRow, "playerId" | "total" | "thru">[],
  rule: CutRule,
  _opts: {} = {},
): CutLineResult {
  const limit = rule.kind === "top_n_and_ties" ? rule.n : rule.strokes;
  if (!Number.isFinite(limit) || limit < 0 || (rule.kind === "top_n_and_ties" && !Number.isInteger(limit))) {
    throw new RangeError("Cut limit must be a non-negative finite number (Top N must be an integer)");
  }

  const eligible = standings.filter((row) => row.thru !== null);
  const inOrder = [...eligible].sort((a, b) => a.total - b.total);
  let cutScore: number | null = null;
  if (inOrder.length > 0) {
    if (rule.kind === "within_strokes") {
      cutScore = inOrder[0].total + rule.strokes;
    } else if (rule.n >= inOrder.length) {
      cutScore = inOrder[inOrder.length - 1].total;
    } else if (rule.n > 0) {
      cutScore = inOrder[rule.n - 1].total;
    }
  }

  const madeSet = new Set(
    cutScore === null ? [] : inOrder.filter((row) => row.total <= cutScore!).map((row) => row.playerId),
  );
  return {
    made: standings.filter((row) => row.thru !== null && madeSet.has(row.playerId)).map((row) => row.playerId),
    missed: standings.filter((row) => row.thru === null || !madeSet.has(row.playerId)).map((row) => row.playerId),
    cutScore,
  };
}

/**
 * Attach cut status to the displayed leaderboard rows without changing their
 * order or rank labels. When `fullFieldRows` is supplied, the boundary is
 * computed from the full field so search/group filters cannot change status.
 * Pass the unfiltered rows from buildLeaderboardRows as that third argument.
 */
export function withCutStatus<T extends LeaderboardRow>(
  rows: T[],
  rule: CutRule,
  fullFieldRows: Pick<LeaderboardRow, "playerId" | "total" | "thru">[] = rows,
): (T & { cut: "made" | "missed"; cutScore: number | null })[] {
  const { made, cutScore } = applyCut(fullFieldRows, rule);
  const madeIds = new Set(made);
  return rows.map((row) => ({
    ...row,
    cut: row.thru !== null && madeIds.has(row.playerId) ? "made" : "missed",
    cutScore,
  }));
}
