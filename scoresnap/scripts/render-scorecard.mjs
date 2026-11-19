#!/usr/bin/env node
/**
 * Headless Playwright render of the Sample Round scorecard at 390x844.
 * Writes a PNG screenshot to the specified output path.
 *
 * Usage: node scripts/render-scorecard.mjs <output-path.png>
 * 
 * Requirements:
 * - A local web server running the app at http://localhost:8089 (or set BASE_URL env var)
 * - The app must be built with EXPO_PUBLIC_DEMO_MODE=true and EXPO_PUBLIC_OFFLINE_MODE=true to have Sample Round available
 * - Playwright with Chromium installed: npx playwright install chromium
 *
 * Example:
 *   EXPO_PUBLIC_DEMO_MODE=true EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web --clear
 *   node e2e/serve.mjs &
 *   node scripts/render-scorecard.mjs ./screenshot.png
 *   # Or with custom device scale factor (default 1):
 *   DEVICE_SCALE_FACTOR=3 node scripts/render-scorecard.mjs ./screenshot.png
 */

import { chromium } from "playwright";
import { seedPaidTier } from "../e2e/shared/paid-tier-fixture.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:8089";
const DEVICE_SCALE_FACTOR = parseInt(process.env.DEVICE_SCALE_FACTOR || "1", 10);
const outputPath = process.argv[2];

if (!outputPath) {
  console.error("Usage: node scripts/render-scorecard.mjs <output-path.png>");
  process.exit(1);
}

const absoluteOutputPath = path.resolve(outputPath);
const outputDir = path.dirname(absoluteOutputPath);

// Ensure output directory exists
fs.mkdirSync(outputDir, { recursive: true });

console.log(`Rendering Sample Round scorecard at ${BASE_URL}...`);
console.log(`Viewport: 390x844 (standard mobile)`);
console.log(`Device scale factor: ${DEVICE_SCALE_FACTOR}`);
console.log(`Output: ${absoluteOutputPath}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
});

// The sample contains premium games; use the normal paid-device fixture.
await seedPaidTier(page, "pro");

page.setDefaultTimeout(10000);
page.setDefaultNavigationTimeout(10000);

const pageErrors = [];
page.on("pageerror", (e) => {
  console.error("Page error:", e.message);
  pageErrors.push(e.message);
});

try {
  // 1. Navigate to home - will show onboarding if needed
  console.log("Navigating to home...");
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 10000 });
  
  // Handle onboarding if it appears
  const skipButton = page.getByText(/skip/i).first();
  const skipVisible = await skipButton.isVisible().catch(() => false);
  if (skipVisible) {
    console.log("Onboarding detected, clicking Skip...");
    const currentUrl = page.url();
    await skipButton.click();
    
    // Wait for navigation away from onboarding (URL should change)
    await page.waitForFunction(
      (startUrl) => {
        const currentUrl = window.location.href;
        return !currentUrl.includes('/onboarding') && currentUrl !== startUrl;
      },
      currentUrl,
      { timeout: 5000 }
    );
    
    await page.waitForTimeout(2000); // Wait for the home page to render
    
    console.log("After skip, URL:", page.url());
  } else {
    console.log("No onboarding screen, directly on home page");
  }
  
  // Give the app time to render the contest list
  await page.waitForTimeout(1000);
  
  // 2. Home "Recent rounds" lists the round by course name: Pine Valley GC must be visible (strict)
  console.log("Waiting for Pine Valley GC (Sample Round) on home...");
  const courseLink = page.locator('text="Pine Valley GC"').first();
  await courseLink.waitFor({ state: "visible", timeout: 10000 }).catch(() => {
    throw new Error("Sample Round (Pine Valley GC) not found on home page. Demo mode may not be properly enabled.");
  });
  const linkToClick = courseLink;

  // 3. Click on the Sample Round contest
  console.log("Opening Sample Round...");
  await linkToClick.click();
  
  // Wait for contest page to load (URL should be /contest/[id])
  await page.waitForURL(/\/contest\/[^/]+/, { timeout: 10000 });
  console.log("Contest page loaded:", page.url());
  // The opened contest must be the Sample Round at Pine Valley GC
  await page.getByTestId("contest-header").getByText("Sample Round", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
  
  // 4. Ensure we're on the Scorecard tab (should be default)
  // Wait for the scorecard to render
  console.log("Waiting for scorecard to render...");
  await page.locator('text="Scorecard"').first().waitFor({ state: "visible", timeout: 5000 });
  
  // Give the scorecard time to fully render and stabilize
  await page.waitForTimeout(1000);
  
  // Both sharing components return null with the feature disabled. Require DOM
  // absence, not merely CSS invisibility, and prove no wrapper reserves space.
  const contestScreen = page.getByTestId('contest-screen');
  await contestScreen.waitFor({ state: 'visible', timeout: 10000 });
  await contestScreen.getByTestId('score-next-hole').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await page.getByTestId('organizer-join-code').count(), 0);
  assert.equal(await contestScreen.getByText(/join code|share local invite|same browser|live scoreboard|share live|revoke live links/i).count(), 0,
    'Sharing UI must be absent, including hidden text');
  const precedingLayout = await contestScreen.getByTestId('contest-header').evaluate(header => {
    const siblings = [];
    for (let node = header.previousElementSibling; node; node = node.previousElementSibling) {
      siblings.push({ height: node.getBoundingClientRect().height, text: node.textContent });
    }
    return siblings;
  });
  for (const sibling of precedingLayout) {
    assert.equal(sibling.height, 0, `Unexpected layout before contest header: ${JSON.stringify(sibling)}`);
  }
  console.log('PASS: sharing UI absent and no sharing layout space');

  // 5. Ensure scroll position is at the top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200); // Let scroll settle
  
  // 6. Take the screenshot
  console.log("Capturing screenshot...");
  await page.screenshot({
    path: absoluteOutputPath,
    type: "png",
    fullPage: false, // Only capture the viewport, not the full scrollable page
  });
  
  console.log(`✓ Screenshot saved to ${absoluteOutputPath}`);
  
  if (pageErrors.length > 0) {
    throw new Error(`${pageErrors.length} uncaught page error(s) during render: ${pageErrors.join(" | ")}`);
  }
  
} catch (error) {
  console.error("Failed to render scorecard:", error.message);
  await page.screenshot({
    path: absoluteOutputPath.replace(".png", "-error.png"),
    type: "png",
  });
  console.error(`Error screenshot saved to ${absoluteOutputPath.replace(".png", "-error.png")}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
