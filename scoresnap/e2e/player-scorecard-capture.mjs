import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// AUG-707 / AUG-705b: tap leaderboard row -> player scorecard at 390x844.
const BASE = process.env.BASE_URL || "http://127.0.0.1:8089";
const OUT = process.env.OUT_DIR || "docs/evidence";
const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const course = { name: "Direction A Preview Course", holes: pars.map((par, i) => ({ num: i + 1, par, hcp: i + 1, yards: 380 })) };
const names = ["Avery", "Blake", "Casey", "Drew"];
const contest = {
  id: "scorecard-fixture", name: "Scorecard fixture", course, status: "active", betUnit: 0, hasTeams: false,
  games: ["stroke_play"], createdAt: "2026-11-04T12:00:00.000Z",
  groups: [{ id: "group-1", name: "Group 1", players: names.map((n, p) => ({
    id: `player-${p + 1}`, name: n, handicap: p * 4, team: null,
    scores: course.holes.map((h, i) => (i >= 14 ? 0 : Math.max(2, h.par + ((p * 3 + i * 7) % 4) - 1))),
  })) }],
};
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.route("**/*", r => new URL(r.request().url()).origin === new URL(BASE).origin ? r.continue() : r.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(value => {
    localStorage.setItem("snapscore-contests", JSON.stringify({ version: 0, state: { contests: [value], activeContestId: value.id } }));
    localStorage.setItem("snapscore-onboarding", JSON.stringify({ version: 0, state: { hasCompletedOnboarding: true, hasSeenDemo: true } }));
    const user = { id: "preview", name: "Preview Golfer", provider: "anonymous" };
    localStorage.setItem("snapscore-auth", JSON.stringify({ version: 0, state: { session: { user }, user, isAnonymous: true, isInitialized: true } }));
  }, contest);
  await page.goto(`${BASE}/contest/scorecard-fixture`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: /^leaderboard$/i }).click();
  await page.getByTestId("leaderboard-player-Avery").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(OUT, "AUG-707-leaderboard-390x844.png") });
  await page.getByTestId("leaderboard-player-Avery").click();
  await page.getByTestId("player-scorecard-player-1").waitFor({ state: "visible" });
  assert.ok(await page.getByTestId("scorecard-strokes-player-1-1").isVisible(), "hole 1 strokes visible");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "AUG-707-player-scorecard-390x844.png") });
  await page.getByTestId("player-scorecard-back").click();
  await page.getByTestId("leaderboard-player-Avery").waitFor({ state: "visible" });
  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS row tap -> scorecard -> back");
} finally { await browser.close(); }
