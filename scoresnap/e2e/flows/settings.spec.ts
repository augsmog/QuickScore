import { expect, test } from "@playwright/test";

import { seedAuthState } from "../fixtures/auth";

test.describe("Settings - Plus Handicaps", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
  });

  test("settings page loads with key sections", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/^scoring$/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^course\s*&\s*play$/i).first()).toBeVisible();
    await expect(page.getByText(/default handicap/i).first()).toBeVisible();
  });

  test("handicap row is visible", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/default handicap/i).first()).toBeVisible({ timeout: 15000 });
  });
});
