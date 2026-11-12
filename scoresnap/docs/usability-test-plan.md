# GS-16 SnapScore usability test plan

Binding scope: [vault cut](../../../augie-os/cuts/2026-10-23-playwright-usability-all-projects.md), pressure test `proposed/pressure-test-2026-10-23-playwright-usability.md`, Owner Keep 2026-10-23 ~12:06 PT. This document incorporates all five binding edits. GS-13 [outcome test plan](../e2e/README.md) remains additive and unchanged.

## Seed mapping and flow inventory

Home “Join with code” → `/join/enter` → `app/join/[code].tsx` (`JoinContest`). Direct invite `/join/:code` renders the same component. `src/ui/ContestJoinCode.tsx` is the organizer's invite display, not the trapped guest entry. The dismiss is outside all conditional join states and replaces the route with Home, including cold deep links with no history. No submission, successful backend lookup, reset or browser Back is needed.

| Required case | Entry / deterministic fixture | Exit / behavior | UH |
|---|---|---|---|
| join-empty | Home join button, empty inputs | Visible named Back to home activated; Home renders | 1, 2, 6 |
| join-invalid | Home join button, ZZZZZZ + Guest, empty local storage | Not-found error → in-UI Back to home → Home | 1, 2, 5 |
| join-deeplink | `/join/ZZZZZZ`, fresh context | Dismiss reached with Tab, Enter returns Home without lookup | 1, 2, 3, 6 |
| create-cancel | Home New Contest → `/contest/new`, type Unsubmitted | Keyboard Back returns Home, no contest persisted | 1, 2, 3 |
| review-error | Home then `/scan/review?scanData=%7Bbad` | Malformed-data error → Go Back → Home | 1, 2, 5 |

Fresh isolated browser contexts; all external requests blocked; no live account, paid service or demo fixture. Each test asserts its entry state and declared exit destination. Browser history is never the tested dismiss action.

## Shared helper contract (normalized semantics)

`e2e/shared/usability.mjs` accepts Playwright locators and destination/state callbacks; no SnapScore routes or selectors are embedded. Product adapters supply entry actions, fixture states, unique dismiss/cancel/recovery controls and destination assertions.

| ID | Pass | Fail |
|---|---|---|
| UH-1 | One visible enabled in-UI dismiss | Missing, hidden, disabled or ambiguous control |
| UH-2 | Activate dismiss and assert known destination | Activation fails or destination unavailable |
| UH-3 | Real Tab reaches dismiss and Enter activates; modal adapters additionally pass Escape and focus-restoration callbacks | Unreachable control, broken activation, or configured Escape/focus assertion fails |
| UH-4 | Cancel confirm, verify destination and unchanged data | Missing cancel, bad exit or mutated data |
| UH-5 | Assert error, activate recovery, assert recovered destination | Dead error or ineffective recovery |
| UH-6 | Assert code entry and dismiss before any submit, activate to destination | Submit required, missing dismiss or failed exit |

## Gate and commands

After building/serving the offline Expo app per the outcome README:

```sh
node --test e2e/usability-gate.test.mjs
node e2e/usability.mjs
node e2e/usability-regression.mjs
```

QA green requires ALL existing Jest, outcome `web-real-flow.mjs`, live-share, 24-case matrix and both usability commands green on the same revision/export. No outcome suite edits or replacement. Workflow `Web smoke / web-smoke` has a 40-minute hard budget; timeout is failure, never permission to omit cases. Repository administrators must require this job in branch protection before calling it merge-enforced; this PR does not claim to change remote branch rules. Draft remains unmerged.

Startup/discovery errors, zero tests, missing/duplicate required IDs, unexpected extra results, failures and skipped statuses block green. The gate contract tests exercise these report states. Usability has no retry or skip path. Server PID liveness and final HTTP readiness are asserted. Traces, screenshots and JSON reports are uploaded with `if: always()` under the existing web artifact.

The regression command removes the actual dismiss DOM control from the seed screen in a fresh context, then invokes the exact normal gate. It requires nonzero status, specifically a dismiss-related join-empty failure, all other cases passing, and nonempty failure PNG/trace. Startup failure cannot count as successful regression proof. It changes no product source. Normal and mutated artifacts have separate directories.

## Evidence boundaries and owned gaps

Local offline Expo export succeeded. The restricted implementation environment denied server listen and Chromium sockets (`EPERM`); existing Jest child processes also hit `EPERM`. Therefore browser results, missing-dismiss failure screenshots/traces, GS-13 outcome rerun and full engine results are NOT green evidence yet. CI must supply them before QA green; no dogfood soft-pass.

These are sampled secondary screens, not coverage of all screens/modals. No tested flow contains a destructive confirmation. Settings Delete Account uses native `Alert.alert` and nested Cancel confirmations; react-native-web does not expose these as a deterministic browser dialog. UH-4 is a reusable helper, currently unexercised against product UI: **GS-16 Eng owns follow-up** for web-compatible destructive confirmation and cancel/no-mutation proof. Unknown native behavior is TODO, never pass.

The selected route screens do not define an Escape dismissal contract or modal opener focus return. Keyboard reachability/activation is tested. **GS-16 Eng owns follow-up** for Home game-info and review player-picker modals: explicit named dismiss, Escape and opener focus restoration tests. UH-3's optional modal callbacks must be provided by those adapters. Successful join scoring remains GS-13 outcome coverage; local offline lookup cannot establish backend cross-device correctness.

Web results establish no iOS parity. Existing iOS boot, real-device QA, GS-AS1–AS7 and public App Store release gates remain required. No Maestro/Detox introduction.

## Owned adapter queue (after SnapScore green)

1. **Curious City — Codex/Eng owner; Tater coordinates.** Follow-on task GS-16-CC: verify runnable web harness/startup and deterministic fixtures; supply thin route/selector adapter to these helpers; three-flow entry/exit matrix, applicable confirm/error/Escape/focus checks, failure mutation, blocking CI and artifacts. Complete only with revision + command + green reports and retained negative proof, after SnapScore green/Keep evidence.
2. **KickLab — Codex/Eng owner; Tater coordinates.** Follow-on task GS-16-KL, after Curious City: same readiness, adapter and proof contract; preserve its outcome coverage and explicitly record native/web gaps.

These are named follow-on tasks, not portfolio adapters implemented by this PR. No claim that external tracker tasks have been filed. The Q requires an interactive surface; parked products remain deferred.
