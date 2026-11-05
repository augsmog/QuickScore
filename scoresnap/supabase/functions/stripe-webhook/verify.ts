export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export type StripeVerifier = (
  rawBody: string,
  signature: string,
  secret: string,
  tolerance?: number,
) => Promise<unknown>;

export type StripeVerification =
  | { ok: true; event: any }
  | { ok: false; reason: "missing_secret" | "missing_signature" | "invalid_signature" | "expired_timestamp" };

/**
 * Verify a Stripe webhook with the signing secret.
 * constructEventAsync checks the HMAC over the raw body and rejects an old timestamp.
 */
export async function verifyStripeWebhook(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
  constructEventAsync: StripeVerifier,
): Promise<StripeVerification> {
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!signature) return { ok: false, reason: "missing_signature" };
  try {
    const event = await constructEventAsync(rawBody, signature, secret, STRIPE_SIGNATURE_TOLERANCE_SECONDS);
    return { ok: true, event };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timestamp/i.test(message)) return { ok: false, reason: "expired_timestamp" };
    return { ok: false, reason: "invalid_signature" };
  }
}
