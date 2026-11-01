// Pure signup decisions and email payloads; no runtime or network dependencies.
export async function checkWebhookSecret(expected: string | undefined, supplied: string | null): Promise<number | null> {
  if (!expected) return 503;
  // Hash to fixed-size buffers before comparing every byte (including for unequal lengths).
  const digest = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(expected), digest(supplied ?? "")]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0 && supplied !== null ? null : 401;
}

export function referralRewardEnabled(value?: string): boolean { return value === "true"; }
export function referralPlan(count: number, enabled: boolean, now: string) {
  return {
    countUpdate: { referral_count: count },
    premiumUpdate: enabled && count === 3 ? {
      is_premium: true, premium_since: now, premium_source: "referral_reward",
    } : null,
    sendReward: enabled && count === 3,
  };
}
export function emailSettings(env: { EMAIL_FROM?: string; EMAIL_REPLY_TO?: string; EMAIL_UNSUBSCRIBE_URL?: string }) {
  return {
    from: env.EMAIL_FROM || "SnapScore <hello@scoresnap.app>",
    replyTo: env.EMAIL_REPLY_TO || "hello@scoresnap.app",
    unsubscribeUrl: env.EMAIL_UNSUBSCRIBE_URL || "mailto:hello@scoresnap.app?subject=Unsubscribe%20from%20SnapScore%20emails",
  };
}
type Settings = ReturnType<typeof emailSettings>;
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}
function unsubscribeFooter(url: string): string {
  return `<p><a href="${escapeHtml(url)}" style="color: #9ca3af; font-size: 13px;">Unsubscribe</a></p>`;
}
function commonPayload(email: string, settings: Settings) {
  return { from: settings.from, to: email, reply_to: settings.replyTo,
    headers: { "List-Unsubscribe": `<${settings.unsubscribeUrl}>` } };
}
export function buildWelcomeEmail(email: string, referralCode: string, settings: Settings) {
  return { ...commonPayload(email, settings),
    subject: "Welcome to SnapScore — Your first scan is waiting 🏌️",
    html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 20px 0;">
            <h1 style="color: #16a34a; font-size: 28px; margin: 0;">Welcome to SnapScore ⛳</h1>
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
              <li>🎲 <strong>Pick a game</strong> — Nassau, Skins, Wolf and more</li>
              <li>💰 <strong>Settle up</strong> — no more "I'll get you next time"</li>
            </ol>
          </div>

          <div style="background: #16a34a; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
            <h3 style="color: white; margin-top: 0;">Your referral code: ${escapeHtml(referralCode)}</h3>
            <p style="color: #dcfce7; font-size: 14px;">
              Share this with your foursome. When 3 friends sign up and complete a scan,
              you unlock a <strong>free month of Premium</strong> — 50+ game modes, stats tracking, and league play.
            </p>
          </div>

          <div style="text-align: center; padding: 20px 0; color: #9ca3af; font-size: 13px;">
            <p>SnapScore by Autumn8me, Inc.</p>
            ${unsubscribeFooter(settings.unsubscribeUrl)}
            <p>The app that knows who owes who.</p>
          </div>
        </div>
      `,
  };
}
export function buildRewardEmail(email: string, settings: Settings) {
  return { ...commonPayload(email, settings),
    subject: "🎉 You earned free Premium! 3 friends joined SnapScore",
    html: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
                <h1 style="color: #16a34a;">You did it! 🏆</h1>
                <p>3 of your friends signed up with your code. Your free month of Premium is now active.</p>
                <p style="font-size: 14px; color: #6b7280;">Keep sharing — every 3 additional referrals = another free month.</p>
                <div style="text-align: center; padding: 20px 0; color: #9ca3af; font-size: 13px;">
                  ${unsubscribeFooter(settings.unsubscribeUrl)}
                </div>
              </div>`,
  };
}
