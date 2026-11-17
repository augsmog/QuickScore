# AUG-538: Sentry triage for AUG-68 (SCORESNAP-9, 2 App Hang issues)

Status: **partial. Regression test added for the offerings error path. Sentry event data still not pulled. App Hang not diagnosed.**

## What was checked
- Sentry MCP (`claude.ai Sentry`) is not authorized in the unattended session, so SCORESNAP-9 and the two App Hang issues could not be pulled. No event payloads, stack traces, release tags, or affected-user counts are in the repo.
- `scoresnap/src/services/purchases.ts` `getOfferings()`: returns `null` when not configured. On a RevenueCat rejection it logs to console and calls `Sentry.captureException(e, { tags: { service: "purchases", action: "offerings" } })`. The error does not propagate to the UI.
- The jest blocker from the first pass is fixed: `expo`'s babel preset injects the ESM module `expo/virtual/env` into any file that reads `process.env.EXPO_PUBLIC_*`, and `purchases.ts` does. `jest.config.cjs` now transforms `expo` / `expo-modules-core` (`transformIgnorePatterns`).

## Regression test (added)
- `src/services/__tests__/purchases-offerings.test.ts` (3 cases): not-configured returns `null` with no RevenueCat call; configured returns the current offering; a RevenueCat rejection is swallowed, sent to Sentry with the `offerings` tag, and returns `null`.
- Run: `npx jest src/services/__tests__/purchases-offerings.test.ts` → 3 passed.

## Still open
1. Sentry read access for SCORESNAP-9 and the two App Hang issues. Authorize the Sentry connector, or paste the issue JSON / stack traces into the ticket.
2. Why RevenueCat rejects `getOfferings()` (the error payload is not in the repo).
3. App Hang root cause. Candidates on the main thread: `initPurchases`, `getOfferings`, `customerInfoUpdateQueue`. Needs the stack traces.
