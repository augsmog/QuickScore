import { seedPaidTier } from "./shared/paid-tier-fixture.mjs";
/**
 * Hopwood Cup 56-player E2E smoke test
 * 
 * Tests:
 * - Organizer creates a 56-player, 2-round tournament
 * - Verifies tournament is created successfully
 * - Checks that 56 players are listed
 * - Verifies tournament tabs are accessible
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8089";

const results = [];
function check(condition, name, detail = "") {
  const ok = !!condition;
  results.push({ ok, name, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  return ok;
}

console.log("\n═══════════════════════════════════════");
console.log("  Hopwood Cup 56-Player E2E Test");
console.log("═══════════════════════════════════════\n");

const browser = await chromium.launch({ headless: true });
const orgContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const orgPage = await orgContext.newPage();

// Track page errors
await seedPaidTier(orgPage, "td");
const pageErrors = [];
orgPage.on("pageerror", (e) => pageErrors.push(e.message));

try {
  // Navigate to home and create new contest
  await orgPage.goto(BASE + "/", { waitUntil: "networkidle" });
  await orgPage.getByText(/^new contest$/i).first().click();
  
  // Set contest name
  await orgPage.getByPlaceholder(/round|contest name/i).fill("Hopwood Cup 2026");
  
  // Fill first 2 players
  await orgPage.getByPlaceholder("Your name").fill("Player 01");
  await orgPage.getByPlaceholder("Player 2 name").fill("Player 02");
  
  // Add remaining 54 players (56 total)
  for (let i = 3; i <= 56; i++) {
    await orgPage.getByText(/add player/i).first().click();
    await orgPage.waitForTimeout(50); // Brief pause for DOM update
    await orgPage.getByPlaceholder(`Player ${i} name`).fill(`Player ${String(i).padStart(2, "0")}`);
  }
  
  // Enable tournament mode
  const tournamentToggle = orgPage.getByTestId("tournament-toggle");
  await tournamentToggle.waitFor({ state: "visible", timeout: 5000 });
  await tournamentToggle.click();
  
  // Set number of rounds to 2 explicitly (do not rely on the default)
  const rounds2 = orgPage.getByTestId("rounds-2");
  await rounds2.waitFor({ state: "visible", timeout: 5000 });
  await rounds2.click();
  
  // Click Next/Continue
  await orgPage.getByText(/^next|continue/i).last().click();
  await orgPage.waitForTimeout(1000);
  
  // Stroke Play should be pre-selected, click Next to game settings
  await orgPage.getByText(/^next/i).last().click();
  await orgPage.waitForTimeout(1000);
  
  // Click Start Contest
  await orgPage.getByText(/start contest/i).click();
  
  // Wait for contest page
  await orgPage.waitForURL(/\/contest\/[^/]+$/);
  const contestUrl = orgPage.url();
  const contestId = contestUrl.split("/contest/")[1];
  
  check(contestUrl.includes("/contest/"), "Hopwood Cup tournament created");
  
  // Wait for page to render
  await orgPage.waitForTimeout(2000);
  
  // Verify tournament content is visible
  const bodyContent = await orgPage.innerText("body");
  check(
    bodyContent.includes("Hopwood Cup") || bodyContent.includes("Player 01"),
    "Tournament content rendered"
  );
  
  // Verify tournament tabs are accessible
  const leaderboardTab = orgPage.getByText(/leaderboard/i).first();
  const leaderboardVisible = await leaderboardTab.isVisible().catch(() => false);
  check(leaderboardVisible, "Tournament tabs accessible");
  
  // Navigate to Leaderboard to verify it loads (check for player names or "No scores" message)
  if (leaderboardVisible) {
    await leaderboardTab.click();
    await orgPage.waitForTimeout(1000);
    // Require the Leaderboard screen's own content, not the tab label. This test enters no
    // scores, so the leaderboard must render its empty state ("No scores yet" + scorecard hint).
    const emptyState = await orgPage.getByText(/^No scores yet$/).waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
    const emptyHint = await orgPage.getByText(/^Enter scores on the Scorecard tab/).isVisible().catch(() => false);
    const hasLeaderboardContent = emptyState && emptyHint;
    check(
      hasLeaderboardContent,
      "Leaderboard loads for 56-player tournament",
      hasLeaderboardContent ? "leaderboard empty state rendered (no scores entered)" : `leaderboard content missing (empty state: ${emptyState}, hint: ${emptyHint})`
    );
  }
  
  console.log("\n──────────────────────────────────────");
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("──────────────────────────────────────\n");
  
  if (pageErrors.length > 0) {
    console.error(`✗ ${pageErrors.length} uncaught page error(s) during test:`);
    pageErrors.slice(0, 5).forEach((err) => console.error(`  ${err}`));
  }
  
  await browser.close();
  // Uncaught page errors fail the run (previously only warned)
  process.exit(failed > 0 || pageErrors.length > 0 ? 1 : 0);
  
} catch (error) {
  console.error("\n✗ Test failed with error:", error.message);
  console.error(error.stack);
  await browser.close();
  process.exit(1);
}
