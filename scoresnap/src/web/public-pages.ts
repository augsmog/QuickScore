import { PRIVACY_PATH, SUPPORT_BASE_URL, SUPPORT_EMAIL, SUPPORT_PATH, TERMS_PATH } from "../config/support";
import { markdownToHtml } from "./markdown";

const MAILTO = `mailto:${SUPPORT_EMAIL}`;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #FAF4E8;
    color: #17251E;
    font-family: "Avenir Next", "Segoe UI", sans-serif;
    font-size: 17px;
    line-height: 1.5;
  }
  a { color: #175C3A; }
  a:focus-visible, .skip:focus { outline: 3px solid #175C3A; outline-offset: 3px; }
  .skip {
    position: absolute;
    left: 16px;
    top: 16px;
    transform: translateY(-160%);
    background: #175C3A;
    color: #FFFFFF;
    border-radius: 12px;
    padding: 10px 14px;
    text-decoration: none;
  }
  .skip:focus { transform: none; }
  header, main { width: 100%; max-width: 40rem; margin: 0 auto; padding-left: 20px; padding-right: 20px; }
  header { padding-top: 28px; }
  .brand { margin: 0; font-family: Georgia, "Iowan Old Style", Palatino, serif; font-size: 1.25rem; letter-spacing: -0.02em; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  nav a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid #E3D9C6;
    border-radius: 12px;
    background: #FFFFFF;
    text-decoration: none;
  }
  nav a[aria-current="page"] { border-color: #175C3A; }
  main { padding-top: 8px; padding-bottom: 64px; }
  h1 { margin: 20px 0 8px; font-family: Georgia, "Iowan Old Style", Palatino, serif; font-size: 2rem; font-weight: 400; letter-spacing: -0.03em; line-height: 1.2; }
  h2 { margin: 32px 0 8px; font-family: Georgia, "Iowan Old Style", Palatino, serif; font-size: 1.35rem; font-weight: 400; }
  h3 { margin: 0 0 6px; font-size: 1.05rem; }
  p, li { margin: 0 0 12px; }
  p, li, td, th, code { overflow-wrap: anywhere; }
  code { font-size: 0.92em; }
  .policy-table { max-width: 100%; overflow-x: auto; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #E3D9C6; padding: 8px 10px; text-align: left; vertical-align: top; background: #FFFFFF; }
  th { font-weight: 600; }
  ol, ul { padding-left: 1.25rem; }
  .lede, .note { color: #3E463C; }
  .contact { display: inline-block; padding: 8px 0; overflow-wrap: anywhere; }
  article {
    background: #FFFFFF;
    border: 1px solid #E3D9C6;
    border-radius: 16px;
    padding: 16px;
    margin: 0 0 12px;
  }
  @media (max-width: 390px) {
    header, main { padding-left: 16px; padding-right: 16px; }
    h1 { font-size: 1.75rem; }
  }
`;

function shell(path: string, title: string, main: string) {
  const supportCurrent = path === SUPPORT_PATH ? ' aria-current="page"' : "";
  const privacyCurrent = path === PRIVACY_PATH ? ' aria-current="page"' : "";
  const termsCurrent = path === TERMS_PATH ? ' aria-current="page"' : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${SUPPORT_BASE_URL}${path}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SUPPORT_BASE_URL}${path}">
<meta property="og:site_name" content="SnapScore">
<meta property="og:title" content="${escapeHtml(title)}">
<meta name="twitter:card" content="summary">
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header>
<p class="brand">SnapScore</p>
<nav aria-label="SnapScore pages">
<a href="${SUPPORT_PATH}"${supportCurrent}>Support</a>
<a href="${PRIVACY_PATH}"${privacyCurrent}>Privacy policy</a>
<a href="${TERMS_PATH}"${termsCurrent}>Terms</a>
</nav>
</header>
<main id="content">
${main}
</main>
</body>
</html>
`;
}

function contactLink() {
  return `<a class="contact" href="${MAILTO}">${escapeHtml(SUPPORT_EMAIL)}</a>`;
}

export function renderHomePage() {
  return shell("/", "SnapScore", `<h1>SnapScore</h1>
<p class="lede">Score your round, run your games, and see who owes what. Got a paper card? Scan it.</p>
<p>Help, account deletion, and how a round works are on the <a href="${SUPPORT_PATH}">support page</a>. How SnapScore handles information is in the <a href="${PRIVACY_PATH}">privacy policy</a>.</p>
<p>Email ${contactLink()}.</p>`);
}

export function renderSupportPage() {
  return shell(SUPPORT_PATH, "Support · SnapScore", `<h1>Support</h1>
<p class="lede">SnapScore helps golf groups record rounds, run side games and see who owes what. Enter scores by hand or choose to scan a paper scorecard and review the results before saving.</p>
<p><strong>Need help?</strong> Email <a class="contact" href="mailto:hello@snapscore.autumn8.me">hello@snapscore.autumn8.me</a>.</p>
<h2>Frequently asked questions</h2>
<article>
<h3>How do I record a round?</h3>
<p>Create a round, add your players, choose the games, then enter scores hole by hole. You can also enter scores from a paper card.</p>
</article>
<article>
<h3>How does scorecard scanning work?</h3>
<p>Scanning is optional. If you choose it, the app sends a photo to a cloud service to read the card. Check the extracted scores and correct them before saving. You can always enter scores by hand.</p>
</article>
<article>
<h3>Which games can I play?</h3>
<p>SnapScore includes 50+ game modes, including Skins, Nassau, Wolf and Stableford. Available formats and player limits vary by game; the app shows the options supported for your group.</p>
</article>
<article>
<h3>How does Settle Up work?</h3>
<p>Settle Up calculates who owes what from the scores and games recorded in the round. SnapScore does not move money or process payments. Your group handles any settlement outside the app.</p>
</article>
<article>
<h3>How do subscriptions and Restore Purchases work?</h3>
<p>Open Profile and choose Upgrade to see the current subscription options and terms. If you already subscribed through your Apple account, use Restore Purchases on that page. For a charge or access issue, contact Apple Support for billing and email us with the app version and a description of what happened.</p>
</article>
<article>
<h3>How do I delete my account?</h3>
<p>In the app, open Profile, then Account, and choose Delete Account. Follow the confirmation steps. If you cannot access the app, email us from the address associated with your account and ask for account deletion; do not include your password.</p>
</article>
<article>
<h3>Where can I read the privacy information?</h3>
<p>Read the <a href="${PRIVACY_PATH}">Privacy Policy</a> and <a href="${TERMS_PATH}">Terms of Use</a>. Scanning sends a scorecard image to a cloud service only after you choose to scan.</p>
</article>
<article>
<h3>How can I contact support?</h3>
<p>Email <a class="contact" href="mailto:hello@snapscore.autumn8.me">hello@snapscore.autumn8.me</a>. Include your app version and device model. Please leave out passwords, payment details and other sensitive information.</p>
</article>`);
}

/** Render the verified privacy-policy markdown. The wording is not rewritten here. */
export function renderPrivacyPage(markdown: string) {
  return shell(PRIVACY_PATH, "Privacy policy · SnapScore", markdownToHtml(markdown));
}

/** Render the terms markdown. The wording is not rewritten here. */
export function renderTermsPage(markdown: string) {
  return shell(TERMS_PATH, "Terms of Service — SnapScore Golf", markdownToHtml(markdown));
}
