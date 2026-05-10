import { expect, test } from "@playwright/test";

import { seedAuthState } from "../fixtures/auth";
import { makeCompletedContest, seedContestStorage } from "../fixtures/contest-seed";

test.describe("Settlement Screen", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
    const contest = makeCompletedContest();
    await seedContestStorage(page, [contest], null);
  });

  test("does not show Venmo or Cash App", async ({ page }) => {
    await page.goto("/contest/test-settlement-contest");
    await page.getByText(/^settlement$/i).first().click();
    await expect(page.getByText(/venmo/i)).toHaveCount(0);
    await expect(page.getByText(/cash app/i)).toHaveCount(0);
  });

  test("shows Mark Settled control", async ({ page }) => {
    await page.goto("/contest/test-settlement-contest");
    await page.getByText(/^settlement$/i).first().click();
    await expect(page.getByText(/mark settled/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("all four contest tabs are visible", async ({ page }) => {
    await page.goto("/contest/test-settlement-contest");
    await expect(page.getByText(/^leaderboard$/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^scorecard$/i).first()).toBeVisible();
    await expect(page.getByText(/^games$/i).first()).toBeVisible();
    await expect(page.getByText(/^settlement$/i).first()).toBeVisible();
  });
});
