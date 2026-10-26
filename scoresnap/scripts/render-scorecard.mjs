#!/usr/bin/env node
/**
 * Headless Playwright render of the Sample Round scorecard at 393x852.
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
 *   EXPO_PUBLIC_DEMO_MODE=true EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web
 *   npx http-server dist-web -p 8089 --silent &
 *   node scripts/render-scorecard.mjs ./screenshot.png
 *   # Or with custom device scale factor (default 1):
 *   DEVICE_SCALE_FACTOR=3 node scripts/render-scorecard.mjs ./screenshot.png
 */

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
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
console.log(`Viewport: 393x852 (standard mobile)`);
console.log(`Device scale factor: ${DEVICE_SCALE_FACTOR}`);
console.log(`Output: ${absoluteOutputPath}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
});

const pageErrors = [];
page.on("pageerror", (e) => {
  console.error("Page error:", e.message);
  pageErrors.push(e.message);
});

try {
  // 1. Navigate to home - may show onboarding
  console.log("Navigating to home...");
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 30000 });
  
  // Check if onboarding appears and handle it
  const skipButton = page.getByText(/skip/i).first();
  const skipVisible = await skipButton.isVisible().catch(() => false);
  if (skipVisible) {
    console.log("Clicking onboarding Skip...");
    await skipButton.click();
    await page.waitForTimeout(1000);
  }
  
  // Ensure we're on the home page with contests visible
  await page.waitForTimeout(1000);
  
  // 2. Wait for the Sample Round contest to appear (search by contest name or course name)
  console.log("Waiting for Sample Round or Pine Valley GC...");
  const contestLink = page.locator('text="Sample Round"').first();
  const courseLink = page.locator('text="Pine Valley GC"').first();
  
  // Wait for either the contest name or course name to appear
  const linkFound = await Promise.race([
    contestLink.waitFor({ state: "visible", timeout: 10000 }).then(() => 'contest'),
    courseLink.waitFor({ state: "visible", timeout: 10000 }).then(() => 'course'),
  ]).catch(() => null);
  
  if (!linkFound) {
    throw new Error("Sample Round not found on home page. Demo mode may not be properly enabled.");
  }
  
  const linkToClick = linkFound === 'contest' ? contestLink : courseLink;
  console.log(`Found ${linkFound === 'contest' ? 'Sample Round' : 'Pine Valley GC'}...`);
  
  // 3. Click on the Sample Round contest
  console.log("Opening Sample Round...");
  await linkToClick.click();
  
  // Wait for contest page to load (URL should be /contest/[id])
  await page.waitForURL(/\/contest\/[^/]+/, { timeout: 10000 });
  console.log("Contest page loaded:", page.url());
  
  // 4. Ensure we're on the Scorecard tab (should be default)
  // Wait for the scorecard to render
  console.log("Waiting for scorecard to render...");
  await page.locator('text="Scorecard"').first().waitFor({ state: "visible", timeout: 5000 });
  
  // Give the scorecard time to fully render and stabilize
  await page.waitForTimeout(1000);
  
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
    console.warn(`⚠ ${pageErrors.length} page error(s) occurred during render`);
  }
  
} catch (error) {
  console.error("Failed to render scorecard:", error.message);
  await page.screenshot({
    path: absoluteOutputPath.replace(".png", "-error.png"),
    type: "png",
  });
  console.error(`Error screenshot saved to ${absoluteOutputPath.replace(".png", "-error.png")}`);
  process.exit(1);
} finally {
  await browser.close();
}
