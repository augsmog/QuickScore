import type { Contest } from '../stores/contest-store';
import { calcStrokePlay } from '../engine/calculators/stroke-play';
import { calculateSettlement } from '../engine/settlement';
import type { Player } from '../engine/types';

export const validShareToken = (token: unknown): token is string => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
export const linkExpired = (expiresAt: string, now = Date.now()) => !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now;

export interface SharedRound {
  completed: boolean;
  players: { displayName: string; scores: number[]; total: number; toPar: number }[];
  games: { game: string; standings: { displayName: string; units: number }[] }[];
}

/**
 * Get tournament players with aggregated scores across all rounds
 * Inline version to avoid importing from contest-store (which imports React Native)
 */
function getTournamentPlayers(contest: Contest): Player[] {
  if (!contest.isTournament || !contest.rounds) {
    return contest.groups.flatMap((g) => g.players);
  }
  
  // Aggregate scores across all rounds
  const playerMap = new Map<string, Player>();
  
  for (const round of contest.rounds) {
    for (const group of round.groups) {
      for (const player of group.players) {
        const existing = playerMap.get(player.id);
        if (!existing) {
          playerMap.set(player.id, {
            ...player,
            scores: [...player.scores], // Clone for aggregation
          });
        } else {
          // Add this round's scores to the cumulative total
          for (let i = 0; i < player.scores.length; i++) {
            if (player.scores[i] > 0) {
              existing.scores[i] = (existing.scores[i] || 0) + player.scores[i];
            }
          }
        }
      }
    }
  }
  
  return Array.from(playerMap.values());
}

export function buildSnapshot(contest: Contest): SharedRound {
  // For tournaments, aggregate scores across all rounds; for legacy, use groups directly
  const allPlayers = contest.isTournament 
    ? getTournamentPlayers(contest)
    : contest.groups.flatMap(g => g.players);
  const players = allPlayers.map(p => ({ ...p, scores: Array.from({ length: Math.min(18, contest.course.holes.length) }, (_, i) => {
    const n = p.scores[i];
    return Number.isInteger(n) && n >= 0 && n <= 99 ? n : 0;
  }) }));
  const totals = calcStrokePlay(players, contest.course);
  return {
    completed: contest.status === 'completed',
    players: players.map(p => {
      const r = totals.find(r => r.playerId === p.id)!;
      return { displayName: p.name.trim().slice(0, 80), scores: p.scores.slice(0, contest.course.holes.length).map(n => Number.isInteger(n) && n >= 0 && n <= 99 ? n : 0), total: r.total, toPar: r.toPar };
    }),
    games: contest.games.map(game => {
      const result = calculateSettlement(players, contest.course, [game], 1, contest.auxiliaryData, contest.gameConfig, contest.groups);
      return { game, standings: players.map(p => ({ displayName: p.name.trim().slice(0, 80), units: result.netByPlayer[p.name] || 0 })) };
    }),
  };
}
