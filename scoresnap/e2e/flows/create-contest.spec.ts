import { expect, test } from "@playwright/test";

import { seedAuthState } from "../fixtures/auth";

test.describe("Create contest", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
  });

  test("opens new contest modal from home", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/^new contest$/i).first().click();
    await expect(page).toHaveURL(/\/contest\/new/, { timeout: 15000 });
    await expect(page.getByText(/players\s*&\s*course/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/step\s*01/i)).toBeVisible();
  });
});
