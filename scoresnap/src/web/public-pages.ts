import { PRIVACY_PATH, SUPPORT_EMAIL, SUPPORT_PATH, TERMS_PATH } from "../config/support";
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
<p class="lede">Scan a scorecard, check the scores, and settle the game.</p>
<p>Help, account deletion, and how a round works are on the <a href="${SUPPORT_PATH}">support page</a>. How SnapScore handles information is in the <a href="${PRIVACY_PATH}">privacy policy</a>.</p>
<p>Email ${contactLink()}.</p>`);
}

export function renderSupportPage() {
  return shell(SUPPORT_PATH, "Support · SnapScore", `<h1>Support</h1>
<p class="lede">SnapScore reads a printed scorecard, lets you correct the scores, and adds up the games in the round.</p>
<p>Email ${contactLink()} and we will write back.</p>
<h2>Common questions</h2>
<article>
<h3>Scanning a scorecard</h3>
<p>Open the scanner and photograph the printed card. SnapScore reads the scores on the phone first. If that read is uncertain, the photo may be sent for another read. Either way, you get a review screen before the scores are saved.</p>
</article>
<article>
<h3>Reviewing and fixing scores</h3>
<p>The review screen lists every score it found. Change any number that looks wrong, then tap Confirm &amp; Calculate. Until you confirm, the scan is not added to the round.</p>
</article>
<article>
<h3>Settling games</h3>
<p>When the round is finished, open the contest and its settlement. SnapScore totals each game and shows who owes whom from the scores that are saved.</p>
</article>
<article>
<h3>Joining a shared round with a code</h3>
<p>Ask the organizer for the round's code. Choose Join, enter that code, and enter your name. Right now the code works in the same browser on the device where the round was created. It does not yet open the round on a different phone.</p>
</article>
<article>
<h3>If a scan is wrong</h3>
<p>Fix the bad holes on the review screen before you confirm. If the whole card looks off, scan it again. After the round is saved, you can still correct a hole on the scorecard. Settlement uses the corrected scores.</p>
</article>
<h2 id="data-deletion">Delete your data</h2>
<p>In the SnapScore app, open Settings and tap Delete Account. Confirm that you want to delete everything, then confirm again. The app removes the rounds, scores, statistics, and settings stored on that device and signs you out.</p>
<p>Deleting the account in the app does not automatically delete data stored on SnapScore's servers. To request deletion of that server data, email ${contactLink()}. That request is how server data is removed. The app does not do it for you.</p>
<p class="note">The <a href="${PRIVACY_PATH}">privacy policy</a> describes what the app handles.</p>`);
}

/** Render the verified privacy-policy markdown. The wording is not rewritten here. */
export function renderPrivacyPage(markdown: string) {
  return shell(PRIVACY_PATH, "Privacy policy · SnapScore", markdownToHtml(markdown));
}

/** Render the terms markdown. The wording is not rewritten here. */
export function renderTermsPage(markdown: string) {
  return shell(TERMS_PATH, "Terms of Service — SnapScore Golf", markdownToHtml(markdown));
}
