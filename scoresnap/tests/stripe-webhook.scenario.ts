import assert from "node:assert/strict";
import fs from "node:fs";
import StripeImport from "stripe";
import { handleStripeWebhook } from "../supabase/functions/stripe-webhook/handler.ts";
import { verifyStripeWebhook } from "../supabase/functions/stripe-webhook/verify.ts";

const Stripe = (StripeImport as any).default ?? StripeImport;
const stripe = new Stripe("sk_test_placeholder");
const secret = "whsec_test_only_not_a_real_secret";
const payload = JSON.stringify({
  id: "evt_test_privacy",
  object: "event",
  type: "invoice.payment_succeeded",
  data: { object: { id: "in_test", object: "invoice", amount_paid: 100, currency: "usd" } },
});

function signed(timestamp?: number) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) });
}

const constructEventAsync = (body: string, signature: string, key: string, tolerance?: number) =>
  stripe.webhooks.constructEventAsync(body, signature, key, tolerance);

async function post(headers: Record<string, string>, webhookSecret: string | undefined) {
  let processed: any = null;
  const response = await handleStripeWebhook(new Request("https://app.test/stripe-webhook", {
    method: "POST",
    headers,
    body: payload,
  }), {
    webhookSecret,
    constructEventAsync,
    processEvent: async (event) => { processed = event; },
  });
  return { status: response.status, text: await response.text(), processed };
}

async function main() {
const valid = await post({ "stripe-signature": signed() }, secret);
assert.equal(valid.status, 200);
assert.equal(valid.processed?.type, "invoice.payment_succeeded");
assert.equal(valid.processed?.id, "evt_test_privacy");
assert.equal(valid.text.includes(secret), false);

const header = signed();
const invalid = await post({ "stripe-signature": header.replace(/v1=[a-f0-9]+/, "v1=deadbeef") }, secret);
assert.equal(invalid.status, 400);
assert.equal(invalid.processed, null);
assert.equal(invalid.text, "invalid signature");
assert.equal(invalid.text.includes(secret), false);
const invalidCheck = await verifyStripeWebhook(payload, header.replace(/v1=[a-f0-9]+/, "v1=deadbeef"), secret, constructEventAsync);
assert.equal(invalidCheck.ok, false);
if (!invalidCheck.ok) assert.equal(invalidCheck.reason, "invalid_signature");

const missingHeader = await post({}, secret);
assert.equal(missingHeader.status, 400);
assert.equal(missingHeader.processed, null);
const missingHeaderCheck = await verifyStripeWebhook(payload, null, secret, constructEventAsync);
assert.equal(missingHeaderCheck.ok, false);
if (!missingHeaderCheck.ok) assert.equal(missingHeaderCheck.reason, "missing_signature");

const missingSecret = await post({ "stripe-signature": header }, undefined);
assert.equal(missingSecret.status, 400);
assert.equal(missingSecret.processed, null);
const missingSecretCheck = await verifyStripeWebhook(payload, header, undefined, constructEventAsync);
assert.equal(missingSecretCheck.ok, false);
if (!missingSecretCheck.ok) assert.equal(missingSecretCheck.reason, "missing_secret");

const old = signed(Math.floor(Date.now() / 1000) - 1000);
const replayed = await post({ "stripe-signature": old }, secret);
assert.equal(replayed.status, 400);
assert.equal(replayed.processed, null);
const replayedCheck = await verifyStripeWebhook(payload, old, secret, constructEventAsync);
assert.equal(replayedCheck.ok, false);
if (!replayedCheck.ok) assert.equal(replayedCheck.reason, "expired_timestamp");

const index = fs.readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
assert.match(index, /constructEventAsync/);
assert.match(index, /STRIPE_WEBHOOK_SECRET/);
assert.doesNotMatch(index, /JSON\.parse\(body\)/);
assert.doesNotMatch(index, /whsec_test_only_not_a_real_secret/);
assert.doesNotMatch(index, /console\.log\([^)]*STRIPE_WEBHOOK_SECRET/);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
