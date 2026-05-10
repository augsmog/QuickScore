import { expect, test } from "@playwright/test";

import { seedAuthState } from "../fixtures/auth";
import { makeHistoryContests, seedContestStorage } from "../fixtures/contest-seed";

test.describe("Playing History in Profile", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
    await seedContestStorage(page, makeHistoryContests(), null);
  });

  test("profile shows Playing History section", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/^profile$/i).first().click();
    await expect(page.getByText(/^playing history$/i).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("playing history lists seeded course names", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/^profile$/i).first().click();
    await expect(page.getByText(/pebble beach/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/augusta national/i).first()).toBeVisible();
  });

  test("tapping a history card opens contest with four tabs", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/^profile$/i).first().click();
    await page.getByText(/pebble beach/i).first().click();
    await expect(page.getByText(/^leaderboard$/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^scorecard$/i).first()).toBeVisible();
    await expect(page.getByText(/^games$/i).first()).toBeVisible();
    await expect(page.getByText(/^settlement$/i).first()).toBeVisible();
  });
});
