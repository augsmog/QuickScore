import type { ScoreFlag } from './player-link';

/**
 * A flagged change: someone asked to change a score another person entered. The first score
 * counts until the group scorekeeper (or the organizer) decides. Owner decisions 8, 12, 13.
 */
export type FlagRole = 'decide' | 'asked' | 'waiting';
export const flagRole = (flag: ScoreFlag): FlagRole => flag.can_resolve ? 'decide' : flag.mine ? 'asked' : 'waiting';

const strokes = (n: number | null) => n ?? 'no score';
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One sentence per flag. Each ends by saying which score counts now. */
export function flagLine(flag: ScoreFlag): string {
  const who = `${flag.player_name}, hole ${flag.hole}`;
  const now = strokes(flag.current_strokes), asked = strokes(flag.proposed_strokes);
  const role = flagRole(flag);
  if (role === 'decide') return `${who}: ${now} was entered, ${asked} was asked for. ${capital(String(now))} counts until you decide.`;
  if (role === 'asked') return `${who}: you asked to change ${now} to ${asked}. ${capital(String(now))} counts until the group scorekeeper decides.`;
  return `${who}: a change from ${now} to ${asked} is waiting. ${capital(String(now))} counts for now.`;
}

type IdMap = { kind: string; local_id: string; server_id: string }[];
/** The organizer's phone keeps its own ids for a round it made; the server's are mapped back. */
export function localFlags(flags: ScoreFlag[], idMap: IdMap | undefined): ScoreFlag[] {
  const local = (kind: string, id: string) => idMap?.find(m => m.kind === kind && m.server_id === id)?.local_id ?? id;
  return flags.map(f => ({ ...f, player_id: local('player', f.player_id), round_id: local('round', f.round_id), group_id: local('group', f.group_id) }));
}

const inRound = (flag: ScoreFlag, roundId?: string) => !roundId || flag.round_id === roundId;
/** Players whose score on this hole has a change waiting. */
export const flaggedOnHole = (flags: ScoreFlag[], hole: number, roundId?: string): Set<string> =>
  new Set(flags.filter(f => f.hole === hole && inRound(f, roundId)).map(f => f.player_id));
/** Holes with a change waiting, in order. */
export const flaggedHoles = (flags: ScoreFlag[], roundId?: string): number[] =>
  [...new Set(flags.filter(f => inRound(f, roundId)).map(f => f.hole))].sort((a, b) => a - b);
