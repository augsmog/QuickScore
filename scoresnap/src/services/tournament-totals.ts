import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';

type Round = SyncSnapshotV1['rounds'][number];
export interface RoundTotal {
  roundId: string;
  strokes: number | null;
  scored: number;
  holes: number;
  complete: boolean;
}
/** Confirmed server cells only. Missing/cleared scores never count as zero.
 * Each round owns its course; a missing course cannot certify completion.
 */
export function confirmedRoundTotal(round: Round, playerId: string): RoundTotal {
  const player = round.players.find(p => p.id === playerId);
  const holes = [...new Set(round.course.holes.map(h => h.num)
    .filter((n): n is number => Number.isInteger(n) && n! >= 1 && n! <= 18))];
  const values = holes.map(hole => player?.cells.find(c => c.hole === hole)?.strokes)
    .filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 15);
  return {
    roundId: round.id,
    strokes: values.length ? values.reduce((sum, n) => sum + n, 0) : null,
    scored: values.length,
    holes: holes.length,
    complete: !!player && player.status === 'active' && holes.length > 0 && values.length === holes.length,
  };
}
/** Server player IDs, never names, connect the same player across rounds. */
export function confirmedTournamentTotals(snapshot: SyncSnapshotV1) {
  const players = new Map<string, string>();
  for (const round of snapshot.rounds) for (const player of round.players) players.set(player.id, player.displayName);
  return [...players].map(([playerId, displayName]) => {
    const rounds = snapshot.rounds.map(round => confirmedRoundTotal(round, playerId));
    const recorded = rounds.filter(r => r.strokes !== null);
    return {
      playerId, displayName, rounds,
      strokes: recorded.length ? recorded.reduce((sum, r) => sum + r.strokes!, 0) : null,
      complete: rounds.length > 0 && rounds.every(r => r.complete),
    };
  });
}
