// Auth INSERT webhook. Database claims serialize side effects and email retries.
import { checkWebhookSecret, referralRewardEnabled, referralPlan, emailSettings, buildWelcomeEmail, buildRewardEmail } from "./lib.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const settings = emailSettings({ APP_URL: Deno.env.get("APP_URL"), EMAIL_FROM: Deno.env.get("EMAIL_FROM"), EMAIL_REPLY_TO: Deno.env.get("EMAIL_REPLY_TO"), EMAIL_UNSUBSCRIBE_URL: Deno.env.get("EMAIL_UNSUBSCRIBE_URL") });
let cachedSecret: string | undefined;
const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
async function webhookSecret() {
  const env = Deno.env.get("SIGNUP_WEBHOOK_SECRET");
  if (env?.trim()) return env;
  if (cachedSecret) return cachedSecret;
  try {
    const { data, error } = await db().rpc("get_signup_webhook_secret");
    if (!error && typeof data === "string" && data.trim()) cachedSecret = data;
  } catch { /* Fail closed; do not log credentials or database errors. */ }
  return cachedSecret;
}
async function sendEmail(payload: ReturnType<typeof buildWelcomeEmail>, key: string): Promise<string | null> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Idempotency-Key": key }, body: JSON.stringify(payload),
    });
    if (!response.ok) { console.error("Email send failed:", response.status); return null; }
    const result = await response.json();
    if (typeof result.id === "string" && result.id.trim()) return result.id;
    console.error("Email send failed:", response.status);
  } catch { console.error("Email send failed:", "network-or-json"); }
  return null;
}
function checked(result: { error?: unknown }) { if (result.error) throw Error("database operation failed"); }
serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const status = await checkWebhookSecret(await webhookSecret(), req.headers.get("x-webhook-secret"));
  if (status) return new Response("Request unavailable", { status });
  let payload;
  try { payload = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const user = payload?.record || payload?.user || payload;
  if (!user?.id || !user?.email) return new Response("Missing user data", { status: 400 });
  const supabase = db();
  const userId = user.id, email = user.email;
  const provider = user.app_metadata?.provider || "email";
  const referredBy = user.user_metadata?.referred_by || null;
  try {
    const claim = await supabase.from("signup_processing").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }).select("user_id");
    checked(claim);
    const duplicate = !claim.data?.length;
    if (!duplicate) {
      // The auth profile trigger normally created this row. Preserve any existing code.
      const existing = await supabase.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
      checked(existing);
      checked(await supabase.from("profiles").upsert({ id: userId, email, referred_by: referredBy, signup_source: provider }, { onConflict: "id" }));
      if (!existing.data?.referral_code) {
        const code = `SS-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
        checked(await supabase.from("profiles").update({ referral_code: code }).eq("id", userId).is("referral_code", null));
      }
      if (referredBy) {
        const referral = await supabase.rpc("apply_signup_referral", { p_user_id: userId, p_code: referredBy });
        checked(referral);
        const referrer = referral.data?.[0];
        if (referrer) {
          const plan = referralPlan(referrer.new_count, referralRewardEnabled(Deno.env.get("REFERRAL_PREMIUM_REWARD_ENABLED")), new Date().toISOString());
          checked(await supabase.from("marketing_events").insert({ event_name: "referral_signup", source: "referral", campaign: referredBy, user_id: userId, properties: { referrer_id: referrer.referrer_id, referrer_total_referrals: referrer.new_count } }));
          if (plan.premiumUpdate) checked(await supabase.from("profiles").update(plan.premiumUpdate).eq("id", referrer.referrer_id));
          if (plan.sendReward && Deno.env.get("RESEND_API_KEY")) {
            const target = await supabase.from("profiles").select("email").eq("id", referrer.referrer_id).single();
            checked(target);
            if (target.data?.email) await sendEmail(buildRewardEmail(target.data.email, settings), `signup-reward/${userId}`);
          }
        }
      }
      checked(await supabase.from("marketing_events").insert({ event_name: "user_signup", source: provider, user_id: userId, properties: { referred_by: referredBy } }));
      checked(await supabase.from("automation_log").insert({ title: "New user signup", category: "signup", details: `Provider: ${provider}`, source: "on-user-signup" }));
      checked(await supabase.rpc("increment_daily_signups", { target_date: new Date().toISOString().split("T")[0] }));
    }
    const token = crypto.randomUUID();
    const configured = !!Deno.env.get("RESEND_API_KEY");
    const emailClaim = await supabase.rpc("claim_signup_email", { p_user_id: userId, p_token: token, p_provider_configured: configured });
    checked(emailClaim);
    const failReservation = async () => {
      checked(await supabase.from("signup_processing").update({ email_status: "failed", updated_at: new Date().toISOString() })
        .eq("user_id", userId).eq("email_reservation_token", token).eq("email_status", "pending"));
    };
    if (!configured) {
      if (emailClaim.data) await failReservation();
      console.log("[EMAIL SKIPPED] provider not configured");
    } else if (emailClaim.data) {
      const profile = await supabase.from("profiles").select("referral_code").eq("id", userId).single();
      checked(profile);
      // Keep the provider key stable across tokens, including still-running expired owners.
      const id = await sendEmail(buildWelcomeEmail(email, profile.data?.referral_code || "", settings), `signup-welcome/${userId}`);
      if (id) {
        checked(await supabase.rpc("confirm_signup_email", { p_user_id: userId, p_token: token, p_email_id: id }));
      } else {
        await failReservation();
      }
    }
    return Response.json(duplicate ? { duplicate: true } : { success: true });
  } catch {
    console.error("Signup processing failed");
    return new Response("Processing unavailable", { status: 503 });
  }
});
