import assert from "node:assert/strict";
import fs from "node:fs";
import { performAccountDeletion } from "../src/services/account-deletion.ts";
import {
  createGatedStorage,
  createMemoryStorage,
  PERSISTED_ACCOUNT_KEYS,
  persistGate,
  runSuppressed,
} from "../src/stores/persisted-keys.ts";
import { handleDeleteAccount } from "../supabase/functions/delete-account/handler.ts";
import { createMemoryAccountRepository, type AccountDb } from "../supabase/functions/delete-account/memory-repo.ts";
import { DELETED_PLAYER, publishedName, purgeAccount, replaceEmailText } from "../supabase/functions/delete-account/purge.ts";
import { createSupabaseAccountRepository } from "../supabase/functions/delete-account/supabase-repo.ts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const emailA = "augie@example.com";
const emailB = "blair@example.com";
const codeA = "SS-AUG1";
const spacedName = " Augie ";
const longName = "N".repeat(81);
const publishedLong = "N".repeat(80);

function db(): AccountDb {
  return {
    profiles: [
      { id: A, email: emailA, display_name: "Augie", referral_code: codeA, referred_by: null },
      { id: B, email: emailB, display_name: "Blair", referral_code: "SS-BLAIR", referred_by: codeA },
      { id: C, email: "casey@example.com", display_name: "Casey", referral_code: "SS-KEEP", referred_by: "SS-OTHER" },
    ],
    contests: [
      { id: "private", owner_id: A },
      { id: "shared", owner_id: A },
      { id: "guests", owner_id: A },
      { id: "hosted", owner_id: B },
      { id: "spaces", owner_id: A },
      { id: "long", owner_id: A },
    ],
    contest_players: [
      { id: "p-private", contest_id: "private", user_id: A, name: "Augie Private", scores: [4], putts: [1] },
      { id: "p-shared-a", contest_id: "shared", user_id: A, name: "Augie", scores: [4, 5, 4], putts: [2, 2, 1] },
      { id: "p-shared-b", contest_id: "shared", user_id: B, name: "Blair", scores: [3, 3, 3], putts: [1, 1, 1] },
      { id: "p-guest-a", contest_id: "guests", user_id: A, name: "Augie", scores: [5] },
      { id: "p-guest-sam", contest_id: "guests", user_id: null, name: "Sam", scores: [6] },
      { id: "p-host-b", contest_id: "hosted", user_id: B, name: "Blair Host", scores: [4] },
      { id: "p-host-a", contest_id: "hosted", user_id: A, name: "Augie Guest", scores: [7] },
      { id: "p-space-a", contest_id: "spaces", user_id: A, name: spacedName, scores: [4] },
      { id: "p-space-b", contest_id: "spaces", user_id: B, name: "Blair", scores: [3] },
      { id: "p-long-a", contest_id: "long", user_id: A, name: longName, scores: [5] },
      { id: "p-long-b", contest_id: "long", user_id: B, name: "Blair Long", scores: [6] },
    ],
    score_events: [
      { id: "e-private", contest_id: "private", player_id: "p-private", hole: 1, strokes: 4, entered_by: A, actor: A },
      { id: "e-shared-a", contest_id: "shared", player_id: "p-shared-a", hole: 1, strokes: 4, entered_by: A, actor: A },
      { id: "e-shared-b", contest_id: "shared", player_id: "p-shared-b", hole: 2, strokes: 5, entered_by: A, actor: null },
      { id: "e-host", contest_id: "hosted", player_id: "p-host-a", hole: 3, strokes: 7, entered_by: A, actor: A },
    ],
    contest_memberships: [
      { contest_id: "shared", user_id: A },
      { contest_id: "shared", user_id: B },
      { contest_id: "shared", user_id: C },
      { contest_id: "hosted", user_id: B },
      { contest_id: "hosted", user_id: A },
    ],
    contest_join_requests: [
      { id: "j-a", contest_id: "shared", requester: A, requested_name: "Augie", decided_by: null },
      { id: "j-b", contest_id: "hosted", requester: B, requested_name: "Blair", decided_by: A },
    ],
    operation_receipts: [
      { actor: A, op_id: "op-a", contest_id: "shared" },
      { actor: B, op_id: "op-b", contest_id: "hosted" },
    ],
    published_rounds: [
      {
        contest_id: "shared",
        owner_id: A,
        local_id: "local-shared",
        snapshot: {
          completed: false,
          players: [
            { displayName: "Augie", scores: [4, 5, 4], total: 13, toPar: 1 },
            { displayName: "Blair", scores: [3, 3, 3], total: 9, toPar: -3 },
          ],
          games: [{ game: "stroke", standings: [{ displayName: "Augie", units: 1 }, { displayName: "Blair", units: -1 }] }],
        },
      },
      { contest_id: "private", owner_id: A, local_id: "local-private", snapshot: { players: [{ displayName: "Augie Private", scores: [4] }] } },
      {
        contest_id: "spaces",
        owner_id: A,
        local_id: "spaces-1",
        snapshot: {
          players: [{ displayName: "Augie", scores: [4] }],
          games: [{ standings: [{ displayName: "Augie" }] }],
        },
      },
      {
        contest_id: "spaces",
        owner_id: A,
        local_id: "spaces-2",
        snapshot: {
          players: [{ displayName: spacedName, scores: [8] }],
          games: [{ standings: [{ displayName: "Augie" }] }],
        },
      },
      {
        contest_id: "long",
        owner_id: A,
        local_id: "long-1",
        snapshot: {
          players: [{ displayName: publishedLong, scores: [5] }],
          games: [{ standings: [{ displayName: longName }] }],
        },
      },
    ],
    round_messages: [
      { id: "m-a", contest_id: "shared", display_name: "Augie", body: "nice shot" },
      { id: "m-b", contest_id: "shared", display_name: "Blair", body: "thanks" },
      { id: "m-space-raw", contest_id: "spaces", display_name: spacedName, body: "padded" },
      { id: "m-space-pub", contest_id: "spaces", display_name: "Augie", body: "trimmed" },
      { id: "m-space-blair", contest_id: "spaces", display_name: "Blair", body: "still here" },
      { id: "m-long", contest_id: "long", display_name: publishedLong, body: "long name" },
      { id: "m-long-raw", contest_id: "long", display_name: longName, body: "raw long" },
      { id: "m-long-short", contest_id: "long", display_name: "N".repeat(79), body: "shorter" },
    ],
    share_links: [
      { token_hash: "shared-link", contest_id: "shared" },
      { token_hash: "private-link", contest_id: "private" },
    ],
    scans: [
      { id: "scan-a", user_id: A },
      { id: "scan-b", user_id: B },
      { id: "scan-c", user_id: C },
    ],
    marketing_events: [
      { id: "mk-a", user_id: A, campaign: codeA, properties: { email: emailA } },
      { id: "mk-b", user_id: B, campaign: codeA, properties: { email: emailA, referrer_id: A, note: "referred by augie@example.com" } },
      { id: "mk-c", user_id: C, campaign: "SS-KEEP", properties: { email: "casey@example.com" } },
      { id: "mk-longer", user_id: B, campaign: null, properties: { email: "naugie@example.com" } },
    ],
    feedback: [
      { id: "f-a", user_id: A, user_email: emailA, raw_text: "secret" },
      { id: "f-email", user_id: null, user_email: "Augie@Example.com", raw_text: "also secret" },
      { id: "f-b", user_id: B, user_email: emailB, raw_text: "fine" },
    ],
    settlements: [
      { id: "s-ab", from_user_id: A, to_user_id: B, scan_id: "scan-a", amount_cents: 500 },
      { id: "s-aa", from_user_id: A, to_user_id: A, scan_id: null, amount_cents: 100 },
      { id: "s-bc", from_user_id: B, to_user_id: C, scan_id: null, amount_cents: 250 },
    ],
    revenue_events: [
      { id: "r-a", customer_email: "Augie@Example.com", amount_cents: 1999, metadata: { email: emailA } },
      { id: "r-b", customer_email: emailB, amount_cents: 500, metadata: { email: emailB } },
    ],
    automation_log: [
      { id: "log-a", title: `New user: ${emailA}`, details: `Provider: email | ${emailA}` },
      { id: "log-b", title: "Blair signed up", details: "organic" },
    ],
  };
}

function textOf(value: unknown): string {
  return JSON.stringify(value);
}

/** True when the address appears on its own, not as the tail of a longer address. */
function containsAddress(text: string, email: string): boolean {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9._%+-])${escaped}(?=$|[^A-Z0-9._%+-])`, "i").test(text);
}

async function purgeScenario() {
  assert.equal(replaceEmailText(emailA, emailA), "[deleted]");
  assert.equal(replaceEmailText(`Hello ${emailA}!`, emailA), "Hello [deleted]!");
  assert.equal(replaceEmailText("naugie@example.com", emailA), "naugie@example.com");
  assert.equal(publishedName(spacedName), "Augie");
  assert.equal(publishedName(longName), publishedLong);
  assert.equal(publishedLong.length, 80);

  const state = db();
  await purgeAccount(createMemoryAccountRepository(state), A);

  assert.equal(state.profiles.find((row) => row.id === A), undefined);
  assert.equal(state.profiles.find((row) => row.id === B)?.email, emailB);
  assert.equal(state.profiles.find((row) => row.id === B)?.referral_code, "SS-BLAIR");
  assert.equal(state.profiles.find((row) => row.id === B)?.referred_by, null);
  assert.equal(state.profiles.find((row) => row.id === C)?.display_name, "Casey");
  assert.equal(state.profiles.find((row) => row.id === C)?.referred_by, "SS-OTHER");
  assert.equal(state.profiles.find((row) => row.id === C)?.referral_code, "SS-KEEP");

  assert.equal(state.contests.find((row) => row.id === "private"), undefined);
  assert.equal(state.contests.find((row) => row.id === "guests"), undefined);
  assert.equal(state.contests.find((row) => row.id === "shared")?.owner_id, B);
  assert.equal(state.contests.find((row) => row.id === "hosted")?.owner_id, B);
  assert.equal(state.contests.find((row) => row.id === "spaces")?.owner_id, B);
  assert.equal(state.contests.find((row) => row.id === "long")?.owner_id, B);

  const sharedA = state.contest_players.find((row) => row.id === "p-shared-a");
  assert.equal(sharedA?.name, DELETED_PLAYER);
  assert.equal(sharedA?.user_id, null);
  assert.deepEqual(sharedA?.scores, [4, 5, 4]);
  assert.deepEqual(sharedA?.putts, [2, 2, 1]);
  const sharedB = state.contest_players.find((row) => row.id === "p-shared-b");
  assert.equal(sharedB?.name, "Blair");
  assert.deepEqual(sharedB?.scores, [3, 3, 3]);
  assert.equal(state.contest_players.find((row) => row.id === "p-private"), undefined);
  assert.equal(state.contest_players.find((row) => row.id === "p-guest-sam"), undefined);
  const hostA = state.contest_players.find((row) => row.id === "p-host-a");
  assert.equal(hostA?.name, DELETED_PLAYER);
  assert.deepEqual(hostA?.scores, [7]);
  assert.equal(state.contest_players.find((row) => row.id === "p-host-b")?.name, "Blair Host");

  const sharedEventA = state.score_events.find((row) => row.id === "e-shared-a");
  assert.equal(sharedEventA?.strokes, 4);
  assert.equal(sharedEventA?.entered_by, B);
  assert.equal(sharedEventA?.actor, null);
  assert.equal(sharedEventA?.player_id, "p-shared-a");
  const sharedEventB = state.score_events.find((row) => row.id === "e-shared-b");
  assert.equal(sharedEventB?.strokes, 5);
  assert.equal(sharedEventB?.hole, 2);
  assert.equal(sharedEventB?.entered_by, B);
  assert.equal(state.score_events.find((row) => row.id === "e-private"), undefined);
  const hostEvent = state.score_events.find((row) => row.id === "e-host");
  assert.equal(hostEvent?.strokes, 7);
  assert.equal(hostEvent?.entered_by, B);
  assert.equal(hostEvent?.actor, null);

  assert.deepEqual(state.contest_memberships.map((row) => row.user_id).sort(), [B, B, C]);
  assert.equal(state.contest_join_requests.find((row) => row.id === "j-a"), undefined);
  assert.equal(state.contest_join_requests.find((row) => row.id === "j-b")?.decided_by, null);
  assert.deepEqual(state.operation_receipts.map((row) => row.actor), [B]);

  const round = state.published_rounds.find((row) => row.contest_id === "shared");
  assert.equal(round?.owner_id, B);
  const snapshot = round?.snapshot as { players: { displayName: string; scores: number[] }[]; games: { standings: { displayName: string }[] }[] };
  assert.equal(snapshot.players[0].displayName, DELETED_PLAYER);
  assert.deepEqual(snapshot.players[0].scores, [4, 5, 4]);
  assert.equal(snapshot.players[1].displayName, "Blair");
  assert.equal(snapshot.games[0].standings[0].displayName, DELETED_PLAYER);
  assert.equal(snapshot.games[0].standings[1].displayName, "Blair");
  assert.equal(state.published_rounds.find((row) => row.contest_id === "private"), undefined);
  assert.equal(state.round_messages.find((row) => row.id === "m-a")?.display_name, DELETED_PLAYER);
  assert.equal(state.round_messages.find((row) => row.id === "m-a")?.body, "nice shot");
  assert.equal(state.round_messages.find((row) => row.id === "m-b")?.display_name, "Blair");

  const spaceRounds = state.published_rounds.filter((row) => row.contest_id === "spaces");
  assert.equal(spaceRounds.length, 2);
  for (const row of spaceRounds) {
    assert.equal(row.owner_id, B);
    const spaceSnapshot = row.snapshot as { players: { displayName: string; scores: number[] }[]; games: { standings: { displayName: string }[] }[] };
    assert.equal(spaceSnapshot.players[0].displayName, DELETED_PLAYER);
    assert.equal(spaceSnapshot.games[0].standings[0].displayName, DELETED_PLAYER);
  }
  assert.deepEqual((spaceRounds.find((row) => row.local_id === "spaces-1")?.snapshot as { players: { scores: number[] }[] }).players[0].scores, [4]);
  assert.deepEqual((spaceRounds.find((row) => row.local_id === "spaces-2")?.snapshot as { players: { scores: number[] }[] }).players[0].scores, [8]);
  assert.equal(state.contest_players.find((row) => row.id === "p-space-a")?.name, DELETED_PLAYER);
  assert.equal(state.contest_players.find((row) => row.id === "p-space-b")?.name, "Blair");
  assert.equal(state.round_messages.find((row) => row.id === "m-space-raw")?.display_name, DELETED_PLAYER);
  assert.equal(state.round_messages.find((row) => row.id === "m-space-raw")?.body, "padded");
  assert.equal(state.round_messages.find((row) => row.id === "m-space-pub")?.display_name, DELETED_PLAYER);
  assert.equal(state.round_messages.find((row) => row.id === "m-space-blair")?.display_name, "Blair");

  const longRound = state.published_rounds.find((row) => row.contest_id === "long");
  const longSnapshot = longRound?.snapshot as { players: { displayName: string; scores: number[] }[]; games: { standings: { displayName: string }[] }[] };
  assert.equal(longRound?.owner_id, B);
  assert.equal(longSnapshot.players[0].displayName, DELETED_PLAYER);
  assert.deepEqual(longSnapshot.players[0].scores, [5]);
  assert.equal(longSnapshot.games[0].standings[0].displayName, DELETED_PLAYER);
  assert.equal(state.contest_players.find((row) => row.id === "p-long-a")?.name, DELETED_PLAYER);
  assert.deepEqual(state.contest_players.find((row) => row.id === "p-long-a")?.scores, [5]);
  assert.equal(state.contest_players.find((row) => row.id === "p-long-b")?.name, "Blair Long");
  assert.equal(state.round_messages.find((row) => row.id === "m-long")?.display_name, DELETED_PLAYER);
  assert.equal(state.round_messages.find((row) => row.id === "m-long-raw")?.display_name, DELETED_PLAYER);
  assert.equal(state.round_messages.find((row) => row.id === "m-long-short")?.display_name, "N".repeat(79));
  assert.deepEqual(state.share_links.map((row) => row.token_hash), ["shared-link"]);

  assert.deepEqual(state.scans.map((row) => row.id).sort(), ["scan-b", "scan-c"]);
  assert.equal(state.marketing_events.find((row) => row.id === "mk-a"), undefined);
  assert.equal(state.marketing_events.find((row) => row.id === "mk-b")?.campaign, null);
  assert.equal(state.marketing_events.find((row) => row.id === "mk-b")?.properties.email, "[deleted]");
  assert.equal(state.marketing_events.find((row) => row.id === "mk-b")?.properties.referrer_id, null);
  assert.equal(state.marketing_events.find((row) => row.id === "mk-b")?.properties.note, "referred by [deleted]");
  assert.equal(state.marketing_events.find((row) => row.id === "mk-longer")?.properties.email, "naugie@example.com");
  assert.equal(state.marketing_events.find((row) => row.id === "mk-c")?.campaign, "SS-KEEP");
  assert.equal(state.marketing_events.find((row) => row.id === "mk-c")?.properties.email, "casey@example.com");
  assert.equal(state.feedback.find((row) => row.id === "f-b")?.raw_text, "fine");
  assert.equal(state.feedback.some((row) => row.id !== "f-b"), false);

  const between = state.settlements.find((row) => row.id === "s-ab");
  assert.equal(between?.from_user_id, null);
  assert.equal(between?.to_user_id, B);
  assert.equal(between?.scan_id, null);
  assert.equal(between?.amount_cents, 500);
  assert.equal(state.settlements.find((row) => row.id === "s-aa"), undefined);
  assert.equal(state.settlements.find((row) => row.id === "s-bc")?.amount_cents, 250);

  const revenueA = state.revenue_events.find((row) => row.id === "r-a");
  assert.equal(revenueA?.customer_email, null);
  assert.equal(revenueA?.amount_cents, 1999);
  assert.equal(textOf(revenueA?.metadata).includes(emailA), false);
  assert.equal(state.revenue_events.find((row) => row.id === "r-b")?.customer_email, emailB);
  assert.equal(state.automation_log.find((row) => row.id === "log-a")?.title, "New user: [deleted]");
  assert.equal(state.automation_log.find((row) => row.id === "log-a")?.details?.includes(emailA), false);
  assert.equal(state.automation_log.find((row) => row.id === "log-b")?.title, "Blair signed up");

  const dumped = textOf(state);
  assert.equal(containsAddress(dumped, emailA), false);
  assert.equal(containsAddress(dumped, "Augie@Example.com"), false);
  assert.equal(dumped.includes("naugie@example.com"), true);
  assert.equal(dumped.includes(codeA), false);
  assert.equal(dumped.includes("SS-BLAIR"), true);
  assert.equal(dumped.includes("SS-KEEP"), true);
  assert.equal(dumped.includes("SS-OTHER"), true);
  for (const row of state.contest_players) assert.notEqual(row.user_id, A);
  for (const row of state.score_events) {
    assert.notEqual(row.entered_by, A);
    assert.notEqual(row.actor, A);
  }
  for (const row of state.contests) assert.notEqual(row.owner_id, A);

  const forbidden = ["contest_groups", "hole_scores"];
  for (const file of [
    "supabase/functions/delete-account/purge.ts",
    "supabase/functions/delete-account/supabase-repo.ts",
    "supabase/functions/delete-account/memory-repo.ts",
    "supabase/functions/delete-account/index.ts",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    for (const name of forbidden) assert.equal(source.includes(name), false, file);
  }
}

async function handlerScenario() {
  const other = B;
  let calls: string[] = [];
  const authed = await handleDeleteAccount(new Request(`https://app.test/delete-account?userId=${other}`, {
    method: "POST",
    headers: { authorization: "Bearer caller-token" },
    body: JSON.stringify({ userId: other, user_id: other, id: other, sub: other }),
  }), {
    getUser: async () => ({ id: A }),
    purge: async (id) => { calls.push(`purge:${id}`); },
    deleteAuthUser: async (id) => { calls.push(`auth:${id}`); },
  });
  assert.equal(authed.status, 200);
  assert.equal((await authed.json()).deleted, true);
  assert.deepEqual(calls, [`purge:${A}`, `auth:${A}`]);

  calls = [];
  const anon = await handleDeleteAccount(new Request("https://app.test/delete-account", {
    method: "POST",
    body: JSON.stringify({ userId: other }),
  }), {
    getUser: async () => { throw new Error("must not verify"); },
    purge: async (id) => { calls.push(id); },
    deleteAuthUser: async (id) => { calls.push(id); },
  });
  assert.equal(anon.status, 401);
  assert.deepEqual(calls, []);

  calls = [];
  const rejected = await handleDeleteAccount(new Request("https://app.test/delete-account", {
    method: "POST",
    headers: { authorization: "Bearer nope" },
  }), {
    getUser: async () => null,
    purge: async (id) => { calls.push(id); },
    deleteAuthUser: async () => { calls.push("auth"); },
  });
  assert.equal(rejected.status, 401);
  assert.deepEqual(calls, []);

  let deleted = false;
  const failed = await handleDeleteAccount(new Request("https://app.test/delete-account", {
    method: "POST",
    headers: { authorization: "Bearer caller-token" },
  }), {
    getUser: async () => ({ id: A }),
    purge: async () => { throw new Error("database down"); },
    deleteAuthUser: async () => { deleted = true; },
  });
  assert.equal(failed.status, 500);
  assert.equal(deleted, false);
  assert.equal((await failed.json()).error, "delete_failed");

  const handler = fs.readFileSync("supabase/functions/delete-account/handler.ts", "utf8");
  assert.match(handler, /purge\(caller\.id\)/);
  assert.match(handler, /deleteAuthUser\(caller\.id\)/);
  assert.doesNotMatch(handler, /body\.userId|body\.user_id|searchParams/);
  const client = fs.readFileSync("src/services/delete-account.ts", "utf8");
  assert.match(client, /body:\s*\{\s*\}/);
  assert.doesNotMatch(client, /userId|user_id/);
}

async function localScenario() {
  persistGate.suppressed = false;
  persistGate.suppressSignedOutPersist = false;
  const backing = createMemoryStorage();
  const gated = createGatedStorage(backing);
  for (const key of PERSISTED_ACCOUNT_KEYS) await gated.setItem(key, `secret:${key}`);
  assert.equal(PERSISTED_ACCOUNT_KEYS.includes("snapscore-scans"), true);
  assert.equal(PERSISTED_ACCOUNT_KEYS.includes("snapscore-guest"), true);
  assert.equal(PERSISTED_ACCOUNT_KEYS.includes("snapscore.chat.session.v1"), true);
  assert.equal(PERSISTED_ACCOUNT_KEYS.includes("snapscore.chat.name.v1"), true);
  assert.equal((PERSISTED_ACCOUNT_KEYS as readonly string[]).includes("snapscore-scan"), false);

  await runSuppressed(async () => {
    for (const key of PERSISTED_ACCOUNT_KEYS) await backing.removeItem(key);
    for (const key of PERSISTED_ACCOUNT_KEYS) await gated.setItem(key, "rewritten by sign-out");
  });
  for (const key of PERSISTED_ACCOUNT_KEYS) assert.equal(await backing.getItem(key), null, key);

  persistGate.suppressSignedOutPersist = true;
  const previous = persistGate.suppressed;
  persistGate.suppressed = true;
  try {
    await gated.setItem("snapscore-auth", "late signed-out write");
  } finally {
    persistGate.suppressed = previous;
  }
  assert.equal(await backing.getItem("snapscore-auth"), null);
  await gated.setItem("snapscore-onboarding", "done");
  assert.equal(await backing.getItem("snapscore-onboarding"), "done");

  const order: string[] = [];
  await assert.rejects(() => performAccountDeletion({
    confirmed: false,
    deleteRemote: async () => { order.push("remote"); },
    wipeLocal: async () => { order.push("wipe"); },
  }));
  assert.deepEqual(order, []);
  await assert.rejects(() => performAccountDeletion({
    confirmed: true,
    deleteRemote: async () => { order.push("remote"); throw new Error("server"); },
    wipeLocal: async () => { order.push("wipe"); },
  }));
  assert.deepEqual(order, ["remote"]);
  await performAccountDeletion({
    confirmed: true,
    deleteRemote: async () => { order.push("remote-ok"); },
    wipeLocal: async () => { order.push("wipe"); },
  });
  assert.deepEqual(order, ["remote", "remote-ok", "wipe"]);

  const settings = fs.readFileSync("app/settings.tsx", "utf8");
  assert.match(settings, /Yes, delete my account/);
  assert.match(settings, /Keep my account/);
  assert.match(settings, /setDeleteArmed\(true\)/);
  assert.match(settings, /confirmed:\s*true/);
  assert.match(settings, /wipeLocalAccount/);
  assert.doesNotMatch(settings, /snapscore-scan/);
  assert.doesNotMatch(settings, /handleDeleteAccount/);
  const wipe = fs.readFileSync("src/stores/wipe-local-account.ts", "utf8");
  assert.match(wipe, /suppressSignedOutPersist = true/);
  assert.match(wipe, /runSuppressed/);
  assert.match(wipe, /resetChatSessionCache/);
  assert.match(wipe, /PERSISTED_ACCOUNT_KEYS/);
  assert.doesNotMatch(wipe, /useAuthStore\.getState\(\)\.signOut|getState\(\)\.signOut/);
  assert.match(wipe, /supabase\.auth\.signOut\(\)/);
  for (const [file, key] of [
    ["src/stores/auth-store.ts", "AUTH_STORAGE_KEY"],
    ["src/stores/contest-store.ts", "CONTEST_STORAGE_KEY"],
    ["src/stores/settings-store.ts", "SETTINGS_STORAGE_KEY"],
    ["src/stores/scan-store.ts", "SCAN_STORAGE_KEY"],
    ["src/stores/onboarding-store.ts", "ONBOARDING_STORAGE_KEY"],
    ["src/stores/guest-store.ts", "GUEST_STORAGE_KEY"],
  ] as const) {
    assert.match(fs.readFileSync(file, "utf8"), new RegExp(`name:\\s*${key}`));
  }
}

function recordingAdmin() {
  const ops: { table: string; op: string; patch: unknown; filters: [string, unknown][] }[] = [];
  const admin = {
    from(table: string) {
      const state = { table, op: "select", patch: null as unknown, filters: [] as [string, unknown][] };
      const api: any = {
        select() { return api; },
        eq(column: string, value: unknown) { state.filters.push([column, value]); return api; },
        in() { return api; },
        is() { return api; },
        ilike() { return api; },
        or() { return api; },
        filter() { return api; },
        update(patch: unknown) { state.op = "update"; state.patch = patch; return api; },
        delete() { state.op = "delete"; return api; },
        maybeSingle() { ops.push({ table: state.table, op: state.op, patch: state.patch, filters: [...state.filters] }); return Promise.resolve({ data: null, error: null }); },
        then(resolve: (value: unknown) => void) { ops.push({ table: state.table, op: state.op, patch: state.patch, filters: [...state.filters] }); resolve({ data: [], error: null }); },
      };
      return api;
    },
  };
  return { admin, ops };
}

async function supabaseShapeScenario() {
  const { admin, ops } = recordingAdmin();
  const repo = createSupabaseAccountRepository(admin);
  await repo.anonymizePlayer("player-1");
  await repo.reassignScoreActor("contest-1", A, B);
  const playerUpdate = ops.find((op) => op.table === "contest_players" && op.op === "update");
  assert.deepEqual(playerUpdate?.patch, { name: DELETED_PLAYER, user_id: null });
  const scoreUpdates = ops.filter((op) => op.table === "score_events" && op.op === "update").map((op) => op.patch);
  assert.deepEqual(scoreUpdates, [{ entered_by: B }, { actor: null }]);
  for (const patch of scoreUpdates) {
    assert.equal(Object.prototype.hasOwnProperty.call(patch, "strokes"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(patch, "scores"), false);
  }
  await repo.deleteContest("contest-1");
  assert.equal(ops.some((op) => op.table === "contests" && op.op === "delete"), true);
  assert.equal(ops.some((op) => op.table === "contest_groups" || op.table === "hole_scores"), false);

  await repo.clearReferralReferences(codeA);
  const referralWrites = ops.filter((op) => op.op === "update" && (op.table === "profiles" || op.table === "marketing_events"));
  assert.deepEqual(referralWrites.map((op) => ({ table: op.table, patch: op.patch, filters: op.filters })), [
    { table: "profiles", patch: { referred_by: null }, filters: [["referred_by", codeA]] },
    { table: "marketing_events", patch: { campaign: null }, filters: [["campaign", codeA]] },
  ]);

  const rounds = [
    { contest_id: "spaces", owner_id: A, local_id: "spaces-1", snapshot: { players: [{ displayName: "Augie", scores: [4] }] } },
    { contest_id: "spaces", owner_id: A, local_id: "spaces-2", snapshot: { players: [{ displayName: spacedName, scores: [8] }] } },
  ];
  const multi = createSupabaseAccountRepository({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let patch: { snapshot?: unknown } | null = null;
      const api: any = {
        select() { return api; },
        eq(column: string, value: unknown) { filters[column] = value; return api; },
        update(next: { snapshot?: unknown }) { patch = next; return api; },
        then(resolve: (value: unknown) => void) {
          if (patch) {
            for (const row of rounds) {
              if (row.contest_id === filters.contest_id && row.owner_id === filters.owner_id && row.local_id === filters.local_id) {
                row.snapshot = patch.snapshot as typeof row.snapshot;
              }
            }
            resolve({ data: null, error: null });
            return;
          }
          resolve({
            data: rounds.filter((row) => row.contest_id === filters.contest_id).map((row) => ({ ...row })),
            error: null,
          });
        },
      };
      return api;
    },
  });
  await multi.anonymizeSnapshots("spaces", [spacedName]);
  assert.equal((rounds[0].snapshot as { players: { displayName: string; scores: number[] }[] }).players[0].displayName, DELETED_PLAYER);
  assert.deepEqual((rounds[0].snapshot as { players: { scores: number[] }[] }).players[0].scores, [4]);
  assert.equal((rounds[1].snapshot as { players: { displayName: string; scores: number[] }[] }).players[0].displayName, DELETED_PLAYER);
  assert.deepEqual((rounds[1].snapshot as { players: { scores: number[] }[] }).players[0].scores, [8]);

  const snapshots = fs.readFileSync("supabase/functions/delete-account/supabase-repo.ts", "utf8");
  const body = snapshots.slice(snapshots.indexOf("async anonymizeSnapshots"), snapshots.indexOf("async anonymizeMessages"));
  assert.equal(body.includes("maybeSingle"), false);
}

async function main() {
  const which = process.argv[2];
  if (which === "purge") await purgeScenario();
  else if (which === "handler") await handlerScenario();
  else if (which === "local") await localScenario();
  else if (which === "shape") await supabaseShapeScenario();
  else throw new Error(`unknown scenario ${which}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
