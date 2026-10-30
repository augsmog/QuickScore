import type { Entry, ScoreDraft } from './score-outbox';
type Target = Pick<ScoreDraft, 'contest_id' | 'round_id' | 'player_id' | 'hole'>;
/** Overlay only durably queued drafts; a blocked predecessor leaves the server value visible. */
export function projectScore(target: Target, current: number | null, entries: Entry[]): { strokes: number | null; state: 'current' | Entry['state'] } {
  const matching = entries.filter(e => e.draft.contest_id === target.contest_id && e.draft.round_id === target.round_id && e.draft.player_id === target.player_id && e.draft.hole === target.hole);
  const blocked = matching.find(e => e.state !== 'queued');
  if (blocked) return { strokes: current, state: blocked.state };
  const latest = matching[matching.length - 1];
  return latest ? { strokes: latest.draft.strokes, state: 'queued' } : { strokes: current, state: 'current' };
}
/** Keep accepted drafts visible until an authorized fetch confirms server state. */
export function pendingConfirmation(previous: Entry[], durable: Entry[]): Entry[] {
  const updated = new Map(durable.map(e => [e.id, e]));
  const known = new Set(previous.map(e => e.id));
  return [...previous.map(e => updated.get(e.id) ?? e), ...durable.filter(e => !known.has(e.id))];
}
