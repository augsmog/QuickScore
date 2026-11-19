/** Pure feature policy. Apply hosting checks only to host mutations, never guest scoring. */
export type Tier = 'free' | 'pro' | 'td';
export const ENTITLEMENT_ID = 'SnapScore Pro';
export const TD_ENTITLEMENT_ID = 'SnapScore TD';
export const FREE_GAMES = ['stroke_play', 'match_play', 'stableford', 'best_ball'] as const;

/**
 * Reversible paid-membership switch (AUG-817, owner direction t1237u Nov 9 2026): temporarily
 * remove SnapScore Pro membership and make those features free, behind a flag so Pro can be
 * switched back on later. Default OFF: Pro is dormant.
 *
 * The flag lives here as a single mutable seam so a source — today the build-time
 * EXPO_PUBLIC_PRO_ENABLED env, tomorrow a remote source (RevenueCat offering metadata / a small
 * remote JSON) — can set it via setProEnabled() without a rewrite. The env read is kept OUT of
 * this pure policy module (it is imported by the engine graph) and lives in
 * src/config/pro-membership.ts, which calls setProEnabled() once at app startup. The default of
 * false is exactly the shipped (flag-off) behavior, so gating is correct even before startup wiring
 * runs. Turning it on again also requires re-adding the Pro products in App Store Connect — the
 * flag alone is not enough if those products are gone.
 */
let proMembershipEnabled = false;
export const setProEnabled = (value: boolean): void => { proMembershipEnabled = value; };
export const proEnabled = (): boolean => proMembershipEnabled;
/**
 * Effective entitlement a given subscription state grants right now. The single policy chokepoint:
 * every gate helper below resolves through it, so there is no per-screen special case. When Pro is
 * dormant, resolve to 'td' so Pro AND TD features are free and no paywall (Pro or TD) can appear;
 * when enabled, the raw subscription tier passes through unchanged. tierFromCustomerInfo() stays
 * raw on purpose so purchase/restore keep reflecting the real App Store entitlement.
 */
export const resolveTier = (tier: Tier): Tier => (proEnabled() ? tier : 'td');

export function tierFromCustomerInfo(info: {entitlements: {active: Record<string, unknown>}}): Tier {
  return info.entitlements.active[TD_ENTITLEMENT_ID] !== undefined ? 'td' :
    info.entitlements.active[ENTITLEMENT_ID] !== undefined ? 'pro' : 'free';
}
export const canUseGame = (gameId: string, tier: Tier) => {
  const t = resolveTier(tier);
  return t !== 'free' || (FREE_GAMES as readonly string[]).includes(gameId);
};
type HostDraft = {groups?: readonly {players?: readonly unknown[]; active?: boolean}[]; rounds?: readonly {groups?: readonly {players?: readonly unknown[]; active?: boolean}[]}[]; numGroups?: number; numRounds?: number};
const activeGroups = (groups: HostDraft['groups']) => groups?.filter(g => g.active !== false && (!g.players || g.players.length > 0)).length ?? 1;
export function canHostTournament(contest: HostDraft, tier: Tier): boolean {
  const t = resolveTier(tier);
  return t === 'td' || ((contest.numGroups ?? activeGroups(contest.groups)) <= 1 &&
    (contest.numRounds ?? contest.rounds?.length ?? 1) <= 1 &&
    (contest.rounds ?? []).every(r => activeGroups(r.groups) <= 1));
}
/** #49: call immediately before host publish/share; guests never call this helper. */
export const canPublishHostedContest = canHostTournament;
export const canSeeSettlement = (tier: Tier) => resolveTier(tier) !== 'free';
export const canSeeStats = canSeeSettlement;
export function scanAllowance(tier: Tier, now: Date) {
  return {limit: resolveTier(tier) === 'free' ? 3 : Infinity, monthKey: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`};
}

/** Automatic round creation must not silently add a locked game. */
export const defaultRoundGames = (tier: Tier): ('stroke_play' | 'skins')[] => resolveTier(tier) === 'free' ? ['stroke_play'] : ['stroke_play', 'skins'];
