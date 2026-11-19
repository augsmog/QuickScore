// SnapScore — New User Onboarding Handler
// Triggered by: Supabase Auth Hook (after signup) or Database Webhook on profiles INSERT
// Does: Creates profile, generates referral code, sends welcome email, logs event

import { checkWebhookSecret, referralRewardEnabled, referralPlan, emailSettings, buildWelcomeEmail, buildRewardEmail } from "./lib.ts";

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const settings = emailSettings({
  EMAIL_FROM: Deno.env.get("EMAIL_FROM"),
  EMAIL_REPLY_TO: Deno.env.get("EMAIL_REPLY_TO"),
  EMAIL_UNSUBSCRIBE_URL: Deno.env.get("EMAIL_UNSUBSCRIBE_URL"),
});

function generateReferralCode(userId: string): string {
  // Short, memorable code: first 4 chars of user ID + random 4 chars
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars
  const random = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `SS-${random}`;
}

async function sendEmail(payload: ReturnType<typeof buildWelcomeEmail>) {
  if (!RESEND_API_KEY) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) console.error("Email send failed:", response.status);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secretStatus = await checkWebhookSecret(Deno.env.get("SIGNUP_WEBHOOK_SECRET"), req.headers.get("x-webhook-secret"));
  if (secretStatus) return new Response("Request unavailable", { status: secretStatus });

  const payload = await req.json();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Support both Auth Hook format and Database Webhook format
  const user = payload.record || payload.user || payload;
  const userId = user.id;
  const email = user.email;
  const provider = user.app_metadata?.provider || "email";

  if (!userId || !email) {
    return new Response("Missing user data", { status: 400 });
  }

  // Generate referral code
  const referralCode = generateReferralCode(userId);

  // Check if referred by someone
  const referredBy = user.user_metadata?.referred_by || null;

  // Upsert profile with referral info
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      referral_code: referralCode,
      referred_by: referredBy,
      onboarding_email_sent: true,
      onboarding_email_sent_at: new Date().toISOString(),
      signup_source: provider,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("Profile upsert failed:", profileError);
  }

  // If referred, increment referrer's count and check for premium reward
  if (referredBy) {
    const { data: referrer } = await supabase
      .from("profiles")
      .select("id, referral_count, email")
      .eq("referral_code", referredBy)
      .single();

    if (referrer) {
      const newCount = (referrer.referral_count || 0) + 1;
      const plan = referralPlan(newCount, referralRewardEnabled(Deno.env.get("REFERRAL_PREMIUM_REWARD_ENABLED")), new Date().toISOString());
      await supabase
        .from("profiles")
        .update(plan.countUpdate)
        .eq("id", referrer.id);

      // Self-improving: track which referral codes convert best
      await supabase.from("marketing_events").insert({
        event_name: "referral_signup",
        source: "referral",
        campaign: referredBy,
        user_id: userId,
        properties: {
          referrer_id: referrer.id,
          referrer_email: referrer.email,
          referrer_total_referrals: newCount,
        },
      });

      // Reward at 3 referrals
      if (plan.premiumUpdate) {
        await supabase.from("profiles").update(plan.premiumUpdate).eq("id", referrer.id);
      }
      if (plan.sendReward) await sendEmail(buildRewardEmail(referrer.email, settings));
    }
  }

  // Send welcome email
  await sendEmail(buildWelcomeEmail(email, referralCode, settings));

  // Log signup event for analytics
  await supabase.from("marketing_events").insert({
    event_name: "user_signup",
    source: provider,
    user_id: userId,
    properties: {
      email,
      referral_code: referralCode,
      referred_by: referredBy,
    },
  });

  // Log to automation log (feeds Notion dashboard)
  await supabase.from("automation_log").insert({
    title: `New user: ${email}`,
    category: "signup",
    details: `Provider: ${provider} | Referral: ${referredBy || "organic"} | Code: ${referralCode}`,
    source: "on-user-signup",
  });

  // Update daily metrics
  const today = new Date().toISOString().split("T")[0];
  await supabase.rpc("increment_daily_signups", { target_date: today });

  return new Response(JSON.stringify({ success: true, referral_code: referralCode }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
