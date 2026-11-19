import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8090";
const OUT = process.env.OUT_DIR || "e2e/screens/leaderboard-round-columns";
const id = "aug819-round-columns-16";
const course = {
  name: "Round Columns GC",
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 380 })),
};

function scoresFor(total) {
  const scores = Array(18).fill(4);
  let delta = total - 72;
  for (let i = 0; delta !== 0; i = (i + 1) % scores.length) {
    if (delta > 0) { scores[i] += 1; delta--; }
    else if (scores[i] > 1) { scores[i] -= 1; delta++; }
  }
  return scores;
}
function roundGroups(roundNumber) {
  const players = Array.from({ length: 16 }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${String(index + 1).padStart(2, "0")}`,
    handicap: 0,
    team: null,
    scores: scoresFor((roundNumber === 1 ? 68 : 66) + index),
  }));
  return Array.from({ length: 4 }, (_, groupIndex) => ({
    id: `r${roundNumber}-g${groupIndex + 1}`,
    name: `Group ${groupIndex + 1}`,
    players: players.slice(groupIndex * 4, groupIndex * 4 + 4),
  }));
}
const rounds = [1, 2].map((number) => ({
  id: `round-${number}`, number, name: `Round ${number}`, course, groups: roundGroups(number),
}));
const contest = {
  id,
  name: "Round Columns 16-Player Fixture",
  course,
  status: "active",
  betUnit: 0,
  hasTeams: false,
  groups: rounds[1].groups,
  games: ["stroke_play"],
  createdAt: "2026-11-09T12:00:00.000Z",
  isTournament: true,
  rounds,
  currentRound: 2,
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
try {
  await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((value) => {
    localStorage.setItem("snapscore-contests", JSON.stringify({ version: 0, state: { contests: [value], activeContestId: value.id } }));
    localStorage.setItem("snapscore-onboarding", JSON.stringify({ version: 0, state: { hasCompletedOnboarding: true, hasSeenDemo: true } }));
    const user = { id: "aug819-preview", name: "Preview Golfer", provider: "anonymous" };
    localStorage.setItem("snapscore-auth", JSON.stringify({ version: 0, state: { session: { user }, user, isAnonymous: true, isInitialized: true } }));
    globalThis.__SNAPSCORE_FIXTURE_YOU__ = "p3";
  }, contest);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.setDefaultTimeout(8000);
  await page.waitForTimeout(1000);
  await page.getByText(course.name, { exact: true }).click();
  await page.waitForURL(new RegExp(`/contest/${id}$`));
  await page.getByRole("tab", { name: /^leaderboard$/i }).click();
  await page.getByTestId("leaderboard-round-columns").waitFor({ state: "visible" });
  const rows = page.locator('[data-testid^="leaderboard-player-"]');
  assert.equal(await rows.count(), 16, "fixture displays the full 16-player field");
  for (const playerId of ["p3", "p1", "p2"]) {
    await page.getByTestId(`leaderboard-r1-${playerId}`).waitFor({ state: "visible" });
    await page.getByTestId(`leaderboard-today-${playerId}`).waitFor({ state: "visible" });
  }
  assert.equal(await page.getByTestId("leaderboard-r1-p3").innerText(), "70");
  assert.equal(await page.getByTestId("leaderboard-today-p3").innerText(), "−4");
  assert.deepEqual(errors, [], "no page errors");
  const screenshot = path.join(OUT, "two-round-16-player-390x844.png");
  await page.screenshot({ path: screenshot });
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(screenshot)).digest("hex");
  console.log(`PASS screenshot=${screenshot} rows=16 viewport=390x844 sha256=${sha256}`);
} finally {
  await context.close();
  await browser.close();
}
