import type { Page } from "@playwright/test";

/** Persist names must match `name` in `onboarding-store` / `auth-store` (AsyncStorage → localStorage on web). */
export const ONBOARDING_STORAGE_KEY = "snapscore-onboarding";
export const AUTH_STORAGE_KEY = "snapscore-auth";

/**
 * Bypass onboarding + auth by seeding persisted Zustand stores in localStorage.
 * Call this before navigating to any authenticated page.
 */
export async function seedAuthState(page: Page) {
  await page.addInitScript(
    ({ onboardingKey, authKey }: { onboardingKey: string; authKey: string }) => {
      localStorage.setItem(
        onboardingKey,
        JSON.stringify({
          state: { hasCompletedOnboarding: true, hasSeenDemo: true },
          version: 0,
        })
      );
      localStorage.setItem(
        authKey,
        JSON.stringify({
          state: {
            session: {
              user: {
                id: "test-user-pw",
                email: "test@snapscore.test",
                name: "Test Golfer",
                provider: "email",
              },
            },
            user: {
              id: "test-user-pw",
              email: "test@snapscore.test",
              name: "Test Golfer",
              provider: "email",
            },
            isAnonymous: false,
            isInitialized: true,
          },
          version: 0,
        })
      );
    },
    { onboardingKey: ONBOARDING_STORAGE_KEY, authKey: AUTH_STORAGE_KEY }
  );
}

/** Onboarding done, no session — app routes to /auth/sign-in. */
export async function seedSignInScreenState(page: Page) {
  await page.addInitScript(
    ({ onboardingKey, authKey }: { onboardingKey: string; authKey: string }) => {
      localStorage.setItem(
        onboardingKey,
        JSON.stringify({
          state: { hasCompletedOnboarding: true, hasSeenDemo: true },
          version: 0,
        })
      );
      localStorage.removeItem(authKey);
    },
    { onboardingKey: ONBOARDING_STORAGE_KEY, authKey: AUTH_STORAGE_KEY }
  );
}

/** First launch: show onboarding, no auth. */
export async function seedOnboardingIncomplete(page: Page) {
  await page.addInitScript(
    ({ onboardingKey, authKey }: { onboardingKey: string; authKey: string }) => {
      localStorage.setItem(
        onboardingKey,
        JSON.stringify({
          state: { hasCompletedOnboarding: false, hasSeenDemo: false },
          version: 0,
        })
      );
      localStorage.removeItem(authKey);
    },
    { onboardingKey: ONBOARDING_STORAGE_KEY, authKey: AUTH_STORAGE_KEY }
  );
}
