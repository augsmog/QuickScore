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
export function emailSettings(env: { EMAIL_FROM?: string; EMAIL_REPLY_TO?: string; EMAIL_UNSUBSCRIBE_URL?: string; APP_URL?: string }) {
  return {
    appUrl: env.APP_URL || "https://snapscore.autumn8.me",
    from: env.EMAIL_FROM || "SnapScore <hello@scoresnap.app>",
    replyTo: env.EMAIL_REPLY_TO || "hello@scoresnap.app",
    unsubscribeUrl: env.EMAIL_UNSUBSCRIBE_URL || "mailto:hello@scoresnap.app?subject=Unsubscribe%20from%20SnapScore%20emails",
  };
}
type Settings = ReturnType<typeof emailSettings>;
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}
const serif = "'Marcellus', Georgia, serif";
const sans = "'Source Sans 3', Helvetica, Arial, sans-serif";
const intro = "Score your round, play side games, and see who owes what when it's done.";
const disclaimer = "SnapScore doesn't hold or move money. Your group settles up directly.";
const bodyLine = "Now your group can sort out who owes what before you reach the parking lot.";
// Referral codes remain held until AUG-275, regardless of reward configuration.
const referralLine = "Share SnapScore with your group.";
const steps = [
  "Add your players and pick your games — choose from 50+ game modes, including Skins, Nassau and Wolf.",
  "Score your round, hole by hole or from a photo.",
  "Settle up.",
];
function footer(url: string): string {
  return `<tr><td style="border-top:1px solid #E3D9C6;padding:20px 0 0;text-align:center;color:#5E6257;font-size:14px;line-height:24px;">Autumn8me, Inc.<br><a href="${escapeHtml(url)}" style="color:#5E6257;">Unsubscribe</a> | Questions? Just reply.</td></tr>`;
}
function textFooter(url: string): string {
  return `Autumn8me, Inc.\nUnsubscribe: ${url} | Questions? Just reply.`;
}
function frame(content: string, settings: Settings, preheader = ""): string {
  return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Marcellus&amp;family=Source+Sans+3:wght@400;600&amp;display=swap" rel="stylesheet"></head><body style="margin:0;background-color:#FAF4E8;color:#17251E;font-family:${sans};"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#FAF4E8"><tr><td class="canvas" align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;"><tr><td class="card" bgcolor="#FAF4E8" style="padding:28px clamp(20px,6vw,36px);"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${content}${footer(settings.unsubscribeUrl)}</table></td></tr></table></td></tr></table></body></html>`;
}
function commonPayload(email: string, settings: Settings) {
  return { from: settings.from, to: email, reply_to: settings.replyTo,
    headers: { "List-Unsubscribe": `<${settings.unsubscribeUrl}>` } };
}
export function buildWelcomeEmail(email: string, _referralCode: string, settings: Settings) {
  const rows = steps.map((title, i) => `<tr><td style="padding:0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="64" valign="top" style="padding-top:18px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="44" height="44" align="center" bgcolor="#E7EEE6" style="border-radius:50%;color:#175C3A;font-family:${serif};font-size:24px;">${i + 1}</td></tr>${i < 2 ? '<tr><td height="58" style="background:linear-gradient(to right,transparent 21px,#E3D9C6 21px,#E3D9C6 22px,transparent 22px);"></td></tr>' : ''}</table></td><td style="padding:18px 0 24px;${i < 2 ? 'border-bottom:1px solid #E3D9C6;' : ''}"><p class="step-title" style="margin:0 0 6px;font-family:${serif};font-size:clamp(20px, 4vw, 24px);line-height:1.25;">${title}</p></td></tr></table></td></tr>`).join("");
  return { ...commonPayload(email, settings), subject: "Welcome to SnapScore — let's set up your first round",
    html: frame(`<tr><td style="text-align:center;border-bottom:1px solid #E3D9C6;padding:0 0 24px;font-family:${serif};font-size:36px;">SnapScore</td></tr><tr><td style="text-align:center;padding:28px 0;border-bottom:1px solid #E3D9C6;"><h1 class="heading" style="margin:0 0 24px;color:#175C3A;font-family:${serif};font-weight:400;font-size:clamp(38px, 8vw, 52px);line-height:1.05;">Welcome to<br>SnapScore</h1><p style="margin:0;color:#5E6257;font-size:20px;line-height:1.4;">${intro}</p><p style="margin:20px 0 0;color:#5E6257;font-size:18px;line-height:1.4;">${bodyLine}</p></td></tr>${rows}<tr><td style="padding:16px 0;font-size:18px;">${referralLine}</td></tr><tr><td style="border-top:1px solid #E3D9C6;padding:16px 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" bgcolor="#175C3A" style="border-radius:16px;"><a href="${escapeHtml(settings.appUrl)}" style="display:block;padding:16px;color:#FFFFFF;font-family:${serif};font-size:22px;text-decoration:none;">Start a round</a></td></tr></table><p style="margin:12px 0 24px;text-align:center;color:#5E6257;font-size:14px;line-height:21px;">SnapScore doesn't hold or move money.<br>Your group settles up directly.</p></td></tr>`, settings, intro),
    text: `SnapScore\n\nWelcome to SnapScore\n\n${intro}\n\n${bodyLine}\n\n${steps.map((title, i) => `${i + 1}. ${title}`).join("\n\n")}\n\n${referralLine}\n\nStart a round: ${settings.appUrl}\n\n${disclaimer}\n\n${textFooter(settings.unsubscribeUrl)}`,
  };
}
export function buildRewardEmail(email: string, settings: Settings) {
  const body = "Three friends signed up with your code, so your free month of Pro is active.";
  return { ...commonPayload(email, settings), subject: "You earned a free month of Pro.",
    html: frame(`<tr><td style="padding:0 0 24px;font-size:18px;line-height:1.5;">${body}</td></tr>`, settings),
    text: `${body}\n\n${textFooter(settings.unsubscribeUrl)}`,
  };
}
