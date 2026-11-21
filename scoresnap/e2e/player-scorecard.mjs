import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8089";
const OUT = process.env.OUT_DIR || "e2e/screens/player-scorecard";
const course = {
  name: "Direction A Preview Course",
  holes: Array.from({ length: 18 }, (_, index) => ({ num: index + 1, par: 4, hcp: index + 1, yards: 380 })),
};

function fixture(id, count, playedHoles) {
  const players = Array.from({ length: count }, (_, playerIndex) => ({
    id: `player-${playerIndex + 1}`,
    name: `Player${playerIndex + 1}`,
    handicap: 0,
    team: null,
    scores: course.holes.map((_, holeIndex) => {
      if (holeIndex >= playedHoles) return 0;
      if (count === 2 && playerIndex === 0) return holeIndex === 0 ? 3 : holeIndex === 1 ? 4 : 0;
      if (count === 2) return holeIndex === 0 ? 5 : 0;
      return 4 + ((playerIndex + holeIndex) % 5) - 1;
    }),
  }));
  const groups = Array.from({ length: Math.ceil(count / 4) }, (_, groupIndex) => ({
    id: `group-${groupIndex + 1}`,
    name: `Group ${groupIndex + 1}`,
    players: players.slice(groupIndex * 4, groupIndex * 4 + 4),
  }));
  return {
    id,
    name: `${count}-player leaderboard fixture`,
    course,
    status: "active",
    betUnit: 0,
    hasTeams: false,
    groups,
    games: ["stroke_play"],
    createdAt: "2026-11-04T12:00:00.000Z",
  };
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
try {
  const id = "player-scorecard-fixture";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.route("**/*", route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => errors.push(error.message));
  const contest = fixture(id, 4, 12);
  await page.addInitScript(value => {
    localStorage.setItem("snapscore-contests", JSON.stringify({ version: 0, state: { contests: [value], activeContestId: value.id } }));
    localStorage.setItem("snapscore-onboarding", JSON.stringify({ version: 0, state: { hasCompletedOnboarding: true, hasSeenDemo: true } }));
    const user = { id: "scorecard-preview", name: "Preview Golfer", provider: "anonymous" };
    localStorage.setItem("snapscore-auth", JSON.stringify({ version: 0, state: { session: { user }, user, isAnonymous: true, isInitialized: true } }));
  }, contest);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByText(course.name, { exact: true }).click();
  await page.waitForURL(new RegExp(`/contest/${id}$`));
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: /^leaderboard$/i }).click();
  await page.getByTestId("leaderboard-player-Player2").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(OUT, "leaderboard-390x844.png") });
  await page.getByTestId("leaderboard-player-Player2").click();
  await page.getByTestId("player-scorecard-sheet").waitFor({ state: "visible" });
  assert.equal((await page.getByTestId("player-scorecard-name").innerText()).trim(), "Player2");
  const expected = contest.groups.flatMap(g => g.players).find(p => p.name === "Player2").scores;
  for (const n of [1, 12]) {
    const row = await page.getByTestId(`player-scorecard-hole-${n}`).innerText();
    assert.ok(row.replace(/\s+/g, " ").includes(String(expected[n - 1])), `hole ${n} shows its strokes`);
  }
  const total = expected.reduce((a, b) => a + b, 0);
  assert.ok((await page.getByTestId("player-scorecard-total").innerText()).includes(String(total)), "total matches");
  await page.screenshot({ path: path.join(OUT, "player-scorecard-390x844.png") });
  await page.getByTestId("player-scorecard-close").click();
  await page.getByTestId("player-scorecard-sheet").waitFor({ state: "hidden" });
  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS player scorecard open/close + values");
  await context.close();
} finally {
  await browser.close();
}
