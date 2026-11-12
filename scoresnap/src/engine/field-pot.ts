import type { GameConfig, GameType } from "./types";
import type { LeaderboardRow } from "./leaderboard-rows";
import { resolveGameScope } from "./game-scope";

export interface FieldPotResult {
  /** Total pot collected, in integer cents. Zero when there is no pot to pay out. */
  total: number;
  /** Winning player ids (lowest total in the pool), in their original standings order. */
  winners: string[];
  /** Each winner's even share of the pot, in integer cents. */
  perWinner: number;
  /** Cents left over after an even split, reported rather than invented or dropped. */
  remainderCents: number;
}

const NO_POT: FieldPotResult = { total: 0, winners: [], perWinner: 0, remainderCents: 0 };

/**
 * Pure field-pot payout calculation (AUG-258e1): the entry fee collected from
 * `poolPlayers` is paid out to the lowest-total winner(s) of `standings`
 * within that pool. Only event-scope games are pot-eligible; group-scope
 * games, a missing/zero fee, or an empty pool return `NO_POT` rather than
 * throwing. This never touches settlement.ts's bet-unit transactions --
 * callers render the result as an additive section.
 */
export function computeFieldPot(
  game: GameType,
  config: GameConfig,
  poolPlayers: Pick<LeaderboardRow, "playerId">[],
  standings: Pick<LeaderboardRow, "playerId" | "total" | "thru">[],
): FieldPotResult {
  if (resolveGameScope(game, config) !== "event") return NO_POT;
  if (!config.potEntryFee) return NO_POT;
  if (poolPlayers.length === 0) return NO_POT;

  const feeCents = Math.round(config.potEntryFee * 100);
  const total = feeCents * poolPlayers.length;

  const poolIds = new Set(poolPlayers.map((p) => p.playerId));
  const inPool = standings.filter((row) => row.thru !== null && poolIds.has(row.playerId));
  const minTotal = inPool.reduce((min, row) => Math.min(min, row.total), Infinity);
  const winners = inPool.filter((row) => row.total === minTotal).map((row) => row.playerId);

  const perWinner = winners.length ? Math.floor(total / winners.length) : 0;
  const remainderCents = winners.length ? total - perWinner * winners.length : total;

  return { total, winners, perWinner, remainderCents };
}
