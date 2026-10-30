/** Pure feature policy. Apply hosting checks only to host mutations, never guest scoring. */
export type Tier = 'free' | 'pro' | 'td';
export const ENTITLEMENT_ID = 'SnapScore Pro';
export const TD_ENTITLEMENT_ID = 'SnapScore TD';
export const FREE_GAMES = ['stroke_play', 'match_play', 'stableford', 'best_ball'] as const;
export function tierFromCustomerInfo(info: {entitlements: {active: Record<string, unknown>}}): Tier {
  return info.entitlements.active[TD_ENTITLEMENT_ID] !== undefined ? 'td' :
    info.entitlements.active[ENTITLEMENT_ID] !== undefined ? 'pro' : 'free';
}
export const canUseGame = (gameId: string, tier: Tier) => tier !== 'free' || (FREE_GAMES as readonly string[]).includes(gameId);
type HostDraft = {groups?: readonly {players?: readonly unknown[]; active?: boolean}[]; rounds?: readonly {groups?: readonly {players?: readonly unknown[]; active?: boolean}[]}[]; numGroups?: number; numRounds?: number};
const activeGroups = (groups: HostDraft['groups']) => groups?.filter(g => g.active !== false && (!g.players || g.players.length > 0)).length ?? 1;
export function canHostTournament(contest: HostDraft, tier: Tier): boolean {
  return tier === 'td' || ((contest.numGroups ?? activeGroups(contest.groups)) <= 1 &&
    (contest.numRounds ?? contest.rounds?.length ?? 1) <= 1 &&
    (contest.rounds ?? []).every(r => activeGroups(r.groups) <= 1));
}
/** #49: call immediately before host publish/share; guests never call this helper. */
export const canPublishHostedContest = canHostTournament;
export const canSeeSettlement = (tier: Tier) => tier !== 'free';
export const canSeeStats = canSeeSettlement;
export function scanAllowance(tier: Tier, now: Date) {
  return {limit: tier === 'free' ? 3 : Infinity, monthKey: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`};
}
