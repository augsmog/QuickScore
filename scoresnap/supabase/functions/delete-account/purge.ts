export const DELETED_PLAYER = "Deleted player";

export interface ContestPlayerRow {
  id: string;
  contest_id: string;
  user_id: string | null;
  name: string;
  scores: number[];
}

export interface ContestMembershipRow {
  user_id: string;
  player_id: string | null;
}

export interface AccountRepository {
  getProfile(userId: string): Promise<{ email: string | null; display_name: string | null; referral_code: string | null } | null>;
  contestIdsFor(userId: string): Promise<string[]>;
  getContestOwner(contestId: string): Promise<string | null>;
  listPlayers(contestId: string): Promise<ContestPlayerRow[]>;
  listMemberships(contestId: string): Promise<ContestMembershipRow[]>;
  deleteContest(contestId: string): Promise<void>;
  setContestOwner(contestId: string, ownerId: string): Promise<void>;
  setPublishedRoundOwner(contestId: string, fromUser: string, toUser: string): Promise<void>;
  anonymizeSnapshots(contestId: string, names: string[]): Promise<void>;
  anonymizeMessages(contestId: string, names: string[]): Promise<void>;
  anonymizePlayer(playerId: string): Promise<void>;
  reassignScoreActor(contestId: string, fromUser: string, enteredBy: string): Promise<void>;
  deleteMembership(userId: string): Promise<void>;
  deleteJoinRequests(userId: string): Promise<void>;
  nullJoinDecider(userId: string): Promise<void>;
  deleteReceipts(userId: string): Promise<void>;
  anonymizeSettlements(userId: string): Promise<void>;
  deleteScans(userId: string): Promise<void>;
  deleteMarketing(userId: string): Promise<void>;
  scrubMarketingEmail(userId: string, email: string): Promise<void>;
  deleteFeedback(userId: string, email: string | null): Promise<void>;
  anonymizeRevenue(email: string): Promise<void>;
  scrubAutomation(email: string): Promise<void>;
  /**
   * Remove this referral code from other profiles.referred_by, marketing campaign,
   * marketing properties.referred_by and properties.referral_code, and automation_log
   * "Referral:" / "Code:" text.
   */
  clearReferralReferences(referralCode: string): Promise<void>;
  /** round_scorer_scopes.user_id has no ON DELETE, so the auth user cannot go until these rows do. */
  deleteScorerScopes(userId: string): Promise<void>;
  /** group_submissions.submitted_by is NOT NULL. Point it at the contest owner after ownership moves. */
  reassignGroupSubmissions(userId: string): Promise<void>;
  deleteProfile(userId: string): Promise<void>;
}

/** The shared-round publisher stores player names as trim().slice(0, 80). */
export function publishedName(name: string): string {
  return name.trim().slice(0, 80);
}

function publishedTargets(names: readonly string[]): Set<string> {
  const targets = new Set<string>();
  for (const name of names) {
    const published = publishedName(name);
    if (published && published !== DELETED_PLAYER) targets.add(published);
  }
  return targets;
}

/** True when the stored label and a caller name are the same after the publisher's cut. */
export function matchesCallerName(stored: string, names: readonly string[]): boolean {
  const published = publishedName(stored);
  return published.length > 0 && published !== DELETED_PLAYER && publishedTargets(names).has(published);
}

export function anonymizeDisplayNames(snapshot: unknown, names: readonly string[]): unknown {
  const targets = publishedTargets(names);
  if (targets.size === 0 || snapshot == null) return snapshot;
  const copy = structuredClone(snapshot);
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.displayName === "string" && targets.has(publishedName(record.displayName))) {
      record.displayName = DELETED_PLAYER;
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(copy);
  return copy;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Roster rows whose name should become "Deleted player".
 * A row matches when contest_players.user_id is the caller, or when the caller's
 * membership player_id points at it after decide_join_request clears user_id.
 * A guest name the owner typed has a null user_id and no membership, so it stays.
 * The host slot is the roster row sync_round_bundle stamps with the owner's user_id.
 */
export function callerRosterIds(
  players: readonly ContestPlayerRow[],
  memberships: readonly ContestMembershipRow[],
  userId: string,
): string[] {
  const ids = new Set<string>();
  for (const member of memberships) {
    if (member.user_id !== userId || !member.player_id) continue;
    const player = players.find((row) => row.id === member.player_id);
    if (player && (player.user_id === userId || player.user_id == null)) ids.add(player.id);
  }
  for (const player of players) {
    if (player.user_id === userId) ids.add(player.id);
  }
  return [...ids];
}

/**
 * Replace a Referral: or Code: value only when the whole following token equals
 * this code. The code may be any length or format. A longer token that merely
 * starts with it stays.
 */
export function scrubReferralText(text: string, code: string): string {
  if (!code) return text;
  return text.replace(/(Referral|Code):[ \t]*([^\s|]+)/g, (match, label: string, token: string) => {
    const cleaned = token.replace(/[,;]+$/, "");
    if (cleaned !== code) return match;
    return `${label}: [deleted]${token.slice(cleaned.length)}`;
  });
}

/** Replace the account email without eating a longer address that merely ends with it. */
export function replaceEmailText(text: string, email: string): string {
  const escaped = escapeRegExp(email);
  return text.replace(new RegExp(`(^|[^A-Z0-9._%+-])${escaped}(?=$|[^A-Z0-9._%+-])`, "ig"), "$1[deleted]");
}

export function scrubEmailValue(value: unknown, email: string, userId: string): unknown {
  if (typeof value === "string") return replaceEmailText(value, email);
  if (Array.isArray(value)) return value.map((item) => scrubEmailValue(item, email, userId));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "referrer_id" || key === "user_id") && child === userId) out[key] = null;
      else out[key] = scrubEmailValue(child, email, userId);
    }
    return out;
  }
  return value;
}

/**
 * Delete the caller's private rows and anonymize names on rounds other people
 * still need. Contest ownership can only move to another auth user: owner_id
 * is NOT NULL and references auth.users. A contest with no other account is
 * deleted, which cascades its players, score_events, and published round.
 * contest_players.scores and surviving score_events.strokes are kept.
 * Scores stay on score_events and contest_players. round_scorer_scopes.user_id is
 * removed. group_submissions.submitted_by moves to the contest owner.
 * contest_groups, round_player_assignments, and sync_id_map have no auth user id.
 */
export async function purgeAccount(repo: AccountRepository, userId: string): Promise<void> {
  const profile = await repo.getProfile(userId);
  const email = profile?.email ?? null;
  const referralCode = profile?.referral_code || null;
  const contestIds = await repo.contestIdsFor(userId);
  for (const contestId of contestIds) {
    const ownerId = await repo.getContestOwner(contestId);
    if (!ownerId) continue;
    const players = await repo.listPlayers(contestId);
    const memberships = await repo.listMemberships(contestId);
    const otherAccounts = new Set<string>();
    for (const member of memberships) if (member.user_id && member.user_id !== userId) otherAccounts.add(member.user_id);
    for (const player of players) if (player.user_id && player.user_id !== userId) otherAccounts.add(player.user_id);
    const owns = ownerId === userId;
    const successor = [...otherAccounts].sort()[0];
    if (owns && !successor) {
      await repo.deleteContest(contestId);
      continue;
    }
    if (owns && successor) {
      await repo.setContestOwner(contestId, successor);
      await repo.setPublishedRoundOwner(contestId, userId, successor);
    } else {
      await repo.setPublishedRoundOwner(contestId, userId, ownerId);
    }
    const rosterIds = new Set(callerRosterIds(players, memberships, userId));
    const names = players.filter((player) => rosterIds.has(player.id)).map((player) => player.name);
    await repo.anonymizeSnapshots(contestId, names);
    await repo.anonymizeMessages(contestId, names);
    for (const playerId of rosterIds) await repo.anonymizePlayer(playerId);
    await repo.reassignScoreActor(contestId, userId, owns ? successor! : ownerId);
  }
  await repo.deleteScorerScopes(userId);
  await repo.reassignGroupSubmissions(userId);
  await repo.deleteMembership(userId);
  await repo.deleteJoinRequests(userId);
  await repo.nullJoinDecider(userId);
  await repo.deleteReceipts(userId);
  await repo.anonymizeSettlements(userId);
  await repo.deleteScans(userId);
  await repo.deleteMarketing(userId);
  if (email) await repo.scrubMarketingEmail(userId, email);
  await repo.deleteFeedback(userId, email);
  if (email) {
    await repo.anonymizeRevenue(email);
    await repo.scrubAutomation(email);
  }
  if (referralCode) await repo.clearReferralReferences(referralCode);
  await repo.deleteProfile(userId);
}
