export const DELETED_PLAYER = "Deleted player";

export interface ContestPlayerRow {
  id: string;
  contest_id: string;
  user_id: string | null;
  name: string;
  scores: number[];
}

export interface AccountRepository {
  getProfile(userId: string): Promise<{ email: string | null; display_name: string | null; referral_code: string | null } | null>;
  contestIdsFor(userId: string): Promise<string[]>;
  getContestOwner(contestId: string): Promise<string | null>;
  listPlayers(contestId: string): Promise<ContestPlayerRow[]>;
  listMemberUserIds(contestId: string): Promise<string[]>;
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
  /** Null other profiles.referred_by and marketing_events.campaign that store this referral code. */
  clearReferralReferences(referralCode: string): Promise<void>;
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
 * Live schema only: score_events plus the scores stored on contest_players.
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
    const memberIds = await repo.listMemberUserIds(contestId);
    const otherAccounts = new Set<string>();
    for (const id of memberIds) if (id && id !== userId) otherAccounts.add(id);
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
    const names = players.filter((player) => player.user_id === userId).map((player) => player.name);
    await repo.anonymizeSnapshots(contestId, names);
    await repo.anonymizeMessages(contestId, names);
    for (const player of players) {
      if (player.user_id === userId) await repo.anonymizePlayer(player.id);
    }
    await repo.reassignScoreActor(contestId, userId, owns ? successor! : ownerId);
  }
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
