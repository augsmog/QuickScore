import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8090";
const OUT = process.env.OUT_DIR || "e2e/screens/leaderboard-round-columns";
const FIELD_SIZE = Number(process.env.FIELD_SIZE ?? 16);
assert.ok([16, 72].includes(FIELD_SIZE), "FIELD_SIZE must be 16 or 72");
const id = `aug844-round-columns-${FIELD_SIZE}`;
const longPlayerName = `The Extraordinarily Long Player ${FIELD_SIZE}`;
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
// AUG-253v: round 1 is complete (18 holes); round 2 is partially scored
// (`R2_PLAYED` holes, default 3) so the capture exercises the current-round THRU
// derivation — a player with R1 done and 3 holes of R2 must read THRU 3, not F.
const R2_PLAYED = Math.max(0, Math.min(18, Number(process.env.R2_PLAYED ?? 3)));
function partialRound2Scores() {
  // 3 strokes on the first R2_PLAYED par-4 holes (−1 each), the rest not played.
  return Array.from({ length: 18 }, (_, i) => (i < R2_PLAYED ? 3 : 0));
}
function roundGroups(roundNumber) {
  const players = Array.from({ length: FIELD_SIZE }, (_, index) => ({
    id: `p${index + 1}`,
    name: index + 1 === FIELD_SIZE ? longPlayerName : `Player ${String(index + 1).padStart(2, "0")}`,
    handicap: 0,
    team: null,
    scores: roundNumber === 1 ? scoresFor(68 + index) : index + 1 === FIELD_SIZE ? Array(18).fill(0) : partialRound2Scores(),
  }));
  const groupSize = FIELD_SIZE / 4;
  return Array.from({ length: 4 }, (_, groupIndex) => ({
    id: `r${roundNumber}-g${groupIndex + 1}`,
    name: `Group ${groupIndex + 1}`,
    teeTime: `8:${String(groupIndex * 10).padStart(2, "0")} AM`,
    players: players.slice(groupIndex * groupSize, groupIndex * groupSize + groupSize),
  }));
}
const rounds = [1, 2].map((number) => ({
  id: `round-${number}`, number, name: `Round ${number}`, course, groups: roundGroups(number),
}));
const contest = {
  id,
  name: `Round Columns ${FIELD_SIZE}-Player Fixture`,
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
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
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
  assert.ok(await rows.count() >= Math.min(FIELD_SIZE, 16), `FlashList renders enough of the ${FIELD_SIZE}-player field to check visible rows`);
  for (const playerId of ["p3", "p1", "p2"]) {
    await page.getByTestId(`leaderboard-r1-${playerId}`).waitFor({ state: "visible" });
    await page.getByTestId(`leaderboard-today-${playerId}`).waitFor({ state: "visible" });
  }
  const headerIds = ["pos", "player", "topar", "thru", "r1", "today"].map((key) => `leaderboard-column-header-${key}`);
  const cellsForVisibleRows = () => rows.evaluateAll((nodes) => nodes
    .filter((row) => { const box = row.getBoundingClientRect(); return box.bottom > 0 && box.top < window.innerHeight; })
    .map((row) => Array.from(row.querySelectorAll("[data-testid]"))
      .map((cell) => ({ id: cell.getAttribute("data-testid"), left: cell.getBoundingClientRect().left, right: cell.getBoundingClientRect().right }))
      .filter((cell) => /^(leaderboard-(pos|name|topar|thru|r1|today)-|leaderboard-column-header-)/.test(cell.id || ""))));
  const assertInBoundsAndOrdered = (cells, label) => {
    assert.ok(cells.length >= 6, `${label} has all six visible cells`);
    for (const cell of cells) assert.ok(cell.right <= 390.5, `${label} ${cell.id} ends at ${cell.right}, beyond 390px`);
    for (let i = 1; i < cells.length; i++) assert.ok(cells[i].left >= cells[i - 1].right - 0.5, `${label} ${cells[i - 1].id} overlaps ${cells[i].id}`);
  };
  const headerCells = await page.evaluate((ids) => ids.map((id) => {
    const box = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
    return { id, left: box.left, right: box.right };
  }), headerIds);
  assertInBoundsAndOrdered(headerCells, "header");
  for (const [index, cells] of (await cellsForVisibleRows()).entries()) {
    assertInBoundsAndOrdered(cells, `visible row ${index + 1}`);
  }
  assert.equal(await page.getByTestId("leaderboard-topar-Player 03").innerText(), "+7", "Cumulative TO PAR reflects the aggregate event card");
  assert.equal(await page.getByTestId("leaderboard-r1-p3").innerText(), "70", "Cumulative R1 shows round 1");
  assert.equal(await page.getByTestId("leaderboard-today-p3").innerText(), "−3", "Cumulative Today shows round 2 to-par");
  for (const playerId of ["p3", "p1", "p2"]) {
    assert.equal(await page.getByTestId(`leaderboard-thru-${playerId}`).innerText(), String(R2_PLAYED), "Cumulative THRU is current-round holes, not an event-wide F");
  }
  const cumulativeScreenshot = path.join(OUT, "two-round-16-player-cumulative-390x844.png");
  await page.screenshot({ path: cumulativeScreenshot });
  console.log(`PASS cumulative screenshot=${cumulativeScreenshot} sha256=${crypto.createHash("sha256").update(fs.readFileSync(cumulativeScreenshot)).digest("hex")}`);

  await page.getByText("ROUND 2", { exact: true }).click();
  assert.equal(await page.getByTestId("leaderboard-topar-Player 03").innerText(), "−3", "Daily TO PAR reflects only round 2");
  assert.equal(await page.getByTestId("leaderboard-r1-p3").innerText(), "70", "Daily R1 stays the completed first round");
  assert.equal(await page.getByTestId("leaderboard-today-p3").innerText(), "−3", "Daily Today matches round 2 to-par");
  for (const playerId of ["p3", "p1", "p2"]) {
    assert.equal(await page.getByTestId(`leaderboard-thru-${playerId}`).innerText(), String(R2_PLAYED), "Daily THRU remains current-round holes, not F");
  }
  const dailyScreenshot = path.join(OUT, "two-round-16-player-daily-390x844.png");
  await page.screenshot({ path: dailyScreenshot });
  console.log(`PASS daily screenshot=${dailyScreenshot} sha256=${crypto.createHash("sha256").update(fs.readFileSync(dailyScreenshot)).digest("hex")}`);
  const lastId = `p${FIELD_SIZE}`;
  await page.getByTestId(`leaderboard-name-${lastId}`).scrollIntoViewIfNeeded();
  const longName = await page.getByTestId(`leaderboard-name-${lastId}`).innerText();
  assert.equal(longName, longPlayerName);
  assert.ok(longName.length >= 24, "measured row includes a long display name");
  assert.equal(await page.getByTestId(`leaderboard-thru-${lastId}`).innerText(), "8:30 AM", "not-started player shows tee time");
  const lastRow = (await cellsForVisibleRows()).find((cells) => cells.some((cell) => cell.id === `leaderboard-name-${lastId}`));
  assert.ok(lastRow, "last field row is visible after scrolling");
  assertInBoundsAndOrdered(lastRow, `last row ${lastId}`);
  assert.deepEqual(errors, [], "no page errors");
  const screenshot = path.join(OUT, `two-round-${FIELD_SIZE}-player-390x844.png`);
  await page.screenshot({ path: screenshot });
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(screenshot)).digest("hex");
  console.log(`PASS screenshot=${screenshot} rows=${FIELD_SIZE} viewport=390x844 sha256=${sha256}`);
} finally {
  await context.close();
  await browser.close();
}
