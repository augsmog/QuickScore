import {
  DELETED_PLAYER,
  anonymizeDisplayNames,
  matchesCallerName,
  replaceEmailText,
  scrubEmailValue,
  type AccountRepository,
} from "./purge.ts";

type Admin = { from: (table: string) => any };

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function ilikeExact(email: string): string {
  return email.replace(/[%_\\]/g, "\\$&");
}

/**
 * Service-role writes against the live schema.
 * score_events and contest_players.scores are the score stores.
 */
export function createSupabaseAccountRepository(admin: Admin): AccountRepository {
  return {
    async getProfile(userId) {
      const { data, error } = await admin.from("profiles").select("email, display_name, referral_code").eq("id", userId).maybeSingle();
      fail(error);
      return data ?? null;
    },
    async contestIdsFor(userId) {
      const ids = new Set<string>();
      const owned = await admin.from("contests").select("id").eq("owner_id", userId);
      fail(owned.error);
      const played = await admin.from("contest_players").select("contest_id").eq("user_id", userId);
      fail(played.error);
      const members = await admin.from("contest_memberships").select("contest_id").eq("user_id", userId);
      fail(members.error);
      const entered = await admin.from("score_events").select("contest_id").eq("entered_by", userId);
      fail(entered.error);
      const acted = await admin.from("score_events").select("contest_id").eq("actor", userId);
      fail(acted.error);
      const published = await admin.from("published_rounds").select("contest_id").eq("owner_id", userId);
      fail(published.error);
      for (const row of owned.data ?? []) ids.add(row.id);
      for (const row of played.data ?? []) ids.add(row.contest_id);
      for (const row of members.data ?? []) ids.add(row.contest_id);
      for (const row of entered.data ?? []) ids.add(row.contest_id);
      for (const row of acted.data ?? []) ids.add(row.contest_id);
      for (const row of published.data ?? []) ids.add(row.contest_id);
      return [...ids];
    },
    async getContestOwner(contestId) {
      const { data, error } = await admin.from("contests").select("owner_id").eq("id", contestId).maybeSingle();
      fail(error);
      return data?.owner_id ?? null;
    },
    async listPlayers(contestId) {
      const { data, error } = await admin.from("contest_players").select("id, contest_id, user_id, name, scores").eq("contest_id", contestId);
      fail(error);
      return data ?? [];
    },
    async listMemberUserIds(contestId) {
      const { data, error } = await admin.from("contest_memberships").select("user_id").eq("contest_id", contestId);
      fail(error);
      return (data ?? []).map((row: { user_id: string }) => row.user_id);
    },
    async deleteContest(contestId) {
      // Cascades contest_players, score_events, published_rounds, share_links,
      // round_messages, memberships, join requests, and receipts for this contest.
      const { error } = await admin.from("contests").delete().eq("id", contestId);
      fail(error);
    },
    async setContestOwner(contestId, ownerId) {
      const { error } = await admin.from("contests").update({ owner_id: ownerId }).eq("id", contestId);
      fail(error);
    },
    async setPublishedRoundOwner(contestId, fromUser, toUser) {
      const { error } = await admin.from("published_rounds").update({ owner_id: toUser }).eq("contest_id", contestId).eq("owner_id", fromUser);
      fail(error);
    },
    async anonymizeSnapshots(contestId, names) {
      const found = await admin.from("published_rounds").select("owner_id, local_id, snapshot").eq("contest_id", contestId);
      fail(found.error);
      for (const row of found.data ?? []) {
        const snapshot = anonymizeDisplayNames(row.snapshot, names);
        const updated = await admin
          .from("published_rounds")
          .update({ snapshot })
          .eq("contest_id", contestId)
          .eq("owner_id", row.owner_id)
          .eq("local_id", row.local_id);
        fail(updated.error);
      }
    },
    async anonymizeMessages(contestId, names) {
      const { data, error } = await admin.from("round_messages").select("id, display_name").eq("contest_id", contestId);
      fail(error);
      for (const row of data ?? []) {
        if (!matchesCallerName(row.display_name, names)) continue;
        const updated = await admin.from("round_messages").update({ display_name: DELETED_PLAYER }).eq("id", row.id);
        fail(updated.error);
      }
    },
    async anonymizePlayer(playerId) {
      // scores and putts are omitted so the shared round keeps them.
      const { error } = await admin.from("contest_players").update({ name: DELETED_PLAYER, user_id: null }).eq("id", playerId);
      fail(error);
    },
    async reassignScoreActor(contestId, fromUser, enteredBy) {
      const entered = await admin.from("score_events").update({ entered_by: enteredBy }).eq("contest_id", contestId).eq("entered_by", fromUser);
      fail(entered.error);
      const acted = await admin.from("score_events").update({ actor: null }).eq("contest_id", contestId).eq("actor", fromUser);
      fail(acted.error);
    },
    async deleteMembership(userId) {
      const { error } = await admin.from("contest_memberships").delete().eq("user_id", userId);
      fail(error);
    },
    async deleteJoinRequests(userId) {
      const { error } = await admin.from("contest_join_requests").delete().eq("requester", userId);
      fail(error);
    },
    async nullJoinDecider(userId) {
      const { error } = await admin.from("contest_join_requests").update({ decided_by: null }).eq("decided_by", userId);
      fail(error);
    },
    async deleteReceipts(userId) {
      const { error } = await admin.from("operation_receipts").delete().eq("actor", userId);
      fail(error);
    },
    async anonymizeSettlements(userId) {
      const scans = await admin.from("scans").select("id").eq("user_id", userId);
      fail(scans.error);
      const scanIds = (scans.data ?? []).map((row: { id: string }) => row.id);
      if (scanIds.length > 0) {
        const detached = await admin.from("settlements").update({ scan_id: null }).in("scan_id", scanIds);
        fail(detached.error);
      }
      const rows = await admin.from("settlements").select("id, from_user_id, to_user_id").or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      fail(rows.error);
      for (const row of rows.data ?? []) {
        const from = row.from_user_id === userId ? null : row.from_user_id;
        const to = row.to_user_id === userId ? null : row.to_user_id;
        if (from == null && to == null) {
          const removed = await admin.from("settlements").delete().eq("id", row.id);
          fail(removed.error);
        } else {
          const updated = await admin.from("settlements").update({ from_user_id: from, to_user_id: to }).eq("id", row.id);
          fail(updated.error);
        }
      }
    },
    async deleteScans(userId) {
      const { error } = await admin.from("scans").delete().eq("user_id", userId);
      fail(error);
    },
    async deleteMarketing(userId) {
      const { error } = await admin.from("marketing_events").delete().eq("user_id", userId);
      fail(error);
    },
    async scrubMarketingEmail(userId, email) {
      const filters = ["email", "referrer_email"] as const;
      const seen = new Set<string>();
      for (const field of filters) {
        const found = await admin.from("marketing_events").select("id, properties").filter(`properties->>${field}`, "eq", email);
        fail(found.error);
        for (const row of found.data ?? []) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          const properties = scrubEmailValue(row.properties, email, userId);
          const updated = await admin.from("marketing_events").update({ properties }).eq("id", row.id);
          fail(updated.error);
        }
      }
      const referred = await admin.from("marketing_events").select("id, properties").filter("properties->>referrer_id", "eq", userId);
      fail(referred.error);
      for (const row of referred.data ?? []) {
        if (seen.has(row.id)) continue;
        const properties = scrubEmailValue(row.properties, email, userId);
        const updated = await admin.from("marketing_events").update({ properties }).eq("id", row.id);
        fail(updated.error);
      }
    },
    async deleteFeedback(userId, email) {
      const byUser = await admin.from("feedback").delete().eq("user_id", userId);
      fail(byUser.error);
      if (!email) return;
      const byEmail = await admin.from("feedback").delete().ilike("user_email", ilikeExact(email));
      fail(byEmail.error);
    },
    async anonymizeRevenue(email) {
      const { data, error } = await admin.from("revenue_events").select("id, metadata").ilike("customer_email", ilikeExact(email));
      fail(error);
      for (const row of data ?? []) {
        const metadata = scrubEmailValue(row.metadata ?? {}, email, "");
        const updated = await admin.from("revenue_events").update({ customer_email: null, metadata }).eq("id", row.id);
        fail(updated.error);
      }
    },
    async scrubAutomation(email) {
      const pattern = `%${email.replace(/[%_\\]/g, "\\$&")}%`;
      const titled = await admin.from("automation_log").select("id, title, details").ilike("title", pattern);
      fail(titled.error);
      const detailed = await admin.from("automation_log").select("id, title, details").ilike("details", pattern);
      fail(detailed.error);
      const rows = new Map<string, { id: string; title: string; details: string | null }>();
      for (const row of [...(titled.data ?? []), ...(detailed.data ?? [])]) rows.set(row.id, row);
      for (const row of rows.values()) {
        const updated = await admin.from("automation_log").update({
          title: replaceEmailText(row.title, email),
          details: row.details ? replaceEmailText(row.details, email) : row.details,
        }).eq("id", row.id);
        fail(updated.error);
      }
    },
    async clearReferralReferences(referralCode) {
      const profiles = await admin.from("profiles").update({ referred_by: null }).eq("referred_by", referralCode);
      fail(profiles.error);
      const campaigns = await admin.from("marketing_events").update({ campaign: null }).eq("campaign", referralCode);
      fail(campaigns.error);
    },
    async deleteProfile(userId) {
      const { error } = await admin.from("profiles").delete().eq("id", userId);
      fail(error);
    },
  };
}
