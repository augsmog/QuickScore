// ScoreSnap — New User Onboarding Handler
// Triggered by: Supabase Auth Hook (after signup) or Database Webhook on profiles INSERT
// Does: Creates profile, generates referral code, sends welcome email, logs event

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ALERT_EMAIL = Deno.env.get("ALERT_EMAIL") || "jones.augie1@gmail.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function generateReferralCode(userId: string): string {
  // Short, memorable code: first 4 chars of user ID + random 4 chars
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars
  const random = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `SS-${random}`;
}

async function sendWelcomeEmail(email: string, referralCode: string) {
  if (!RESEND_API_KEY) {
    console.log(`[EMAIL SKIPPED] Welcome email to ${email}`);
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "ScoreSnap <hello@scoresnap.app>",
      to: email,
      subject: "Welcome to ScoreSnap — Your first scan is waiting 🏌️",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 20px 0;">
            <h1 style="color: #16a34a; font-size: 28px; margin: 0;">Welcome to ScoreSnap ⛳</h1>
            <p style="color: #6b7280; font-size: 16px;">Scan. Score. Settle.</p>
          </div>

          <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin: 20px 0;">
            <h2 style="color: #111827; font-size: 20px; margin-top: 0;">Your next round just got better</h2>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              You're now part of the crew that settles bets before they hit the parking lot.
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;"><strong>Get started in 3 steps:</strong></p>
            <ol style="color: #374151; font-size: 15px; line-height: 1.8;">
              <li>🎯 <strong>Scan a scorecard</strong> — point your camera, we'll do the rest</li>
              <li>🎲 <strong>Pick a game</strong> — Nassau, Skins, Wolf, or 25+ others</li>
              <li>💰 <strong>Settle up</strong> — no more "I'll get you next time"</li>
            </ol>
          </div>

          <div style="background: #16a34a; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
            <h3 style="color: white; margin-top: 0;">Your referral code: ${referralCode}</h3>
            <p style="color: #dcfce7; font-size: 14px;">
              Share this with your foursome. When 3 friends sign up and complete a scan,
              you unlock a <strong>free month of Premium</strong> — 25+ game modes, stats tracking, and league play.
            </p>
          </div>

          <div style="text-align: center; padding: 20px 0; color: #9ca3af; font-size: 13px;">
            <p>ScoreSnap by Autumn8me, Inc.</p>
            <p>The app that knows who owes who.</p>
          </div>
        </div>
      `,
    }),
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = await req.json();

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
      await supabase
        .from("profiles")
        .update({ referral_count: newCount })
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
      if (newCount === 3) {
        await supabase
          .from("profiles")
          .update({
            is_premium: true,
            premium_since: new Date().toISOString(),
            premium_source: "referral_reward"
          })
          .eq("id", referrer.id);

        // Notify referrer
        if (RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "ScoreSnap <hello@scoresnap.app>",
              to: referrer.email,
              subject: "🎉 You earned free Premium! 3 friends joined ScoreSnap",
              html: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
                <h1 style="color: #16a34a;">You did it! 🏆</h1>
                <p>3 of your friends signed up with your code. Your free month of Premium is now active.</p>
                <p style="font-size: 14px; color: #6b7280;">Keep sharing — every 3 additional referrals = another free month.</p>
              </div>`,
            }),
          });
        }
      }
    }
  }

  // Send welcome email
  await sendWelcomeEmail(email, referralCode);

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
