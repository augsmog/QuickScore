/**
 * Independent checks for PR #33 at dc11b519.
 * These are not the PR's own tests. They drive the delete-account handler
 * and purge against an in-memory admin stand-in, and the Stripe handler
 * against the Stripe SDK's constructEventAsync.
 *
 * Run from the repo root:
 *   node --import tsx verify/pr33-independent-checks.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { handleDeleteAccount } from "../scoresnap/supabase/functions/delete-account/handler.ts";
import {
  createMemoryAccountRepository,
  type AccountDb,
} from "../scoresnap/supabase/functions/delete-account/memory-repo.ts";
import {
  DELETED_PLAYER,
  anonymizeDisplayNames,
  purgeAccount,
} from "../scoresnap/supabase/functions/delete-account/purge.ts";
import { handleStripeWebhook } from "../scoresnap/supabase/functions/stripe-webhook/handler.ts";
import { scrubSentryEvent, sentryReplayMask, sentrySendDefaultPii } from "../scoresnap/src/config/sentry-privacy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scoresnap = path.join(root, "scoresnap");

const CALLER = "11111111-1111-4111-8111-111111111111";
const VICTIM = "22222222-2222-4222-8222-222222222222";
const PADDED_NAME = " Augie ";
const PUBLISHED_PADDED = PADDED_NAME.trim().slice(0, 80);
const LONG_NAME = "N".repeat(81);
const PUBLISHED_LONG = LONG_NAME.trim().slice(0, 80);

function read(rel: string): string {
  return fs.readFileSync(path.join(scoresnap, rel), "utf8");
}

function emptyDb(): AccountDb {
  return {
    profiles: [],
    contests: [],
    contest_players: [],
    score_events: [],
    contest_memberships: [],
    contest_join_requests: [],
    operation_receipts: [],
    published_rounds: [],
    round_messages: [],
    share_links: [],
    scans: [],
    marketing_events: [],
    feedback: [],
    settlements: [],
    revenue_events: [],
    automation_log: [],
  };
}

function callerIds(db: AccountDb): string[] {
  const ids: string[] = [];
  for (const row of db.profiles) if (row.id === CALLER) ids.push("profiles.id");
  for (const row of db.contests) if (row.owner_id === CALLER) ids.push("contests.owner_id");
  for (const row of db.contest_players) if (row.user_id === CALLER) ids.push("contest_players.user_id");
  for (const row of db.score_events) {
    if (row.entered_by === CALLER) ids.push("score_events.entered_by");
    if (row.actor === CALLER) ids.push("score_events.actor");
  }
  for (const row of db.contest_memberships) if (row.user_id === CALLER) ids.push("contest_memberships.user_id");
  for (const row of db.contest_join_requests) {
    if (row.requester === CALLER) ids.push("contest_join_requests.requester");
    if (row.decided_by === CALLER) ids.push("contest_join_requests.decided_by");
  }
  for (const row of db.operation_receipts) if (row.actor === CALLER) ids.push("operation_receipts.actor");
  for (const row of db.published_rounds) if (row.owner_id === CALLER) ids.push("published_rounds.owner_id");
  for (const row of db.scans) if (row.user_id === CALLER) ids.push("scans.user_id");
  for (const row of db.marketing_events) if (row.user_id === CALLER) ids.push("marketing_events.user_id");
  for (const row of db.feedback) if (row.user_id === CALLER) ids.push("feedback.user_id");
  for (const row of db.settlements) {
    if (row.from_user_id === CALLER) ids.push("settlements.from_user_id");
    if (row.to_user_id === CALLER) ids.push("settlements.to_user_id");
  }
  return ids;
}

async function jwtIsolation(): Promise<void> {
  const purged: string[] = [];
  const deletedAuth: string[] = [];
  const deps = {
    getUser: async (token: string) => (token === "caller-token" ? { id: CALLER } : null),
    purge: async (userId: string) => {
      purged.push(userId);
    },
    deleteAuthUser: async (userId: string) => {
      deletedAuth.push(userId);
    },
  };

  const authed = await handleDeleteAccount(
    new Request(`https://app.test/delete-account?userId=${VICTIM}&sub=${VICTIM}`, {
      method: "POST",
      headers: { authorization: "Bearer caller-token", "content-type": "application/json" },
      body: JSON.stringify({ userId: VICTIM, user_id: VICTIM, sub: VICTIM }),
    }),
    deps,
  );
  assert.equal(authed.status, 200);
  assert.deepEqual(purged, [CALLER]);
  assert.deepEqual(deletedAuth, [CALLER]);

  const noHeader = await handleDeleteAccount(
    new Request(`https://app.test/delete-account?userId=${VICTIM}`, {
      method: "POST",
      body: JSON.stringify({ userId: VICTIM }),
    }),
    deps,
  );
  assert.equal(noHeader.status, 401);
  assert.deepEqual(purged, [CALLER]);

  const emptyBearer = await handleDeleteAccount(
    new Request("https://app.test/delete-account", {
      method: "POST",
      headers: { authorization: "Bearer   " },
      body: JSON.stringify({ userId: VICTIM }),
    }),
    deps,
  );
  assert.equal(emptyBearer.status, 401);

  const nonUuid = await handleDeleteAccount(
    new Request("https://app.test/delete-account", {
      method: "POST",
      headers: { authorization: "Bearer other-token" },
    }),
    {
      getUser: async () => ({ id: VICTIM + "-not-a-uuid" }),
      purge: async () => {
        throw new Error("purge must not run");
      },
      deleteAuthUser: async () => {
        throw new Error("deleteUser must not run");
      },
    },
  );
  assert.equal(nonUuid.status, 401);

  const unknown = await handleDeleteAccount(
    new Request("https://app.test/delete-account", {
      method: "POST",
      headers: { authorization: "Bearer other-token" },
      body: JSON.stringify({ userId: CALLER }),
    }),
    deps,
  );
  assert.equal(unknown.status, 401);
  assert.deepEqual(purged, [CALLER]);
}

async function otherUserUntouchedAndNameLeak(): Promise<void> {
  const db = emptyDb();
  db.profiles.push(
    { id: CALLER, email: "augie@example.com", display_name: "Augie" },
    { id: VICTIM, email: "blair@example.com", display_name: "Blair" },
  );
  db.contests.push(
    { id: "contest-shared", owner_id: CALLER },
    { id: "contest-victim", owner_id: VICTIM },
  );
  db.contest_players.push(
    { id: "player-caller", contest_id: "contest-shared", user_id: CALLER, name: PADDED_NAME, scores: [4, 5] },
    { id: "player-victim", contest_id: "contest-shared", user_id: VICTIM, name: "Blair", scores: [3, 4] },
    { id: "player-victim-private", contest_id: "contest-victim", user_id: VICTIM, name: "Blair", scores: [2] },
  );
  db.score_events.push(
    { id: "score-caller", contest_id: "contest-shared", player_id: "player-caller", hole: 1, strokes: 4, entered_by: CALLER, actor: CALLER },
    { id: "score-victim", contest_id: "contest-shared", player_id: "player-victim", hole: 1, strokes: 3, entered_by: VICTIM, actor: VICTIM },
    { id: "score-private", contest_id: "contest-victim", player_id: "player-victim-private", hole: 1, strokes: 2, entered_by: VICTIM, actor: null },
  );
  db.contest_memberships.push(
    { contest_id: "contest-shared", user_id: CALLER },
    { contest_id: "contest-shared", user_id: VICTIM },
    { contest_id: "contest-victim", user_id: VICTIM },
  );
  db.contest_join_requests.push(
    { id: "join-caller", contest_id: "contest-shared", requester: CALLER, requested_name: PADDED_NAME, decided_by: VICTIM },
    { id: "join-victim", contest_id: "contest-victim", requester: VICTIM, requested_name: "Blair", decided_by: CALLER },
  );
  db.operation_receipts.push(
    { actor: CALLER, op_id: "op-caller", contest_id: "contest-shared" },
    { actor: VICTIM, op_id: "op-victim", contest_id: "contest-victim" },
  );
  db.published_rounds.push({
    contest_id: "contest-shared",
    owner_id: CALLER,
    local_id: "local-1",
    snapshot: {
      players: [
        { displayName: PUBLISHED_PADDED, scores: [4, 5] },
        { displayName: "Blair", scores: [3, 4] },
        { displayName: PUBLISHED_LONG, scores: [1] },
      ],
      games: [{ standings: [{ displayName: PUBLISHED_PADDED, units: 1 }, { displayName: "Blair", units: 2 }] }],
    },
  });
  db.round_messages.push(
    { id: "msg-exact-raw", contest_id: "contest-shared", display_name: PADDED_NAME, body: "nice shot" },
    { id: "msg-published", contest_id: "contest-shared", display_name: PUBLISHED_PADDED, body: "still here" },
    { id: "msg-victim", contest_id: "contest-shared", display_name: "Blair", body: "blair message" },
  );
  db.scans.push(
    { id: "scan-caller", user_id: CALLER },
    { id: "scan-victim", user_id: VICTIM },
  );
  db.settlements.push(
    { id: "settle-pair", from_user_id: CALLER, to_user_id: VICTIM, scan_id: "scan-caller", amount_cents: 500 },
    { id: "settle-victim", from_user_id: VICTIM, to_user_id: null, scan_id: "scan-victim", amount_cents: 100 },
  );
  db.marketing_events.push({
    id: "mkt-victim",
    user_id: VICTIM,
    properties: { email: "blair@example.com", referrer_email: "augie@example.com", referrer_id: CALLER },
  });
  db.feedback.push({ id: "fb-victim", user_id: VICTIM, user_email: "blair@example.com", raw_text: "fine" });

  const direct = anonymizeDisplayNames(
    {
      players: [{ displayName: PUBLISHED_PADDED }, { displayName: PUBLISHED_LONG }, { displayName: "Casey" }],
    },
    [PADDED_NAME, LONG_NAME, "Casey"],
  ) as { players: { displayName: string }[] };
  assert.equal(direct.players[0].displayName, "Augie", "trimmed snapshot name is not the stored player name");
  assert.equal(direct.players[1].displayName, "N".repeat(80), "80-char snapshot name is not the 81-char player name");
  assert.equal(direct.players[2].displayName, DELETED_PLAYER);

  await purgeAccount(createMemoryAccountRepository(db), CALLER);

  assert.deepEqual(callerIds(db), [], "caller id remains on an auth.users foreign key");
  assert.equal(db.contests.find((row) => row.id === "contest-shared")?.owner_id, VICTIM);
  assert.equal(db.contests.find((row) => row.id === "contest-victim")?.owner_id, VICTIM);
  assert.equal(db.contest_players.find((row) => row.id === "player-caller")?.user_id, null);
  assert.equal(db.contest_players.find((row) => row.id === "player-caller")?.name, DELETED_PLAYER);
  assert.deepEqual(db.contest_players.find((row) => row.id === "player-caller")?.scores, [4, 5]);
  assert.equal(db.contest_players.find((row) => row.id === "player-victim")?.name, "Blair");
  assert.equal(db.contest_players.find((row) => row.id === "player-victim-private")?.user_id, VICTIM);
  assert.equal(db.score_events.find((row) => row.id === "score-caller")?.entered_by, VICTIM);
  assert.equal(db.score_events.find((row) => row.id === "score-caller")?.actor, null);
  assert.equal(db.score_events.find((row) => row.id === "score-caller")?.strokes, 4);
  assert.equal(db.score_events.find((row) => row.id === "score-victim")?.entered_by, VICTIM);
  assert.equal(db.score_events.find((row) => row.id === "score-private")?.strokes, 2);
  assert.equal(db.scans.find((row) => row.id === "scan-victim")?.user_id, VICTIM);
  assert.equal(db.scans.some((row) => row.id === "scan-caller"), false);
  assert.equal(db.profiles.some((row) => row.id === VICTIM), true);
  assert.equal(db.profiles.some((row) => row.id === CALLER), false);
  assert.equal(db.feedback.find((row) => row.id === "fb-victim")?.raw_text, "fine");
  assert.equal(db.operation_receipts.some((row) => row.actor === VICTIM), true);
  assert.equal(db.contest_memberships.some((row) => row.user_id === VICTIM && row.contest_id === "contest-victim"), true);
  assert.equal(db.contest_join_requests.some((row) => row.id === "join-caller"), false);
  assert.equal(db.contest_join_requests.find((row) => row.id === "join-victim")?.decided_by, null);
  assert.equal(db.contest_join_requests.find((row) => row.id === "join-victim")?.requested_name, "Blair");
  assert.equal(db.settlements.find((row) => row.id === "settle-pair")?.from_user_id, null);
  assert.equal(db.settlements.find((row) => row.id === "settle-pair")?.to_user_id, VICTIM);
  assert.equal(db.settlements.find((row) => row.id === "settle-pair")?.amount_cents, 500);
  assert.equal(db.settlements.find((row) => row.id === "settle-victim")?.scan_id, "scan-victim");

  const snapshot = db.published_rounds[0].snapshot as {
    players: { displayName: string }[];
    games: { standings: { displayName: string }[] }[];
  };
  assert.equal(snapshot.players[0].displayName, "Augie");
  assert.equal(snapshot.players[1].displayName, "Blair");
  assert.equal(snapshot.players[2].displayName, PUBLISHED_LONG);
  assert.equal(snapshot.games[0].standings[0].displayName, "Augie");
  assert.equal(snapshot.games[0].standings[1].displayName, "Blair");
  assert.equal(db.round_messages.find((row) => row.id === "msg-exact-raw")?.display_name, DELETED_PLAYER);
  assert.equal(db.round_messages.find((row) => row.id === "msg-exact-raw")?.body, "nice shot");
  assert.equal(db.round_messages.find((row) => row.id === "msg-published")?.display_name, "Augie");
  assert.equal(db.round_messages.find((row) => row.id === "msg-victim")?.display_name, "Blair");
  assert.equal(
    (db.marketing_events[0].properties as { referrer_id: string | null }).referrer_id,
    null,
  );
}

function sentryAndStripeSource(): void {
  assert.equal(sentrySendDefaultPii, false);
  assert.deepEqual(sentryReplayMask, { maskAllText: true, maskAllImages: true, maskAllVectors: true });
  const scrubbed = scrubSentryEvent({
    user: { id: CALLER, email: "augie@example.com", username: "augie", name: "Augie", ip_address: "203.0.113.8" },
  });
  assert.deepEqual(scrubbed.user, { id: CALLER });
  const dropped = scrubSentryEvent({ user: { email: "augie@example.com" } });
  assert.equal("user" in dropped, false);

  const layout = read("app/_layout.tsx");
  assert.match(layout, /assertNoDefaultPii\(sentrySendDefaultPii\)/);
  assert.match(layout, /assertReplayMask\(sentryReplayMask\)/);
  assert.match(layout, /sendDefaultPii:\s*sentrySendDefaultPii/);
  assert.match(layout, /mobileReplayIntegration\(sentryReplayMask\)/);
  assert.doesNotMatch(layout, /Sentry\.setUser/);
  assert.doesNotMatch(read("src/config/sentry-privacy.ts"), /sendDefaultPii\s*=\s*true/);

  const webhook = read("supabase/functions/stripe-webhook/index.ts");
  const handler = read("supabase/functions/stripe-webhook/handler.ts");
  assert.match(handler, /await req\.text\(\)/);
  assert.match(webhook, /constructEventAsync/);
  assert.doesNotMatch(webhook, /JSON\.parse/);
  assert.doesNotMatch(webhook, /whsec_/);
  assert.doesNotMatch(webhook, /sk_live/);
  assert.match(read("app.json"), /android\.permission\.CAMERA/);
  assert.doesNotMatch(read("app.json"), /RECORD_AUDIO/);
  assert.match(read("app.json"), /recordAudioAndroid": false/);

  const repo = read("supabase/functions/delete-account/supabase-repo.ts");
  const purge = read("supabase/functions/delete-account/purge.ts");
  assert.doesNotMatch(repo, /referred_by/);
  assert.doesNotMatch(purge, /referred_by/);
  assert.doesNotMatch(repo, /campaign/);
  assert.match(repo, /\.maybeSingle\(\)/);
}

async function stripeSignatures(): Promise<void> {
  const stripe = new Stripe("sk_test_placeholder");
  const secret = "whsec_audit_only_not_a_live_secret";
  const payload = JSON.stringify({
    id: "evt_audit",
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "ping",
    data: { object: { id: "obj_audit" } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
  const constructEventAsync = (body: string, signature: string, key: string, tolerance?: number) =>
    stripe.webhooks.constructEventAsync(body, signature, key, tolerance);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const processed: string[] = [];

  const ok = await handleStripeWebhook(
    new Request("https://app.test/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": header },
      body: payload,
    }),
    {
      webhookSecret: secret,
      constructEventAsync,
      processEvent: async (event) => {
        processed.push(event.id);
      },
    },
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(processed, ["evt_audit"]);

  const missing = await handleStripeWebhook(
    new Request("https://app.test/stripe-webhook", { method: "POST", body: payload }),
    { webhookSecret: secret, constructEventAsync, processEvent: async () => processed.push("missing") },
  );
  assert.equal(missing.status, 400);

  const invalid = await handleStripeWebhook(
    new Request("https://app.test/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": header.replace(/v1=[a-f0-9]+/, "v1=deadbeef") },
      body: payload,
    }),
    { webhookSecret: secret, constructEventAsync, processEvent: async () => processed.push("invalid") },
  );
  assert.equal(invalid.status, 400);

  const staleHeader = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: Math.floor(Date.now() / 1000) - 1000,
  });
  const stale = await handleStripeWebhook(
    new Request("https://app.test/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": staleHeader },
      body: payload,
    }),
    { webhookSecret: secret, constructEventAsync, processEvent: async () => processed.push("stale") },
  );
  assert.equal(stale.status, 400);

  const noSecret = await handleStripeWebhook(
    new Request("https://app.test/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": header },
      body: payload,
    }),
    { webhookSecret: undefined, constructEventAsync, processEvent: async () => processed.push("secret") },
  );
  assert.equal(noSecret.status, 400);
  assert.deepEqual(processed, ["evt_audit"]);
}

async function main(): Promise<void> {
  await jwtIsolation();
  await otherUserUntouchedAndNameLeak();
  sentryAndStripeSource();
  await stripeSignatures();
  console.log("pr33 independent checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
