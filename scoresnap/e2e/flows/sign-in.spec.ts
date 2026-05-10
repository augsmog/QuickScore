import { expect, test } from "@playwright/test";

import { seedSignInScreenState } from "../fixtures/auth";

test.describe("Sign-In Screen", () => {
  test.beforeEach(async ({ page }) => {
    await seedSignInScreenState(page);
  });

  test("does not show skip-login control as an actionable banner", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/scoresnap/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Continue with Google/i)).toBeVisible();
    const skipLabel = page.getByText(/^skip$/i);
    await expect(skipLabel).toHaveCount(0);
  });

  test("Terms of Service link opens august-industries terms", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Terms of Service/i)).toBeVisible({ timeout: 15000 });

    const popupPromise = page.waitForEvent("popup", { timeout: 8000 }).catch(() => null);
    await page.getByText(/Terms of Service/i).click();
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState();
      expect(popup.url()).toContain("august-industries.com");
      expect(popup.url()).toMatch(/terms/i);
      await popup.close();
    } else {
      await page.waitForURL(/august-industries\.com.*terms/i, { timeout: 8000 });
    }
  });

  test("Privacy Policy link opens august-industries privacy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Privacy Policy/i)).toBeVisible({ timeout: 15000 });

    const popupPromise = page.waitForEvent("popup", { timeout: 8000 }).catch(() => null);
    await page.getByText(/Privacy Policy/i).click();
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState();
      expect(popup.url()).toContain("august-industries.com");
      expect(popup.url()).toMatch(/privacy/i);
      await popup.close();
    } else {
      await page.waitForURL(/august-industries\.com.*privacy/i, { timeout: 8000 });
    }
  });

  test("shows Google sign-in affordance", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Continue with Google/i)).toBeVisible({ timeout: 15000 });
  });

  test("shows email account affordances", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Create Account/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Already have an account/i)).toBeVisible();
  });
});
