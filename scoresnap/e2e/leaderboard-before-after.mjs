// AUG-670 evidence: 390x844 individual-leaderboard screenshots for 16 and 72 players.
// Usage: BASE_URL=http://127.0.0.1:8091 LABEL=before OUT_DIR=... node e2e/leaderboard-before-after.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8089";
const LABEL = process.env.LABEL || "run";
const OUT = process.env.OUT_DIR || "e2e/screens/leaderboard-before-after";
const course = {
  name: "Direction A Preview Course",
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 380 })),
};

// Deterministic scores; the modulo makes many players tie so the T# display is exercised.
function fixture(id, count) {
  const players = Array.from({ length: count }, (_, p) => ({
    id: `player-${p + 1}`,
    name: `Player${p + 1}`,
    handicap: 0,
    team: null,
    scores: course.holes.map((_, h) => (h >= 9 ? 0 : 4 + ((p + h) % 5) - 1)),
  }));
  const groups = Array.from({ length: Math.ceil(count / 4) }, (_, g) => ({
    id: `group-${g + 1}`,
    name: `Group ${g + 1}`,
    players: players.slice(g * 4, g * 4 + 4),
  }));
  return { id, name: `${count}-player leaderboard fixture`, course, status: "active", betUnit: 0, hasTeams: false, groups, games: ["stroke_play"], createdAt: "2026-11-04T12:00:00.000Z" };
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
try {
  for (const count of [16, 72]) {
    const id = `lb-${count}`;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.route("**/*", (r) => (new URL(r.request().url()).origin === new URL(BASE).origin ? r.continue() : r.abort()));
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript((value) => {
      localStorage.setItem("snapscore-contests", JSON.stringify({ version: 0, state: { contests: [value], activeContestId: value.id } }));
      localStorage.setItem("snapscore-onboarding", JSON.stringify({ version: 0, state: { hasCompletedOnboarding: true, hasSeenDemo: true } }));
      const user = { id: "evidence", name: "Preview Golfer", provider: "anonymous" };
      localStorage.setItem("snapscore-auth", JSON.stringify({ version: 0, state: { session: { user }, user, isAnonymous: true, isInitialized: true } }));
    }, fixture(id, count));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.getByText(course.name, { exact: true }).click();
    await page.waitForURL(new RegExp(`/contest/${id}$`));
    await page.waitForTimeout(1500);
    await page.getByRole("tab", { name: /^leaderboard$/i }).click();
    await page.getByTestId(/^leaderboard-player-/).first().waitFor({ state: "visible" });
    await page.waitForTimeout(800);
    const file = path.join(OUT, `${LABEL}-${count}-player-390x844.png`);
    await page.screenshot({ path: file });
    console.log(`captured ${file}`);
    await context.close();
  }
  if (errors.length) { console.error("page errors:", errors); process.exitCode = 1; }
} finally {
  await browser.close();
}
