import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';

/**
 * After the organizer finalizes, the round looks final at once. For one hour a scorer may
 * reopen their card to fix a score; after that it is locked. Owner decisions 9 and 11.
 * The server enforces the hour; this only decides what to show. Times are server times.
 */
export const REOPEN_MS = 60 * 60 * 1000;
export type ReopenState = 'final' | 'reopened' | 'locked';
export interface ReopenWindow { finalizedAt?: string | null; reopenedUntil?: string | null; closed?: boolean }

export function reopenState(window: ReopenWindow, now: number): ReopenState {
  if (window.closed) return 'locked';
  if (window.reopenedUntil) return now < Date.parse(window.reopenedUntil) ? 'reopened' : 'locked';
  // When the finalize time is not known, offer Reopen and let the server answer.
  if (!window.finalizedAt) return 'final';
  return now < Date.parse(window.finalizedAt) + REOPEN_MS ? 'final' : 'locked';
}

/** When the window ends, if known. */
export const reopenEnds = (window: ReopenWindow): number | null =>
  window.reopenedUntil ? Date.parse(window.reopenedUntil) : window.finalizedAt ? Date.parse(window.finalizedAt) + REOPEN_MS : null;
export const minutesLeft = (ends: number, now: number) => Math.max(0, Math.ceil((ends - now) / 60000));

export function reopenLine(window: ReopenWindow, now: number): string {
  const state = reopenState(window, now), ends = reopenEnds(window);
  const left = ends === null ? '' : ` ${minutesLeft(ends, now)} min left.`;
  if (state === 'locked') return 'Round final. Scores are locked.';
  if (state === 'reopened') return `Reopened to fix a score.${left} Everyone else still sees the round as final.`;
  return `Round final. You can reopen your card to fix a mistake.${left}`;
}

/** The server cell a fix is aimed at, from this phone's ids. Null when it is not in the round on the server. */
export function fixTarget(snapshot: SyncSnapshotV1, roundNumber: number, localPlayerId: string, hole: number) {
  const playerId = snapshot.id_map.find(m => m.kind === 'player' && m.local_id === localPlayerId)?.server_id ?? localPlayerId;
  const round = snapshot.rounds.find(r => r.number === roundNumber) ?? snapshot.rounds[0];
  const cell = round?.players.find(p => p.id === playerId)?.cells.find(c => c.hole === hole);
  return round && cell ? { contest_id: snapshot.contest_id, round_id: round.id, player_id: playerId, hole, version: cell.version } : null;
}
