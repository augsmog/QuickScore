// Real-app web verification for SnapScore (no mockups).
// Drives the REAL exported web build (EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web)
// served with an SPA fallback, and saves real screenshots.
// Usage: BASE_URL=http://localhost:8089 OUT_DIR=./e2e/screens node e2e/web-real-flow.mjs
// Requires the `playwright` package and Chromium (npx playwright install chromium).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:8089";
const OUT = process.env.OUT_DIR || "e2e/screens";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok: !!ok, name, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const vis = (loc) => loc.locator("visible=true");
const shot = async (name) => {
  await page.waitForTimeout(800);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  console.log("screenshot:", file);
};
const bodyText = () => page.innerText("body");

// 1. Home
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await vis(page.getByText(/^new contest$/i)).first().waitFor();
check(/Precision Scoring/i.test(await bodyText()), "Home screen renders from real web build");
await shot("01-home.png");

// 2. Create a contest (Augie + Sam, Skins + Nassau)
await vis(page.getByText(/^new contest$/i)).first().click();
await page.getByPlaceholder("Your name").fill("Augie");
await page.getByPlaceholder("Player 2 name").fill("Sam");
await shot("02-new-contest-players.png");
await vis(page.getByText(/^next/i)).last().click();
for (const g of ["Skins", "Nassau"]) await vis(page.getByText(g, { exact: true })).first().click();
await shot("03-new-contest-games.png");
await vis(page.getByText(/^next/i)).last().click();
await vis(page.getByText(/start contest/i)).click();
await page.waitForURL(/\/contest\/[^/]+$/);
const contestUrl = page.url();
const contestId = contestUrl.split("/contest/")[1];
check(/No scores yet/i.test(await bodyText()), "New contest starts with no scores (no sample data)");
await shot("04-contest-created-empty.png");

// 3. GS-2 in the running app: enter a scorecard where Sam's row is all 4s.
// The pre-fix parser treated any row of 3-5 values as par and would have dropped Sam.
const scorecard = [
  "Hole,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18",
  "Par,4,5,4,3,4,3,4,5,4,4,4,3,5,4,5,3,4,4",
  "Augie,5,6,4,3,5,4,4,6,5,4,5,3,6,4,5,3,5,4",
  "Sam,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4",
].join("\n");
await page.goto(`${BASE}/scan?contestId=${contestId}`, { waitUntil: "networkidle" });
await page.getByTestId("scorecard-text-input").waitFor();
// Empty input must not navigate or invent data
await page.getByTestId("parse-scorecard-button").click();
await page.waitForTimeout(500);
check(/No players found/i.test(await bodyText()) && page.url().includes("/scan?"), "Empty scorecard text shows error and stays on scan screen");
await shot("05-scan-empty-error.png");
await page.getByTestId("scorecard-text-input").fill(scorecard);
await shot("06-scan-text-entered.png");
await page.getByTestId("parse-scorecard-button").click();
await page.waitForURL(/\/scan\/review/);
await page.waitForTimeout(1500);
const reviewText = await bodyText();
const reviewUrl = new URL(page.url());
const scanData = JSON.parse(reviewUrl.searchParams.get("scanData") || "[]");
const sam = scanData.find((p) => p.name === "Sam");
const augie = scanData.find((p) => p.name === "Augie");
check(scanData.length === 2, "Parser found exactly 2 players", JSON.stringify(scanData.map((p) => p.name)));
check(sam && sam.scores.length === 18 && sam.scores.every((s) => s === 4), "GS-2: all-4s row is parsed as player Sam (18 x 4), not as par");
check(augie && augie.scores.reduce((a, b) => a + b, 0) === 81, "Augie's real scores parsed (total 81)", augie ? String(augie.scores) : "missing");
check(/Sam/.test(reviewText) && /Augie/.test(reviewText), "Review screen shows both parsed players");
check(!/Thompson|Chris L|J\. Parks|D\.R\./.test(reviewText), "GS-1: review shows no old sample players");
await shot("07-review-parsed-scorecard.png");

// 4. Confirm & import into the contest, then view results
await vis(page.getByText(/confirm/i)).last().click();
await page.waitForURL((u) => u.pathname === `/contest/${contestId}`, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);
check(page.url().startsWith(contestUrl), "Confirm returns to the contest", page.url());
await shot("08-contest-leaderboard.png");
const lb = await bodyText();
check(/81/.test(lb) && /72/.test(lb), "Leaderboard shows real totals (Augie 81, Sam 72)");
for (const [tab, file] of [[/^scorecard$/i, "09-scorecard.png"], [/^games$/i, "10-games.png"], [/^settlement$/i, "11-settlement.png"]]) {
  await vis(page.getByText(tab)).first().click();
  await page.waitForTimeout(1500);
  await shot(file);
}
check(/\$/.test(await bodyText()), "Settlement screen shows money results");

// 5. GS-1: review screen without scan data must NOT fall back to sample data
await page.goto(`${BASE}/scan/review`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const noData = await bodyText();
check(/Invalid Scorecard Data/.test(noData) && /No scorecard data provided/.test(noData) && !/Thompson|Chris L/.test(noData), "GS-1: no scanData shows error, no sample players");
await shot("12-gs1-no-scan-data.png");
await page.goto(`${BASE}/scan/review?scanData=${encodeURIComponent("{not json")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
check(/Malformed scorecard data/.test(await bodyText()), "GS-1: malformed scanData shows error");
await shot("13-gs1-malformed-scan-data.png");
await page.goto(`${BASE}/scan/review?scanData=${encodeURIComponent("[]")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
check(/no players found/i.test(await bodyText()), "GS-1: empty player list shows error");
await shot("14-gs1-empty-scan-data.png");

check(pageErrors.length === 0, "No uncaught page errors", pageErrors.join(" | "));
await browser.close();
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, results, pageErrors }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
