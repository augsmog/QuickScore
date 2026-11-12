import { expect, test } from "@playwright/test";

import { seedAuthState } from "../fixtures/auth";
import { makeCompletedContest, seedContestStorage } from "../fixtures/contest-seed";

// AUG-814 (evidence for AUG-747): 390x844 leaderboard shows rank label + THRU on >=3 rows.
test.describe("Leaderboard cells @390x844", () => {
  test("rankLabel and thru render on at least 3 rows", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAuthState(page);
    await seedContestStorage(page, [makeCompletedContest()], null);
    await page.goto("/contest/test-settlement-contest");

    const ranks = page.getByTestId("rankLabel");
    const thrus = page.getByTestId("thruLabel");
    await expect(ranks.first()).toBeVisible({ timeout: 15000 });
    expect(await ranks.count()).toBeGreaterThanOrEqual(3);
    expect(await thrus.count()).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 3; i++) {
      await expect(ranks.nth(i)).toHaveText(String(i + 1));
      await expect(thrus.nth(i)).toHaveText(/^thru \d+$/i);
    }

    const path = testInfo.outputPath("leaderboard-390x844.png");
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach("leaderboard-390x844", { path, contentType: "image/png" });
  });
});
