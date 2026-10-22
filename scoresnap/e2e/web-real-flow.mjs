// Real-app web verification for SnapScore (no mockups).
// Drives the REAL exported web build (EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web)
// served with an SPA fallback, and saves real screenshots.
// Usage: BASE_URL=http://localhost:8089 OUT_DIR=./e2e/screens node e2e/web-real-flow.mjs
// Requires the `playwright` package and Chromium (npx playwright install chromium).
import { execFileSync } from "node:child_process";
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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
check(!/Sample Round/.test(await bodyText()), "Home has no implicit demo round");
await shot("01-home.png");

// 2. Create a foursome (Stroke Play + Skins + Nassau)
await vis(page.getByText(/^new contest$/i)).first().click();
await page.getByPlaceholder("Your name").fill("Augie");
await page.getByPlaceholder("Player 2 name").fill("Sam");
for (const [index, name] of [[3, "Lee"], [4, "Pat"]]) {
  await vis(page.getByText(/add player/i)).first().click();
  await page.getByPlaceholder(`Player ${index} name`).fill(name);
}
for (const [name, handicap] of [["Augie", "18"], ["Sam", "0"], ["Lee", "9"], ["Pat", "0"]]) {
  await page.getByTestId(`player-handicap-${name}`).fill(handicap);
}
await page.getByPlaceholder("Your name").click();
await shot("02-new-contest-players.png");
await vis(page.getByText(/^next/i)).last().click();
for (const g of ["Skins", "Nassau"]) await vis(page.getByText(g, { exact: true })).first().click();
check(await page.getByTestId("skins-mode-net").getAttribute("aria-checked") === "true", "Skins mode defaults to Net");
await page.getByTestId("skins-mode-gross").click();
check(await page.getByTestId("skins-mode-gross").getAttribute("aria-checked") === "true", "Gross skins toggle can be selected");
await page.getByTestId("skins-mode-net").click();
await page.getByTestId("skins-mode-net").scrollIntoViewIfNeeded();
await shot("03b-skins-mode-toggle.png");
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
  "Lee,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5",
  "Pat,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6",
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
check(scanData.length === 4, "Parser found exactly 4 players", JSON.stringify(scanData.map((p) => p.name)));
check(sam && sam.scores.length === 18 && sam.scores.every((s) => s === 4), "GS-2: all-4s row is parsed as player Sam (18 x 4), not as par");
check(augie && augie.scores.reduce((a, b) => a + b, 0) === 81, "Augie's real scores parsed (total 81)", augie ? String(augie.scores) : "missing");
check(scanData.every(p => p.scores.length === 18 && p.scores.every(s => s > 0)), "All four players have 18 scored holes");
check(/Sam/.test(reviewText) && /Augie/.test(reviewText), "Review screen shows parsed players");
check(!/Thompson|Chris L|J\. Parks|D\.R\./.test(reviewText), "GS-1: review shows no old sample players");
await shot("07-review-parsed-scorecard.png");

// 4. Confirm & import into the contest, then view results
await vis(page.getByText(/confirm/i)).last().click();
await page.waitForURL((u) => u.pathname === `/contest/${contestId}`, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);
check(page.url().startsWith(contestUrl), "Confirm returns to the contest", page.url());
await shot("08-contest-leaderboard.png");
const lb = await bodyText();
check(["81", "72", "90", "108"].every(total => lb.includes(total)), "Leaderboard shows all four real totals (81, 72, 90, 108)");
for (const [tab, file] of [[/^scorecard$/i, "09-scorecard.png"], [/^games$/i, "10-games.png"], [/^settlement$/i, "11-settlement.png"]]) {
  await vis(page.getByText(tab)).first().click();
  await page.waitForTimeout(1500);
  if (file === "10-games.png") {
    const games = await bodyText();
    check(/skins/i.test(games) && /\d+ skins/.test(games), "Skins leaderboard contains calculated results");
    check(/Nassau/.test(games) && /Front 9/.test(games) && /Back 9/.test(games) && /Overall/.test(games) && /\d+ up/.test(games), "Nassau leaderboard contains front, back and overall results");
  }
  if (file === "11-settlement.png") {
    for (const name of ["Augie", "Sam", "Lee", "Pat"]) {
      const row = page.getByTestId(`settlement-player-${name}`);
      await row.scrollIntoViewIfNeeded();
      const box = await row.boundingBox();
      check(box && box.y >= 0 && box.y + box.height <= 844, `Settlement row fully reachable: ${name}`);
    }
    await page.getByTestId("settlement-scroll").evaluate(el => { el.scrollTop = 0; });
  }
  await shot(file);
}
check(/\$/.test(await bodyText()), "Settlement screen shows money results");

// Verify both screens against the same persisted contest and calculator results.
// The first pass tests creation + persistence of Net; the second tests persisted Gross.
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("snapscore-contests")));
const savedContest = saved.state.contests.find(c => c.id === contestId);
check(savedContest.gameConfig?.skinsMode === "net", "Net mode persisted with contest");
check(savedContest.groups[0].players.find(p => p.name === "Augie").handicap === 18, "Player handicap persists through scorecard import");
const modeTotals = {};
for (const mode of ["net", "gross"]) {
  if (mode === "gross") {
    await page.evaluate((id) => {
      const data = JSON.parse(localStorage.getItem("snapscore-contests"));
      data.state.contests.find(c => c.id === id).gameConfig.skinsMode = "gross";
      localStorage.setItem("snapscore-contests", JSON.stringify(data));
    }, contestId);
  }
  const fixture = { ...savedContest, gameConfig: { ...savedContest.gameConfig, skinsMode: mode } };
  const expected = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const {calcSkins} = await import('./src/engine/calculators/skins.ts').then(m => m.default ?? m);
    const {calculateSettlement} = await import('./src/engine/settlement.ts').then(m => m.default ?? m);
    const c = JSON.parse(process.argv[1]);
    const players = c.groups.flatMap(g=>g.players);
    console.log(JSON.stringify({
      skins: calcSkins(players,c.course,false,c.gameConfig.skinsMode).totals,
      settlement: calculateSettlement(players,c.course,c.games,c.betUnit,c.auxiliaryData,c.gameConfig).netByPlayer
    }));
  `, JSON.stringify(fixture)], { encoding: "utf8" }));
  modeTotals[mode] = expected.skins;
  const label = mode === "net" ? "Net skins" : "Gross skins";
  await page.goto(contestUrl, {waitUntil:"networkidle"});
  await vis(page.getByText(/^games$/i)).first().click();
  await page.getByTestId("skins-result-skins-Augie").waitFor();
  check((await bodyText()).includes(label), `Games shows ${label}`);
  for (const [name,count] of Object.entries(expected.skins)) {
    check((await page.getByTestId(`skins-result-skins-${name}`).innerText()).includes(`${count} skins`), `${label}: Games skin count agrees for ${name}`);
  }
  if (mode === "gross") await shot("10b-games-gross.png");
  await vis(page.getByText(/^settlement$/i)).first().click();
  await page.getByTestId("settlement-skins-mode").waitFor();
  check(await page.getByTestId("settlement-skins-mode").innerText() === label, `Settlement shows ${label}`);
  for (const [name,amount] of Object.entries(expected.settlement)) {
    const rowText = await page.getByTestId(`settlement-player-${name}`).innerText();
    const money = amount === 0 ? "Even" : (amount > 0 ? "+" : "") + "$" + Math.abs(amount).toFixed(0);
    check(rowText.includes(money), `${label}: Settlement amount agrees for ${name}`, money);
  }
  if (mode === "gross") await shot("11b-settlement-gross.png");
}
check(JSON.stringify(modeTotals.net) !== JSON.stringify(modeTotals.gross), "Handicaps produce different Net and Gross skins");

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
