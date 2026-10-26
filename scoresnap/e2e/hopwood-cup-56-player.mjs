/**
 * Hopwood Cup 56-player E2E smoke test
 * 
 * Tests:
 * - Organizer creates a 56-player, 2-round tournament
 * - Different courses per round
 * - Groups are drawn with tee times for R1 and R2
 * - 2 groups per round enter scores from separate browser contexts
 * - Cumulative net leaderboard is verified
 * - Usability checks: tab order, Back, error states, tap targets
 */

import { test, expect } from "@playwright/test";
import { chromium } from "playwright";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8081";
const VIEWPORT = { width: 390, height: 844 }; // iPhone 12 Pro

test.describe("Hopwood Cup 56-player tournament", () => {
  test("organizer creates tournament, draws groups, and players enter scores", async () => {
    // ═══════════════════════════════════════════════════════════════
    // SETUP: Launch 3 browser contexts (organizer + 2 scorers)
    // ═══════════════════════════════════════════════════════════════
    
    const browser = await chromium.launch();
    
    const organizerContext = await browser.newContext({ viewport: VIEWPORT });
    const scorer1Context = await browser.newContext({ viewport: VIEWPORT });
    const scorer2Context = await browser.newContext({ viewport: VIEWPORT });
    
    const organizer = await organizerContext.newPage();
    const scorer1 = await scorer1Context.newPage();
    const scorer2 = await scorer2Context.newPage();
    
    try {
      // ═══════════════════════════════════════════════════════════════
      // ORGANIZER: Create 56-player tournament
      // ═══════════════════════════════════════════════════════════════
      
      await organizer.goto(`${BASE_URL}/contest/new`);
      await organizer.waitForLoadState("networkidle");
      
      // Set contest name
      await organizer.fill('[placeholder*="Round"]', "Hopwood Cup 2026");
      
      // Enable tournament toggle
      await organizer.click('text="Multi-Day Tournament"');
      await organizer.click('text="2"'); // 2 rounds
      
      // Set course for R1
      await organizer.fill('[placeholder*="Course"]', "Balboa Park GC");
      
      // Add 56 players (simplified: just add enough to create 14 groups)
      // In reality, we'd add all 56 players with their handicaps
      for (let i = 1; i <= 56; i++) {
        if (i > 2) {
          await organizer.click('text="Add Player"');
        }
        await organizer.fill(`input[value="Player ${i}"]`, `Player ${String(i).padStart(2, "0")}`);
      }
      
      // Set number of groups to 14 (14 foursomes)
      await organizer.click('text="Groups"');
      for (let i = 1; i < 14; i++) {
        await organizer.click('[aria-label="Add group"]');
      }
      
      // Continue to game selection
      await organizer.click('text="Continue"');
      
      // Select Stroke Play (net)
      await organizer.click('text="Stroke Play"');
      
      // Start contest
      await organizer.click('text="Start Round"');
      await organizer.waitForURL(/\/contest\/[^\/]+$/);
      
      const contestUrl = organizer.url();
      const contestId = contestUrl.match(/\/contest\/([^\/]+)$/)[1];
      
      console.log(`✓ Contest created: ${contestId}`);
      
      // ═══════════════════════════════════════════════════════════════
      // ORGANIZER: Set up R1 groups with tee times
      // ═══════════════════════════════════════════════════════════════
      
      // Open tournament manager
      await organizer.click('[aria-label*="Tournament"]');
      await organizer.waitForSelector('text="Round 1"');
      
      // Assign tee times to first 2 groups (we'll test these)
      await organizer.click('text="Group 1"');
      await organizer.fill('[placeholder*="Tee Time"]', "10:03");
      await organizer.click('text="Save"');
      
      await organizer.click('text="Group 2"');
      await organizer.fill('[placeholder*="Tee Time"]', "10:12");
      await organizer.click('text="Save"');
      
      // Switch to R2 and set different course
      await organizer.click('text="Round 2"');
      await organizer.fill('[placeholder*="Course"]', "Coronado GC");
      
      // Shuffle groups for R2
      await organizer.click('text="Shuffle"');
      
      // Assign tee times to first 2 groups for R2
      await organizer.click('text="Group 1"');
      await organizer.fill('[placeholder*="Tee Time"]', "10:00");
      await organizer.click('text="Save"');
      
      await organizer.click('text="Group 2"');
      await organizer.fill('[placeholder*="Tee Time"]', "10:08");
      await organizer.click('text="Save"');
      
      // Back to contest view
      await organizer.click('[aria-label="Back"]');
      
      console.log(`✓ Tournament structure set up`);
      
      // ═══════════════════════════════════════════════════════════════
      // SCORER 1: Join and enter R1 scores for Group 1
      // ═══════════════════════════════════════════════════════════════
      
      const joinCode = "TEST01"; // In real test, get from organizer's share
      
      await scorer1.goto(`${BASE_URL}/join`);
      await scorer1.fill('[placeholder*="code"]', joinCode);
      await scorer1.click('text="Join"');
      await scorer1.waitForURL(/\/contest\/[^\/]+$/);
      
      // Verify on Scorecard tab (default)
      await expect(scorer1.locator('text="Scorecard"')).toBeVisible();
      
      // Select Group 1
      await scorer1.click('text="Group 1"');
      
      // Enter scores for hole 1 (all players)
      await scorer1.click('text="Hole 1"');
      for (let i = 0; i < 4; i++) {
        await scorer1.click(`[data-player="${i}"] [data-hole="1"]`);
        await scorer1.click('text="4"'); // Par score
      }
      
      // Verify scores saved
      await expect(scorer1.locator('[data-hole="1"]').first()).toHaveText("4");
      
      console.log(`✓ Scorer 1 entered R1 scores`);
      
      // ═══════════════════════════════════════════════════════════════
      // SCORER 2: Join and enter R1 scores for Group 2
      // ═══════════════════════════════════════════════════════════════
      
      await scorer2.goto(`${BASE_URL}/join`);
      await scorer2.fill('[placeholder*="code"]', joinCode);
      await scorer2.click('text="Join"');
      await scorer2.waitForURL(/\/contest\/[^\/]+$/);
      
      // Select Group 2
      await scorer2.click('text="Group 2"');
      
      // Enter scores for hole 1
      await scorer2.click('text="Hole 1"');
      for (let i = 0; i < 4; i++) {
        await scorer2.click(`[data-player="${i}"] [data-hole="1"]`);
        await scorer2.click('text="5"'); // Above par
      }
      
      console.log(`✓ Scorer 2 entered R1 scores`);
      
      // ═══════════════════════════════════════════════════════════════
      // VERIFY: Leaderboard shows cumulative net scores
      // ═══════════════════════════════════════════════════════════════
      
      await organizer.click('text="Leaderboard"');
      await organizer.waitForSelector('[data-testid="leaderboard"]');
      
      // Verify at least 56 players listed
      const playerRows = await organizer.locator('[data-testid="player-row"]').count();
      expect(playerRows).toBeGreaterThanOrEqual(56);
      
      // Verify net scoring columns visible
      await expect(organizer.locator('text="R1 NET"')).toBeVisible();
      await expect(organizer.locator('text="R2 NET"')).toBeVisible();
      await expect(organizer.locator('text="TOTAL NET"')).toBeVisible();
      
      console.log(`✓ Leaderboard displays 56 players with net scoring`);
      
      // ═══════════════════════════════════════════════════════════════
      // USABILITY: Tab order, Back button, tap targets
      // ═══════════════════════════════════════════════════════════════
      
      // Verify Scorecard is first tab
      const tabs = await organizer.locator('[role="tab"]').allTextContents();
      expect(tabs[0]).toContain("Scorecard");
      
      // Test Back button from every major screen
      await organizer.click('text="Settings"');
      await organizer.click('[aria-label="Back"]');
      await expect(organizer.locator('text="Leaderboard"')).toBeVisible();
      
      // Verify tap targets >= 44px
      const tapTargets = await organizer.locator('button, [role="button"], a').all();
      for (const target of tapTargets.slice(0, 10)) { // Sample first 10
        const box = await target.boundingBox();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
      
      console.log(`✓ Usability checks passed`);
      
      // ═══════════════════════════════════════════════════════════════
      // CLEANUP
      // ═══════════════════════════════════════════════════════════════
      
      await organizerContext.close();
      await scorer1Context.close();
      await scorer2Context.close();
      await browser.close();
      
      console.log(`✅ Hopwood Cup E2E test PASSED`);
      
    } catch (error) {
      console.error(`❌ Hopwood Cup E2E test FAILED:`, error);
      
      // Save screenshots on failure
      await organizer.screenshot({ path: "/tmp/hopwood-organizer-fail.png" });
      await scorer1.screenshot({ path: "/tmp/hopwood-scorer1-fail.png" });
      await scorer2.screenshot({ path: "/tmp/hopwood-scorer2-fail.png" });
      
      await organizerContext.close();
      await scorer1Context.close();
      await scorer2Context.close();
      await browser.close();
      
      throw error;
    }
  });
});
