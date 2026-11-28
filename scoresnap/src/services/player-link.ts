import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';
import { calculateContestSettlement } from '../engine/contest-results';
import { restoreOwnerContest } from './restore-owner-contest';
import { netPayments } from './net-payments';

/** A player link lets a guest with no account keep one group's card on the web. */
export const validPlayerToken = (token: unknown): token is string => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

export interface LinkRoster {
  contest_id: string; name: string; open: boolean; me: string | null;
  rounds: { id: string; number: number; name: string; groups: { id: string; name: string; players: { id: string; displayName: string }[] }[] }[];
}
export interface LinkMember { member_id: string; player_id: string; player_name: string; joined_at: string; groups: { round_id: string; group_id: string; name: string }[] }
/** The organizer's list has no names for web scorers: the card they keep identifies them. */
export const memberLabel = (m: LinkMember) => `Web scorer on ${m.groups[0]?.name ?? 'no group'} (picked ${m.player_name})`;
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;

/** Server refusals in words a golfer can act on. Unknown failures stay retryable. */
export function playerLinkMessage(error: { code?: string; message?: string } | null | undefined): string {
  const reason = error?.message ?? '';
  if (reason.includes('INVALID_LINK')) return 'This link is no longer active. Ask the organizer for a new one.';
  if (reason.includes('SYNC_PAUSED')) return 'This round is finished or paused, so scores can no longer be entered.';
  if (reason.includes('HOST_SLOT')) return 'You are the organizer of this round. Keep score in the app.';
  if (reason.includes('ALREADY_APPROVED')) return 'You already have a spot in this round. Keep score from where you joined.';
  if (reason.includes('MEMBER_LIMIT')) return 'This round has reached its limit for web scorers. Ask the organizer.';
  if (reason.includes('HOST_REQUIRED')) return 'Only the organizer can do that.';
  if (reason.includes('LINK_LIMIT')) return 'This round already has the most links allowed. End the old ones first.';
  if (reason.includes('INVALID_MEMBER')) return 'That web scorer is no longer in the round.';
  if (reason.includes('INVALID_PLAYER')) return 'That player is not in a group yet. Ask the organizer.';
  if (error?.code === '42501') return 'The organizer removed web access for this round.';
  return 'Could not reach the round. Check your connection and try again.';
}

export function playerLinkApi(rpc: Rpc) {
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await rpc(name, args);
    if (error) throw Object.assign(Error(playerLinkMessage(error)), { code: error.code });
    return data;
  }
  return {
    async roster(token: string): Promise<LinkRoster> {
      if (!validPlayerToken(token)) throw Error(playerLinkMessage({ message: 'INVALID_LINK' }));
      return call('player_link_roster', { p_token: token });
    },
    async join(token: string, playerId: string): Promise<{ contest_id: string; player_id: string }> {
      if (!validPlayerToken(token)) throw Error(playerLinkMessage({ message: 'INVALID_LINK' }));
      return call('join_player_link', { p_token: token, p_player_id: playerId });
    },
    create: (contestId: string): Promise<string> => call('create_player_link', { contest_id: contestId }),
    revoke: (contestId: string) => call('revoke_player_links', { contest_id: contestId }),
    /** Spectator link: the live round, read-only. Needs no session. */
    async board(token: string): Promise<SyncSnapshotV1> {
      if (!validPlayerToken(token)) throw Error(playerLinkMessage({ message: 'INVALID_LINK' }));
      return call('spectator_board', { p_token: token });
    },
    createSpectator: (contestId: string): Promise<string> => call('create_spectator_link', { contest_id: contestId }),
    revokeSpectator: (contestId: string) => call('revoke_spectator_links', { contest_id: contestId }),
    /** Organizer only: who keeps which card on the web. */
    members: (contestId: string): Promise<LinkMember[]> => call('list_player_link_members', { contest_id: contestId }),
    assign: (contestId: string, memberId: string, playerId: string) => call('assign_player_link_member', { p_contest_id: contestId, p_member_id: memberId, p_player_id: playerId }),
    remove: (contestId: string, memberId: string) => call('revoke_membership', { contest_id: contestId, member_id: memberId }),
  };
}

type Round = SyncSnapshotV1['rounds'][number];
/** The card this guest keeps: the chosen player's group in the first round that still has an empty cell. */
export function groupCard(snapshot: SyncSnapshotV1, playerId: string): { round: Round; groupName: string; players: Round['players'] } | null {
  const mine = snapshot.rounds.filter(round => round.players.some(p => p.id === playerId && p.group_id));
  if (!mine.length) return null;
  const holes = (round: Round) => round.course.holes.length || 18;
  const group = (round: Round) => round.players.filter(p => p.group_id === round.players.find(q => q.id === playerId)!.group_id);
  const open = mine.find(round => group(round).some(p => p.cells.some(c => c.hole <= holes(round) && c.strokes === null)));
  const round = open ?? mine[mine.length - 1];
  const groupId = round.players.find(p => p.id === playerId)!.group_id;
  return { round, groupName: round.groups.find(g => g.id === groupId)?.name ?? 'Your group', players: group(round) };
}

/** First hole of the card nobody in the group has a score for; the last hole when the card is full. */
export function nextHole(card: { round: Round; players: Round['players'] }): number {
  const holes = card.round.course.holes.length || 18;
  for (let hole = 1; hole <= holes; hole++) if (card.players.some(p => (p.cells.find(c => c.hole === hole)?.strokes ?? null) === null)) return hole;
  return holes;
}

export interface BoardRow { id: string; name: string; strokes: number; toPar: number; thru: number }
/** Everyone in the round, best score to par first; players with no score yet go last. */
export function leaderboard(snapshot: SyncSnapshotV1): BoardRow[] {
  const rows = new Map<string, BoardRow>();
  for (const round of snapshot.rounds) for (const player of round.players) {
    const row = rows.get(player.id) ?? { id: player.id, name: player.displayName, strokes: 0, toPar: 0, thru: 0 };
    for (const cell of player.cells) if (cell.strokes) {
      row.strokes += cell.strokes; row.thru += 1;
      row.toPar += cell.strokes - (round.course.holes.find(h => h.num === cell.hole)?.par ?? 4);
    }
    rows.set(player.id, row);
  }
  return [...rows.values()].sort((a, b) => Number(b.thru > 0) - Number(a.thru > 0) || a.toPar - b.toPar || a.name.localeCompare(b.name));
}

export interface Money { pending: boolean; net: { name: string; amount: number }[]; payments: { from: string; to: string; amount: number }[] }
/** Standings and who owes whom, from the same engine the app settles with. One line per pair of players. */
export function money(snapshot: SyncSnapshotV1): Money {
  if (!snapshot.games?.length) return { pending: false, net: [], payments: [] };
  const result = calculateContestSettlement(restoreOwnerContest(snapshot));
  const net = Object.entries(result.netByPlayer).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  if (result.pending) return { pending: true, net: [], payments: [] };
  const payments = netPayments(result.transactions);
  return { pending: false, net, payments };
}

export const formatDollars = (amount: number) => `${amount < 0 ? '−' : ''}$${Math.abs(amount).toFixed(2)}`;

/** Where web guests go. Set per build; the public site is the default so a link is never dead. */
export function webOrigin(configured: string | undefined = process.env.EXPO_PUBLIC_WEB_URL, location: { origin?: string } | undefined = typeof window !== 'undefined' ? (window as { location?: { origin?: string } }).location : undefined): string {
  const origin = location?.origin && /^https?:\/\//.test(location.origin) ? location.origin : configured;
  return (origin && /^https?:\/\//.test(origin) ? origin : 'https://snapscore.autumn8.me').replace(/\/+$/, '');
}
/** /p/<token> is a player link (can score); /r/<token> is a spectator link (watch only). */
export const linkUrl = (origin: string, kind: 'player' | 'spectator', token: string) => `${origin.replace(/\/+$/, '')}/${kind === 'player' ? 'p' : 'r'}/${token}`;
