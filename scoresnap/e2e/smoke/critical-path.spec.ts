import { expect, test } from "@playwright/test";

import { seedAuthState } from "../fixtures/auth";

test.describe("Critical Path Smoke Test", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
  });

  test("authenticated user lands on home tab", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/precision scoring|recent rounds|new contest|scoresnap/i).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("main tab labels are visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^home$/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/^contests$/i).first()).toBeVisible();
    await expect(page.getByText(/^profile$/i).first()).toBeVisible();
  });

  test("can open new contest flow", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/^new contest$/i).first().click();
    await expect(page).toHaveURL(/\/contest\/new/, { timeout: 15000 });
    await expect(page.getByText(/players\s*&\s*course/i)).toBeVisible({ timeout: 10000 });
  });

  test("profile tab shows stats and course history labels", async ({ page }) => {
    await page.goto("/");
    await page.getByText(/^profile$/i).first().click();
    await expect(page.getByText(/scoring avg/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/course history/i).first()).toBeVisible();
    await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible();
  });

  test("settings page loads with handicap and scoring sections", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/^scoring$/i).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/default handicap/i).first()).toBeVisible();
    await expect(page.getByText(/^course\s*&\s*play$/i).first()).toBeVisible();
  });
});
