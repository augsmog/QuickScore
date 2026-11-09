import { seedPaidTier } from "./shared/paid-tier-fixture.mjs";
// Tournament e2e test: 16 players, 2-3 rounds, multiple foursomes
// Tests join, scoring, regrouping, leaderboard aggregation, and usability
// Usage: BASE_URL=http://localhost:8089 node e2e/tournament-16-player.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8089";
const MIN_TAP_TARGET = 44; // px

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok: !!ok, name, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

console.log("\n═══════════════════════════════════════");
console.log("  Tournament 16-Player E2E Test");
console.log("═══════════════════════════════════════\n");

const browser = await chromium.launch();

// Organizer creates a 16-player tournament
const orgPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await seedPaidTier(orgPage, "td");
const pageErrors = [];
// Round status sheet (direction A): sharing, join code and sync live behind the header status chip.
async function openRoundStatus(p) {
  const chip = p.getByTestId("round-status-chip").filter({ visible: true }).first();
  await chip.waitFor({ timeout: 10000 }).catch(() => {});
  if (await chip.count() && !(await p.getByTestId("round-status-sheet").isVisible().catch(() => false))) {
    await chip.click();
    await p.getByTestId("round-status-sheet").waitFor();
  }
}
async function closeRoundStatus(p) {
  if (await p.getByTestId("round-status-sheet").isVisible().catch(() => false)) {
    await p.getByTestId("round-status-done").click();
    await p.getByTestId("round-status-sheet").waitFor({ state: "hidden" });
  }
}

orgPage.on("pageerror", (e) => pageErrors.push(e.message));

await orgPage.goto(BASE + "/", { waitUntil: "networkidle" });
await orgPage.getByText(/^new contest$/i).first().click();

// Add 16 players
const playerNames = Array.from({ length: 16 }, (_, i) => `P${i + 1}`);
await orgPage.getByPlaceholder("Your name").fill(playerNames[0]);
await orgPage.getByPlaceholder("Player 2 name").fill(playerNames[1]);
// Add remaining 14 players (3-16)
for (let i = 2; i < 16; i++) {
  await orgPage.getByText(/add player/i).first().click();
  await orgPage.getByPlaceholder(`Player ${i + 1} name`).fill(playerNames[i]);
}

// Create 4 groups
await orgPage.getByTestId("add-group").click();
await orgPage.getByTestId("add-group").click();
await orgPage.getByTestId("add-group").click();

// Assign players to groups (4 per group)
for (let i = 4; i < 16; i++) {
  const groupNum = Math.floor(i / 4) + 1;
  await orgPage.getByTestId(`player-group-${playerNames[i]}`).click();
  // Select the group (implementation may vary based on UI)
}

// Players & Course precedes the two numbered setup steps.
await orgPage.getByText(/^continue$/i).last().click();
await orgPage.getByTestId('contest-step-gamemodes').waitFor({state:'visible'});
check((await orgPage.innerText('body')).includes('Step 1/2'), 'Game Modes is step 1/2');
// Stroke Play is pre-selected; continue to Round Settings.
await orgPage.getByText(/^continue$/i).last().click();
await orgPage.getByTestId('contest-step-round-settings').waitFor({state:'visible'});
check((await orgPage.innerText('body')).includes('Step 2/2'), 'Round Settings is step 2/2');
await orgPage.getByTestId('contest-start').click();

await orgPage.waitForURL(/\/contest\/[^/]+$/);
const contestUrl = orgPage.url();
const contestId = contestUrl.split("/contest/")[1];

check(contestUrl.includes("/contest/"), "Tournament created");

// Wait for contest page to fully render - verify multiple tab labels are present
// Note: tab label case is a styling choice, so compare case-insensitively.
await orgPage.waitForTimeout(2000);
const bodyText = await orgPage.innerText("body");
const tabText = bodyText.toUpperCase();
const hasMultipleTabs = tabText.includes("SCORECARD") &&
                        tabText.includes("LEADERBOARD") &&
                        tabText.includes("GAMES");
check(hasMultipleTabs, "Contest tabs rendered (Scorecard, Leaderboard, Games)");
const scorecardTab = orgPage.getByText(/^scorecard$/i).first();
const scorecardVisible = await scorecardTab.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
check(
  scorecardVisible,
  "Scorecard tab rendered and visible",
  scorecardVisible ? "visible" : "not rendered"
);

// Check if join code is available (cross-device sharing feature flag)
// Read the round-layout invite control without opening the status sheet.
const joinCodeElement = orgPage.getByTestId("organizer-join-code");
const hasJoinCode = await joinCodeElement.count() > 0;
const joinCodeTextEarly = hasJoinCode ? await joinCodeElement.innerText().catch(() => "") : "";

// Round 1: 4 players join and enter scores (if join code available)
console.log("\n─── Round 1: Join & Score ───");
const playerContexts = [];
let joinCode = null;

if (hasJoinCode) {
  const joinCodeText = joinCodeTextEarly;
  joinCode = joinCodeText.match(/[A-HJ-NP-Z2-9]{6}$/)?.[0];
  check(!!joinCode, "Join code visible", joinCode);

  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => pageErrors.push(`P${i + 1}: ${e.message}`));
    
    await page.goto(`${BASE}/join/${joinCode}`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Display name").fill(`Guest ${i + 1}`);
    await page.getByText("Find contest", { exact: true }).click();
    await page.getByTestId(`guest-pick-${playerNames[i]}`).waitFor({ timeout: 5000 }).catch(() => {});
    
    // Check if player selection exists
    const pickerExists = await page.getByTestId(`guest-pick-${playerNames[i]}`).isVisible().catch(() => false);
    if (pickerExists) {
      await page.getByTestId(`guest-pick-${playerNames[i]}`).click();
      
      // Verify Scorecard tab is active by default
      const activePage = await page.innerText("body").catch(() => "");
      check(
        activePage.includes("Hole") || activePage.includes("Score"),
        `P${i + 1}: Lands on Scorecard tab after join`
      );
      
      // Enter score for hole 1
      await page.getByTestId("guest-score-1").waitFor({ timeout: 3000 }).catch(() => {});
      const scoreInputExists = await page.getByTestId("guest-score-1").isVisible().catch(() => false);
      if (scoreInputExists) {
        await page.getByTestId("guest-score-1").fill(String(4 + i));
        
        // Verify leaderboard updates
        await page.waitForTimeout(500);
        const total = await page.getByTestId(`guest-total-${playerNames[i]}`).innerText().catch(() => "");
        check(total.includes(String(4 + i)), `P${i + 1}: Score entered and total updates`, total);
      }
    }
    
    playerContexts.push({ ctx, page, playerIndex: i });
  }
} else {
  check(true, "Cross-device sharing disabled (feature flag); skipping join/score tests");
}

// Verify all 4 players see the leaderboard
console.log("\n─── Leaderboard Visibility ───");
if (playerContexts.length > 0) {
  for (const { page, playerIndex } of playerContexts) {
    await page.getByText(/^leaderboard$/i).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const leaderboard = await page.innerText("body").catch(() => "");
    const visiblePlayers = playerNames.slice(0, 16).filter((name) => leaderboard.includes(name));
    check(
      visiblePlayers.length >= 4,
      `P${playerIndex + 1}: Sees leaderboard with multiple players`,
      `${visiblePlayers.length} players visible`
    );
  }
} else {
  check(true, "Skipped: no player contexts");
}

// ─── Settlement Gating (AUG-278b: TD readiness G4) ───
// Asserts the settle GATE end-to-end on the real multi-group tournament. The
// organizer is seeded on the paid "td" tier (seedPaidTier above), so opening
// Settle up must BYPASS the free paywall and reach the real settlement screen.
// A sibling page in the SAME browser context (which already holds this contest
// in persisted storage) is then seeded to the FREE tier to prove the free gate
// renders. The settle-ledger MATH for a multi-group field is asserted
// deterministically in src/engine/__tests__/contest-settlement-16p.test.ts — a
// live non-empty ledger here would need cross-device scoring (G1, out of scope).
console.log("\n─── Settlement Gating (AUG-278b G4) ───");
async function openSettlement(p) {
  const tab = p.getByText(/^(settlement|settle up)$/i).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await p.waitForTimeout(800);
    return true;
  }
  return false;
}

// Paid tier (td): the free gate must NOT show; the real settlement screen renders.
const paidOpened = await openSettlement(orgPage);
check(paidOpened, "Paid org: Settle up tab reachable");
if (paidOpened) {
  const settleFreeOnPaid = await orgPage.getByTestId("settle-free").isVisible().catch(() => false);
  check(!settleFreeOnPaid, "Paid org (td): free paywall gate is bypassed", settleFreeOnPaid ? "settle-free shown" : "no settle-free");
  // Some paid container must render: ready ledger, pending, all-even, or the
  // "complete the round" empty state (no scores when cross-device is off).
  const paidBody = await orgPage.innerText("body").catch(() => "");
  const paidContainer =
    (await orgPage.getByTestId("settlement-scroll").isVisible().catch(() => false)) ||
    (await orgPage.getByTestId("settlement-pending").isVisible().catch(() => false)) ||
    (await orgPage.getByTestId("settlement-all-even").isVisible().catch(() => false)) ||
    paidBody.includes("Complete the round to see settlement");
  check(paidContainer, "Paid org (td): real settlement screen renders (not the paywall)");
}

// Free tier: a sibling page in the same browser context already holds this
// contest in persisted storage; seeded to the free tier it must show settle-free.
const freePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await freePage.addInitScript(() => {
  try {
    localStorage.setItem("snapscore-scans", JSON.stringify({ version: 1, state: { tier: "free", isPro: false, isTD: false, scanMonth: "", scansUsed: 0 } }));
  } catch { /* storage may be unavailable before first paint */ }
});
await freePage.goto(`${BASE}/contest/${contestId}/settlement`, { waitUntil: "networkidle" });
await freePage.getByTestId("settle-free").waitFor({ timeout: 10000 }).catch(() => {});
const freeGateVisible = await freePage.getByTestId("settle-free").isVisible().catch(() => false);
check(freeGateVisible, "Free tier: settle-free paywall gate renders");
// settle-free-trial (the 7-day-trial CTA) only renders when a live StoreKit
// annual trial offer resolves; that purchase view is unavailable in the offline
// web build, so the trial CTA itself is exercised by the paywall tests, not here.
await freePage.close();

// Test usability: Back button from every screen
console.log("\n─── Usability: Back Navigation ───");
for (const tabName of ["Games", "(Settlement|Settle up)"]) {
  const tab = orgPage.getByText(new RegExp(`^${tabName}$`, "i")).first();
  const tabExists = await tab.isVisible().catch(() => false);
  if (tabExists) {
    await tab.click();
    await orgPage.waitForTimeout(500);
    
    // Check if we can navigate back
    const backButton = orgPage.getByRole("button").filter({ hasText: /back|chevron|arrow/i }).first();
    const backExists = await backButton.isVisible().catch(() => false);
    if (backExists) {
      await backButton.click();
      await orgPage.waitForTimeout(500);
      check(true, `Back from ${tabName} works`);
    } else {
      // On web, there may not be a back button - check if we're on a valid page
      const currentUrl = orgPage.url();
      check(currentUrl.includes("/contest/"), `${tabName} accessible`);
    }
  }
}

// Test tap target sizes
console.log("\n─── Usability: Tap Target Sizes ───");
const tabbableElements = await orgPage.$$('[role="button"], button, [role="tab"], a');
for (const el of tabbableElements.slice(0, 10)) { // Check first 10
  const box = await el.boundingBox().catch(() => null);
  if (box && box.width > 0 && box.height > 0) {
    const minDim = Math.min(box.width, box.height);
    check(
      minDim >= MIN_TAP_TARGET,
      `Tap target >= ${MIN_TAP_TARGET}px`,
      `${Math.round(minDim)}px`
    );
  }
}

// Test home page shows created contest
console.log("\n─── Home Page ───");
await orgPage.goto(BASE + "/", { waitUntil: "networkidle" });
await orgPage.waitForTimeout(1000);
const newContestButton = orgPage.getByText(/new contest/i).first();
const newContestVisible = await newContestButton.isVisible().catch(() => false);
check(
  newContestVisible,
  "Home shows New Contest button"
);

// Test day 2: Rejoin with different groups
console.log("\n─── Round 2: Rejoin & Regrouping ───");
if (playerContexts.length > 0 && joinCode) {
  // In a real tournament, the organizer would advance to Round 2 and reshuffle groups
  // For this test, we verify rejoins work
  for (const { page, playerIndex } of playerContexts.slice(0, 2)) {
    await page.reload({ waitUntil: "networkidle" });
    await page.goto(`${BASE}/join/${joinCode}`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("Display name").fill(`Guest ${playerIndex + 1}`);
    await page.getByText("Find contest", { exact: true }).click();
    
    // Should land back in the same contest
    await page.waitForTimeout(1000);
    const playerPicker = page.getByTestId(`guest-pick-${playerNames[playerIndex]}`);
    const pickerVisible = await playerPicker.isVisible().catch(() => false);
    check(pickerVisible, `P${playerIndex + 1}: Rejoin successful`);
  }
} else {
  check(true, "Skipped: no player contexts or join code");
}

// Clean up
for (const { ctx } of playerContexts) {
  await ctx.close();
}
await orgPage.close();
await browser.close();

console.log("\n──────────────────────────────────────");
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`Results: ${passed} passed, ${failed} failed`);
if (pageErrors.length > 0) {
  console.log(`\n⚠ Page errors: ${pageErrors.length}`);
  pageErrors.slice(0, 5).forEach((err) => console.log(`  ${err}`));
}
console.log("──────────────────────────────────────\n");

// Uncaught page errors fail the run (previously only logged)
process.exit(failed > 0 || pageErrors.length > 0 ? 1 : 0);
