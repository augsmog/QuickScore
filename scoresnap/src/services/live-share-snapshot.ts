import type { Contest } from '../stores/contest-store';
import { calcStrokePlay } from '../engine/calculators/stroke-play';
import { calculateSettlement } from '../engine/settlement';
export const validShareToken = (token: unknown): token is string => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
export const linkExpired = (expiresAt: string, now = Date.now()) => !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now;
export interface SharedRound {
  completed: boolean;
  players: { displayName: string; scores: number[]; total: number; toPar: number }[];
  games: { game: string; standings: { displayName: string; units: number }[] }[];
}
export function buildSnapshot(contest: Contest): SharedRound {
  const players = contest.groups.flatMap(g => g.players).map(p => ({ ...p, scores: Array.from({ length: Math.min(18, contest.course.holes.length) }, (_, i) => {
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
