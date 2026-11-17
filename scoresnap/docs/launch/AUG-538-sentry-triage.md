# AUG-538: Sentry triage for AUG-68 (SCORESNAP-9, 2 App Hang issues)

Status: **triage incomplete. No code change.** Sentry event data was not reachable from this lane.

## What was checked
- Sentry MCP (`claude.ai Sentry`) is not authorized in the unattended session, so SCORESNAP-9 and the two App Hang issues could not be pulled. No event payloads, stack traces, release tags, or affected-user counts are in the repo.
- `scoresnap/src/services/purchases.ts` `getOfferings()` (line ~125): returns `null` when not configured, and on a RevenueCat rejection logs to console and calls `Sentry.captureException(e, { tags: { service: "purchases", action: "offerings" } })`. The error does not propagate to the UI. This matches the "offerings error" signal, but it does not show why RevenueCat rejected.
- App Hang root cause: no evidence in the repo. Needs the Sentry stack traces.

## Blocked on
1. Sentry read access for SCORESNAP-9 and the two App Hang issues (authorize the Sentry connector, or paste the issue JSON/stack traces into the ticket).
2. Jest could not load `src/services/purchases.ts` under the existing `jest.config.cjs` (`Must use import to load ES Module: expo/virtual/env.js`). A regression test for the offerings null path was attempted and reverted. Fixing this needs a jest transform/mocking decision.

## Next step
Owner or the box Claude lane with Sentry access: pull SCORESNAP-9 and the two App Hang events, then decide whether the hang is on the main thread around purchase/offerings calls (`initPurchases`, `getOfferings`, `customerInfoUpdateQueue`).
