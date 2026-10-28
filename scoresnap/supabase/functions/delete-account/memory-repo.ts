import {
  DELETED_PLAYER,
  anonymizeDisplayNames,
  matchesCallerName,
  replaceEmailText,
  scrubEmailValue,
  scrubReferralText,
  type AccountRepository,
  type ContestPlayerRow,
} from "./purge.ts";

export interface AccountDb {
  profiles: { id: string; email: string | null; display_name: string | null; referral_code: string | null; referred_by: string | null }[];
  contests: { id: string; owner_id: string }[];
  contest_players: (ContestPlayerRow & { putts?: number[] })[];
  score_events: { id: string; contest_id: string; player_id: string; hole: number; strokes: number | null; entered_by: string; actor: string | null }[];
  contest_memberships: { contest_id: string; user_id: string; player_id?: string | null }[];
  contest_join_requests: { id: string; contest_id: string; requester: string; requested_name: string; decided_by: string | null }[];
  operation_receipts: { actor: string; op_id: string; contest_id: string }[];
  published_rounds: { contest_id: string; owner_id: string; local_id: string; snapshot: unknown }[];
  round_messages: { id: string; contest_id: string; display_name: string; body: string }[];
  share_links: { token_hash: string; contest_id: string }[];
  scans: { id: string; user_id: string | null }[];
  marketing_events: { id: string; user_id: string | null; campaign: string | null; properties: Record<string, unknown> }[];
  feedback: { id: string; user_id: string | null; user_email: string | null; raw_text: string }[];
  settlements: { id: string; from_user_id: string | null; to_user_id: string | null; scan_id: string | null; amount_cents: number }[];
  revenue_events: { id: string; customer_email: string | null; amount_cents: number; metadata: Record<string, unknown> }[];
  automation_log: { id: string; title: string; details: string | null }[];
  round_scorer_scopes: { contest_id: string; round_id: string; group_id: string; user_id: string }[];
  group_submissions: { contest_id: string; round_id: string; group_id: string; submitted_by: string }[];
  round_player_assignments: { contest_id: string; round_id: string; player_id: string; group_id: string }[];
  contest_groups: { id: string; contest_id: string; name: string }[];
  sync_id_map: { contest_id: string; kind: string; local_id: string; server_id: string }[];
}

function sameEmail(left: string | null | undefined, right: string): boolean {
  return !!left && left.toLowerCase() === right.toLowerCase();
}

/** In-memory stand-in for the live tables. deleteContest follows the live ON DELETE CASCADE edges. */
export function createMemoryAccountRepository(db: AccountDb): AccountRepository {
  return {
    async getProfile(userId) {
      const row = db.profiles.find((profile) => profile.id === userId);
      return row ? { email: row.email, display_name: row.display_name, referral_code: row.referral_code } : null;
    },
    async contestIdsFor(userId) {
      const ids = new Set<string>();
      for (const contest of db.contests) if (contest.owner_id === userId) ids.add(contest.id);
      for (const player of db.contest_players) if (player.user_id === userId) ids.add(player.contest_id);
      for (const member of db.contest_memberships) if (member.user_id === userId) ids.add(member.contest_id);
      for (const event of db.score_events) if (event.entered_by === userId || event.actor === userId) ids.add(event.contest_id);
      for (const round of db.published_rounds) if (round.owner_id === userId) ids.add(round.contest_id);
      for (const scope of db.round_scorer_scopes) if (scope.user_id === userId) ids.add(scope.contest_id);
      for (const submission of db.group_submissions) if (submission.submitted_by === userId) ids.add(submission.contest_id);
      return [...ids];
    },
    async getContestOwner(contestId) {
      return db.contests.find((contest) => contest.id === contestId)?.owner_id ?? null;
    },
    async listPlayers(contestId) {
      return db.contest_players.filter((player) => player.contest_id === contestId);
    },
    async listMemberships(contestId) {
      return db.contest_memberships
        .filter((member) => member.contest_id === contestId)
        .map((member) => ({ user_id: member.user_id, player_id: member.player_id ?? null }));
    },
    async deleteContest(contestId) {
      db.contests = db.contests.filter((contest) => contest.id !== contestId);
      db.contest_players = db.contest_players.filter((player) => player.contest_id !== contestId);
      db.score_events = db.score_events.filter((event) => event.contest_id !== contestId);
      db.contest_memberships = db.contest_memberships.filter((member) => member.contest_id !== contestId);
      db.contest_join_requests = db.contest_join_requests.filter((request) => request.contest_id !== contestId);
      db.operation_receipts = db.operation_receipts.filter((receipt) => receipt.contest_id !== contestId);
      db.published_rounds = db.published_rounds.filter((round) => round.contest_id !== contestId);
      db.round_messages = db.round_messages.filter((message) => message.contest_id !== contestId);
      db.share_links = db.share_links.filter((link) => link.contest_id !== contestId);
      db.round_scorer_scopes = db.round_scorer_scopes.filter((scope) => scope.contest_id !== contestId);
      db.group_submissions = db.group_submissions.filter((submission) => submission.contest_id !== contestId);
      db.round_player_assignments = db.round_player_assignments.filter((assignment) => assignment.contest_id !== contestId);
      db.contest_groups = db.contest_groups.filter((group) => group.contest_id !== contestId);
      db.sync_id_map = db.sync_id_map.filter((row) => row.contest_id !== contestId);
    },
    async setContestOwner(contestId, ownerId) {
      const contest = db.contests.find((row) => row.id === contestId);
      if (contest) contest.owner_id = ownerId;
    },
    async setPublishedRoundOwner(contestId, fromUser, toUser) {
      for (const round of db.published_rounds) {
        if (round.contest_id === contestId && round.owner_id === fromUser) round.owner_id = toUser;
      }
    },
    async anonymizeSnapshots(contestId, names) {
      for (const round of db.published_rounds) {
        if (round.contest_id === contestId) round.snapshot = anonymizeDisplayNames(round.snapshot, names);
      }
    },
    async anonymizeMessages(contestId, names) {
      for (const message of db.round_messages) {
        if (message.contest_id === contestId && matchesCallerName(message.display_name, names)) {
          message.display_name = DELETED_PLAYER;
        }
      }
    },
    async anonymizePlayer(playerId) {
      const player = db.contest_players.find((row) => row.id === playerId);
      if (!player) return;
      player.name = DELETED_PLAYER;
      player.user_id = null;
    },
    async reassignScoreActor(contestId, fromUser, enteredBy) {
      for (const event of db.score_events) {
        if (event.contest_id !== contestId) continue;
        if (event.entered_by === fromUser) event.entered_by = enteredBy;
        if (event.actor === fromUser) event.actor = null;
      }
    },
    async deleteMembership(userId) {
      db.contest_memberships = db.contest_memberships.filter((member) => member.user_id !== userId);
    },
    async deleteJoinRequests(userId) {
      db.contest_join_requests = db.contest_join_requests.filter((request) => request.requester !== userId);
    },
    async nullJoinDecider(userId) {
      for (const request of db.contest_join_requests) {
        if (request.decided_by === userId) request.decided_by = null;
      }
    },
    async deleteReceipts(userId) {
      db.operation_receipts = db.operation_receipts.filter((receipt) => receipt.actor !== userId);
    },
    async anonymizeSettlements(userId) {
      const scanIds = new Set(db.scans.filter((scan) => scan.user_id === userId).map((scan) => scan.id));
      db.settlements = db.settlements.flatMap((row) => {
        const next = { ...row };
        let changed = false;
        if (next.from_user_id === userId) {
          next.from_user_id = null;
          changed = true;
        }
        if (next.to_user_id === userId) {
          next.to_user_id = null;
          changed = true;
        }
        if (next.scan_id && scanIds.has(next.scan_id)) {
          next.scan_id = null;
          changed = true;
        }
        if (!changed) return [row];
        if (next.from_user_id == null && next.to_user_id == null) return [];
        return [next];
      });
    },
    async deleteScans(userId) {
      db.scans = db.scans.filter((scan) => scan.user_id !== userId);
    },
    async deleteMarketing(userId) {
      db.marketing_events = db.marketing_events.filter((event) => event.user_id !== userId);
    },
    async scrubMarketingEmail(userId, email) {
      for (const event of db.marketing_events) {
        event.properties = scrubEmailValue(event.properties, email, userId) as Record<string, unknown>;
      }
    },
    async deleteFeedback(userId, email) {
      db.feedback = db.feedback.filter((row) => row.user_id !== userId && !(email && sameEmail(row.user_email, email)));
    },
    async anonymizeRevenue(email) {
      for (const event of db.revenue_events) {
        if (!sameEmail(event.customer_email, email)) continue;
        event.customer_email = null;
        event.metadata = scrubEmailValue(event.metadata, email, "") as Record<string, unknown>;
      }
    },
    async scrubAutomation(email) {
      for (const row of db.automation_log) {
        row.title = replaceEmailText(row.title, email);
        if (row.details) row.details = replaceEmailText(row.details, email);
      }
    },
    async clearReferralReferences(referralCode) {
      for (const profile of db.profiles) {
        if (profile.referred_by === referralCode) profile.referred_by = null;
      }
      for (const event of db.marketing_events) {
        if (event.campaign === referralCode) event.campaign = null;
        if (event.properties.referred_by === referralCode) event.properties.referred_by = null;
        if (event.properties.referral_code === referralCode) event.properties.referral_code = null;
      }
      for (const row of db.automation_log) {
        row.title = scrubReferralText(row.title, referralCode);
        if (row.details) row.details = scrubReferralText(row.details, referralCode);
      }
    },
    async deleteScorerScopes(userId) {
      db.round_scorer_scopes = db.round_scorer_scopes.filter((scope) => scope.user_id !== userId);
    },
    async reassignGroupSubmissions(userId) {
      for (const submission of db.group_submissions) {
        if (submission.submitted_by !== userId) continue;
        const owner = db.contests.find((contest) => contest.id === submission.contest_id)?.owner_id;
        if (owner && owner !== userId) submission.submitted_by = owner;
      }
    },
    async deleteProfile(userId) {
      db.profiles = db.profiles.filter((profile) => profile.id !== userId);
    },
  };
}
