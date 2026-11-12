import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8089";
const OUT = process.env.OUT_DIR || "e2e/screens/leaderboard-hole-strip";
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
  for (const spec of [
    { id: "hole-strip-two-player", count: 2, played: 2, expectedPerPlayer: [2, 1] },
    { id: "hole-strip-sixteen-player", count: 16, played: 9, expectedPerPlayer: Array(16).fill(3) },
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.route("**/*", route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on("pageerror", error => errors.push(error.message));
    const contest = fixture(spec.id, spec.count, spec.played);
    await page.addInitScript(value => {
      localStorage.setItem("snapscore-contests", JSON.stringify({ version: 0, state: { contests: [value], activeContestId: value.id } }));
      localStorage.setItem("snapscore-onboarding", JSON.stringify({ version: 0, state: { hasCompletedOnboarding: true, hasSeenDemo: true } }));
      const user = { id: "hole-strip-preview", name: "Preview Golfer", provider: "anonymous" };
      localStorage.setItem("snapscore-auth", JSON.stringify({ version: 0, state: { session: { user }, user, isAnonymous: true, isInitialized: true } }));
    }, contest);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.getByText(course.name, { exact: true }).click();
    await page.waitForURL(new RegExp(`/contest/${spec.id}$`));
    await page.waitForTimeout(1500);
    await page.getByRole("tab", { name: /^leaderboard$/i }).click();
    for (let index = 0; index < spec.count; index++) {
      const playerId = `player-${index + 1}`;
      const chips = page.locator(`[data-testid^="leaderboard-hole-chip-${playerId}-"]`);
      await page.getByTestId(`leaderboard-player-Player${index + 1}`).waitFor({ state: "visible" });
      await chips.first().waitFor({ state: "visible" }).catch(async () => {
        if (spec.expectedPerPlayer[index] !== 0) throw new Error(`${playerId} chip did not render`);
      });
      assert.equal(await chips.count(), spec.expectedPerPlayer[index], `${playerId} has only played-hole chips`);
    }
    assert.deepEqual(errors, [], "no page errors");
    const screenshot = path.join(OUT, `${spec.id}-390x844.png`);
    await page.screenshot({ path: screenshot });
    console.log(`PASS ${spec.id}: ${screenshot}`);
    await context.close();
  }
} finally {
  await browser.close();
}
