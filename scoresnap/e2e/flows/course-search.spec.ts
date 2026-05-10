import { expect, test } from "@playwright/test";

import { seedAuthState } from "../fixtures/auth";

test.describe("Course search (new contest)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
  });

  test("new contest step 1 shows course search entry", async ({ page }) => {
    await page.goto("/contest/new");
    await expect(page.getByText(/players\s*&\s*course/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/search courses/i).first()).toBeVisible({ timeout: 10000 });
  });
});
