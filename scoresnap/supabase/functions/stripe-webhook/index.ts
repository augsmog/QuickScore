// ScoreSnap — Stripe Webhook Handler
// Verifies the Stripe signature with STRIPE_WEBHOOK_SECRET (constructEventAsync on the raw body)
// before any database write. Handles checkout.session.completed, customer.subscription.deleted,
// and invoice.payment_succeeded.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=denonext";
import { handleStripeWebhook } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALERT_EMAIL = Deno.env.get("ALERT_EMAIL") || "jones.augie1@gmail.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// The API key is only required to construct the SDK client. Signature checks use STRIPE_WEBHOOK_SECRET.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "sk_test_placeholder", {
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sendAlertEmail(subject: string, body: string) {
  if (!RESEND_API_KEY) {
    console.log(`[EMAIL SKIPPED] ${subject}: ${body}`);
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "ScoreSnap <alerts@scoresnap.app>",
      to: ALERT_EMAIL,
      subject,
      html: body,
    }),
  });
}

async function logToNotion(title: string, category: string, details: string) {
  await supabase.from("automation_log").insert({
    title,
    category,
    details,
    source: "stripe-webhook",
  });
}

async function processStripeEvent(event: any) {
  const eventType = event.type;
  const obj = event.data?.object;

  const { error: logError } = await supabase.from("revenue_events").upsert(
    {
      stripe_event_id: event.id,
      event_type: eventType,
      customer_email: obj?.customer_email || obj?.customer_details?.email || null,
      amount_cents: obj?.amount_total || obj?.amount_paid || 0,
      currency: obj?.currency || "usd",
      subscription_id: obj?.subscription || null,
      metadata: obj?.metadata || {},
    },
    { onConflict: "stripe_event_id" }
  );

  if (logError) {
    console.error("Failed to log revenue event:", logError);
  }

  switch (eventType) {
    case "checkout.session.completed": {
      const email = obj.customer_email || obj.customer_details?.email;
      const amount = (obj.amount_total / 100).toFixed(2);

      if (email) {
        const { data: user } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .single();

        if (user) {
          await supabase
            .from("profiles")
            .update({ is_premium: true, premium_since: new Date().toISOString() })
            .eq("id", user.id);
        }
      }

      await sendAlertEmail(
        `💰 New Premium Sub! $${amount}`,
        `<h2>New Premium Subscription</h2>
        <p><strong>Customer:</strong> ${email}</p>
        <p><strong>Amount:</strong> $${amount}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>`
      );

      await logToNotion(
        `New Premium: ${email} ($${amount})`,
        "revenue",
        `Checkout completed. Amount: $${amount}`
      );
      break;
    }

    case "customer.subscription.deleted": {
      const email = obj.customer_email;
      const reason = obj.cancellation_details?.reason || "Not specified";

      if (email) {
        await supabase
          .from("profiles")
          .update({ is_premium: false, churned_at: new Date().toISOString() })
          .eq("email", email);
      }

      await sendAlertEmail(
        `⚠️ Subscription Cancelled — ${email}`,
        `<h2>Churn Alert</h2>
        <p><strong>Customer:</strong> ${email}</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Consider sending a win-back email.</p>`
      );

      await logToNotion(
        `Churn: ${email} — ${reason}`,
        "churn",
        `Subscription cancelled. Reason: ${reason}`
      );
      break;
    }

    case "invoice.payment_succeeded": {
      const amount = ((obj.amount_paid || 0) / 100).toFixed(2);
      await logToNotion(
        `Payment: $${amount} from ${obj.customer_email}`,
        "revenue",
        `Recurring payment received`
      );
      break;
    }
  }

  const today = new Date().toISOString().split("T")[0];
  await supabase.rpc("increment_daily_revenue", {
    target_date: today,
    amount: obj?.amount_total || obj?.amount_paid || 0,
  });
}

serve((req) => handleStripeWebhook(req, {
  webhookSecret: Deno.env.get("STRIPE_WEBHOOK_SECRET"),
  constructEventAsync: (payload, signature, secret, tolerance) =>
    stripe.webhooks.constructEventAsync(payload, signature, secret, tolerance),
  processEvent: processStripeEvent,
}));
