import type { GameType, SettlementSummary } from "../types";

// AUG-246 (acceptance 4): per-game leader rows for the Round > Leaderboard.
// Pure and unmounted-safe: the caller injects how one game is settled (the
// screen passes calculateContestSettlement(contest, [game])), so this file adds
// no new game math. It only reads who is ahead in each game. Dollar amounts are
// deliberately NOT exposed here; the settle-up screen owns money display.

export type GameLeaderStatus = "leader" | "tied" | "all_square" | "pending";

export interface GameLeaderRow {
  game: GameType;
  label: string;
  status: GameLeaderStatus;
  /** Player names sharing the lead, in input order. Empty unless leader/tied. */
  leaders: string[];
}

/** Games the leaderboard already is (stroke ranking) or that are display modes, not side games. */
const NOT_A_SIDE_GAME = new Set<string>(["stroke_play", "gross_net"]);

const cents = (n: number) => Math.round(n * 100);

export function buildGameLeaderRows(
  games: readonly GameType[],
  settleOne: (game: GameType) => SettlementSummary,
  labelOf: (game: GameType) => string,
): GameLeaderRow[] {
  const rows: GameLeaderRow[] = [];
  const seen = new Set<string>();
  for (const game of games) {
    if (NOT_A_SIDE_GAME.has(game) || seen.has(game)) continue;
    seen.add(game);
    const label = labelOf(game);
    let summary: SettlementSummary;
    try {
      summary = settleOne(game);
    } catch {
      // A game that cannot be settled yet must never break the leaderboard.
      rows.push({ game, label, status: "pending", leaders: [] });
      continue;
    }
    if (summary.pending) {
      rows.push({ game, label, status: "pending", leaders: [] });
      continue;
    }
    const entries = Object.entries(summary.netByPlayer ?? {});
    const best = entries.reduce((m, [, v]) => Math.max(m, cents(v)), Number.NEGATIVE_INFINITY);
    if (entries.length === 0 || best <= 0) {
      rows.push({ game, label, status: "all_square", leaders: [] });
      continue;
    }
    const leaders = entries.filter(([, v]) => cents(v) === best).map(([name]) => name);
    rows.push({ game, label, status: leaders.length > 1 ? "tied" : "leader", leaders });
  }
  return rows;
}

/** One-line text for a row, e.g. "Skins: Alex leads", "Nassau: tied, Alex & Bo". */
export function gameLeaderText(row: GameLeaderRow): string {
  switch (row.status) {
    case "leader":
      return `${row.label}: ${row.leaders[0]} leads`;
    case "tied":
      return `${row.label}: tied, ${row.leaders.length <= 3 ? row.leaders.join(" & ") : `${row.leaders.length} players`}`;
    case "all_square":
      return `${row.label}: all square`;
    case "pending":
      return `${row.label}: waiting on scores`;
  }
}
