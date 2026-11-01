# Full-screen safe-area audit (2026-10-31)

The Home game library was introduced by PR #71 (`6bd4eb5`, merged as `64bd0f6`). Its full-screen RN Modal placed a native SafeAreaView in a separate native tree without a local SafeAreaProvider. The iOS implementation searches native ancestors, independently of React context. The title and X therefore had no reliable top inset; the supplied iPhone screenshot shows the result. This is a native boundary problem, not a font or title-spacing problem.

`FullScreenSheet` owns the only RN Modal implementation, a local SafeAreaProvider seeded with current parent insets/frame, and one SafeScreen content boundary. Local measurements subsequently update it, including rotation. SafeScreen applies current insets as additive JS padding. Opaque modal inset bands use the page background; transparent sheets remain transparent. Existing per-sheet content spacing is retained. The library's former inner safe-area boundary is removed to prevent double padding. All other pages use the same SafeScreen primitive; contest child tabs inherit their layout's boundary. No visible strings change.

| Screen | File under scoresnap/ | Before | After |
| --- | --- | --- | --- |
| Home / game library / game info | app/(tabs)/index.tsx | Library native safe view had no modal-local provider; info sheet raw Modal | Shared page boundary; both overlays use FullScreenSheet; library applies top/bottom once |
| Contests tab | app/(tabs)/contests.tsx | Root safe view, top | Shared SafeScreen, top; tab bar owns bottom |
| Profile tab | app/(tabs)/profile.tsx | Root safe view, top | Shared SafeScreen, top; tab bar owns bottom |
| Sign in | app/auth/sign-in.tsx | Root safe view | Shared page boundary, all edges |
| Onboarding | app/onboarding.tsx | Root safe view | Shared page boundary, all edges |
| Create contest | app/contest/new.tsx | Routed modal, root safe view top | Shared page boundary, top; existing bottom content spacing retained |
| Contest header / overview / games / settlement | app/contest/[id]/_layout.tsx; index.tsx; games.tsx; settlement.tsx | Layout owns top safe area; tabs inherit it | Layout uses shared page boundary once; child tabs still inherit it |
| Edit contest | app/contest/[id]/edit.tsx | Root safe view top/bottom | Shared page boundary with existing edges |
| Scorecard | app/contest/[id]/scorecard.tsx | Root safe view top | Shared page boundary with existing edges |
| Tournament rounds | app/contest/[id]/tournament-rounds.tsx | Root safe view top/bottom | Shared page boundary with existing edges |
| Scan: text / permission / camera / photo preview | app/scan/index.tsx | Full-screen native stack modal; safe views on text/permission/preview; camera header uses insets.top + 8 | Shared page boundaries; camera's existing explicit top inset retained; bottom controls use bottom edge |
| Review / error / player matching | app/scan/review.tsx | Root safe view top; raw transparent player-match Modal | Shared page boundary; matching uses FullScreenSheet with local provider |
| Scan game details | app/scan/game-details.tsx | Root safe view top | Shared page boundary, top |
| Paywall | app/paywall.tsx | Routed modal with root safe view | Shared page boundary, all edges |
| Settings | app/settings.tsx | Root safe view top | Shared page boundary, top |
| Statistics | app/statistics.tsx | Root safe view top | Shared page boundary, top |
| Join | app/join/[code].tsx | Root safe view | Shared page boundary, all edges |
| Spectator scoreboard | app/r/[token].tsx | Fixed 48px top gap, no inset boundary | Shared page boundary plus existing spacing |
| Developer previews | app/dev/local-join-banner.tsx; app/dev/recap-card.tsx | Banner safe; recap lacked boundary | Both use shared page boundary |
| Fatal error fallback | src/ui/ErrorBoundary.tsx | Centered page without boundary | Shared page boundary |
| Human verification | src/components/TurnstileHost.tsx | Centered transparent raw Modal | FullScreenSheet, local provider, all edges |
| Auxiliary prompt | src/ui/AuxiliaryPrompt.tsx | Transparent bottom sheet, 70% cap, raw Modal | FullScreenSheet; safe top/bottom; existing cap/spacing retained |
| Chat moderation | src/ui/ChatModeration.tsx | Transparent bottom sheet, raw Modal | FullScreenSheet; safe top/bottom |
| Course search | src/ui/CourseSearch.tsx | Transparent 85% sheet, raw Modal | FullScreenSheet; safe top/bottom |
| Game prompt | src/ui/GamePromptSheet.tsx | Transparent 85% sheet, raw Modal | FullScreenSheet; safe top/bottom |
| Pre-play declarations | src/ui/PrePlayDeclarations.tsx | Centered 85% transparent raw Modal | FullScreenSheet; safe top/bottom |
| Root loading state / animations / recap card | app/_layout.tsx; src/ui/animations/*; src/ui/recap/* | Spinner or content/decorations inside owning screen | No independent header or overlay window; enclosing screen owns safe area |

## Regression coverage

`npm test -- --runInBand` includes `tests/safe-sheets.test.cjs`: AST checks reject raw RN Modal imports (including aliases), namespace bypasses, raw Modal JSX, and direct SafeAreaView imports outside the shared component. There are no popover allow-list exceptions: even partial sheets use the wrapper. Unit checks verify provider placement, current-metric seeding, prop forwarding, additive edge padding and changed orientation insets. Existing shallow screen test harnesses stub the shared boundary; the new test exercises its actual implementation.

`BASE_URL=http://127.0.0.1:8089 node e2e/safe-area-sheets.mjs` is a required web-smoke step. It runs Chromium at 393×852, overriding only safe-area-context's hidden CSS-env measurement sensor to 59px top and 34px bottom, with no production test hook. It opens Home → See All and measures the title and close control, checks exactly one inset on the modal content, and checks reachable game info, scan, review error, create contest, paywall, join and spectator controls/headers. External service requests are blocked; the unused QR worker decoder is stubbed locally. Feature-gated/live-service and native-camera-only states are covered structurally and by the common boundary, not claimed as browser-executed interactions.

`BEFORE_NATIVE_SIM=1` is only for the origin/main reference screenshot. Web's legacy SafeAreaView correctly inherits React context, unlike the native ancestor lookup; this mode explicitly removes its library padding to emulate the supplied iOS failure. The normal regression never changes content layout and fails on origin/main because the shared modal boundary is missing. Browser screenshots are layout evidence, not a native-device verification claim.

## Release implications

`app.json` still declares iOS buildNumber 1; `eas.json` uses remote appVersionSource and autoIncrement. Repository metadata alone cannot identify a processed TestFlight build number or the deployed Worker revision. The existing local Build 27 receipt (`reports/ss-sync-20261031/build-r1.md` in the coordination workspace) identifies source `7ce7144`, which contains PR #71. Thus that source includes the faulty native library. A web deployment of main contains the same library but does not inherently reproduce this native ancestor lookup failure; browsers normally report zero insets on desktop, while mobile web uses its own CSS-env measurements. No production deploy was inspected or changed.

A native rebuild is required for verification/shipping this native-rendered component change. No EAS, App Store Connect, or other build service was called by this task.
