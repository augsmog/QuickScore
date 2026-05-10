import { expect, test } from "@playwright/test";

import { seedAuthState, seedOnboardingIncomplete } from "../fixtures/auth";

test.describe("Onboarding", () => {
  test("completing onboarding leads to sign-in on web", async ({ page }) => {
    await seedOnboardingIncomplete(page);
    await page.goto("/");
    await expect(page.getByText(/snap your scorecard/i)).toBeVisible({ timeout: 15000 });

    await page.getByText(/^next$/i).click();
    await page.getByText(/^next$/i).click();
    await page.getByText(/^get started$/i).click();

    await expect(page.getByText(/Continue with Google/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Terms of Service/i)).toBeVisible();
  });
});

test.describe("Onboarding (authenticated)", () => {
  test("seeded user skips onboarding shell", async ({ page }) => {
    await seedAuthState(page);
    await page.goto("/");
    await expect(page.getByText(/precision scoring|^scoresnap$/i).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
