import { verifyStripeWebhook, type StripeVerifier } from "./verify.ts";

export interface StripeWebhookDeps {
  webhookSecret: string | undefined;
  constructEventAsync: StripeVerifier;
  processEvent: (event: any) => Promise<void>;
}

export async function handleStripeWebhook(req: Request, deps: StripeWebhookDeps): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const verified = await verifyStripeWebhook(rawBody, signature, deps.webhookSecret, deps.constructEventAsync);
  if (!verified.ok) return new Response("invalid signature", { status: 400 });
  await deps.processEvent(verified.event);
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
