import { expect, test } from "@playwright/test";

import { seedAuthState } from "../fixtures/auth";
import { makeActiveContest, seedContestStorage } from "../fixtures/contest-seed";

test.describe("Scorecard entry", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
    const contest = makeActiveContest("pw-scorecard-active", "Score Entry Round");
    await seedContestStorage(page, [contest], contest.id);
  });

  test("scorecard tab shows current hole and par", async ({ page }) => {
    await page.goto("/contest/pw-scorecard-active");
    await page.getByText(/^scorecard$/i).first().click();
    await expect(page.getByText(/^hole\s*01$/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^par$/i).first()).toBeVisible();
    await expect(page.getByText(/current round/i)).toBeVisible();
  });

  test("tap score sets hole to par when empty", async ({ page }) => {
    await page.goto("/contest/pw-scorecard-active");
    await page.getByText(/^scorecard$/i).first().click();
    await expect(page.getByText(/^hole\s*01$/i)).toBeVisible({ timeout: 15000 });

    const playerRow = page.locator("div").filter({ hasText: /^Test Golfer$/ }).first();
    await expect(playerRow).toBeVisible();
    await playerRow.locator("div").filter({ hasText: /^4$/ }).first().click();

    await expect(playerRow.getByText(/^4$/).first()).toBeVisible({ timeout: 8000 });
  });
});
