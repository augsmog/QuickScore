import { resolveGameScope } from './game-scope';
import type { GameConfig, GameType } from './types';

export interface FieldPotStanding {
  playerId: string;
  /** 1 = best. Ties share a rank. */
  rank: number;
}

export interface FieldPotInput {
  game: GameType;
  config?: GameConfig;
  /** Players who paid into the pot. */
  eligiblePlayerIds: string[];
  /** Final standings for the game; non-eligible players are ignored. */
  standings: FieldPotStanding[];
}

export interface FieldPotResult {
  /** Total pot in integer cents. */
  total: number;
  /** Player ids sharing first place among eligible players. */
  winners: string[];
  /** Integer cents each winner receives. */
  perWinner: number;
  /** Cents left over from an uneven split; reported, never dropped. */
  remainderCents: number;
}

const noPot = (): FieldPotResult => ({ total: 0, winners: [], perWinner: 0, remainderCents: 0 });

/**
 * Pure field-pot calculation. Event-scope games only; fee x eligible players,
 * split evenly among tied winners. Does not touch settlement.ts transactions.
 */
export function computeFieldPot(input: FieldPotInput): FieldPotResult {
  const { game, config, standings } = input;
  const fee = config?.potEntryFee;
  if (fee === undefined || !Number.isFinite(fee) || fee <= 0) return noPot();
  if (resolveGameScope(game, config) !== 'event') return noPot();

  const eligible = new Set(input.eligiblePlayerIds);
  if (eligible.size === 0) return noPot();

  const total = Math.round(fee * 100) * eligible.size;

  const ranked = standings.filter(
    (s) => eligible.has(s.playerId) && Number.isFinite(s.rank),
  );
  if (ranked.length === 0) return { total, winners: [], perWinner: 0, remainderCents: total };

  const best = Math.min(...ranked.map((s) => s.rank));
  const winners = [...new Set(ranked.filter((s) => s.rank === best).map((s) => s.playerId))];
  const perWinner = Math.floor(total / winners.length);
  return { total, winners, perWinner, remainderCents: total - perWinner * winners.length };
}
