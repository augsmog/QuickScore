# Sunday Ledger coverage — draft for Keep

Branch: `codex/gs-sunday-ledger-coverage-20261023`
Base: `e66c25d` (includes the existing same-browser join banner, above Sunday Ledger theme commit `e739edd`).
Scope: two core flows, join and public live scoreboard/chat. Selected by primary user journey; no traffic analytics were available.

## Before / after

| Surface | Before | After |
| --- | --- | --- |
| Join `/join/[code]` | Theme colors but system-default heading/body/input fonts and placeholder colors | Marcellus headings, Source Sans body and semibold buttons, score font with tabular numerals, textDim placeholders |
| Live `/r/[token]` and shared LiveChat | Scoreboard notes, chat metadata/help/moderation used default fonts; chat heading used synthetic bold; placeholders hardcoded #a8b8ae | Explicit regular/semibold tokens, Marcellus chat heading, textDim placeholders |

No flow, network, persistence, scoring, or layout changes.

## Audit and remaining gaps

Reviewed app routes and shared UI for literal colors, font families, and default-font text. Home `(tabs)/index.tsx`, contest scorecard, contests, and profile already use theme colors/fonts; no cosmetic churn applied there.

- Contest detail: `src/ui/ContestJoinCode.tsx` and `src/ui/LiveShare.tsx` still have default-font action/status text; next small coverage pass.
- Scan camera: `app/scan/index.tsx` retains black camera background and two translucent black overlays. These need camera contrast review before replacement; paper backgrounds are inappropriate for camera framing.
- Sign-in: white/black Apple sign-in treatment is hardcoded; review provider branding before migration.
- Modal backdrops: `AuxiliaryPrompt.tsx` and `GamePromptSheet.tsx` retain translucent black; theme has no scrim token.
- Decorative animation assets: golf-ball whites/grays in `GolfBallScene`, `RollingBall`, `LonelyFlag`, and confetti white remain literals. Decide whether these are material colors or need dedicated tokens.
- CourseSearch tee swatches retain literal black/white and compare literal tee colors; these encode tee identities, so don't blindly map to UI foreground/background.
- ErrorBoundary intentionally uses monospace for diagnostic output.
- Broader visual consistency (radii/type sizes) is outside this minimal font/color coverage pass. Audit is static, not a claim of full visual coverage.

## Validation

- `git diff --check`: passed.
- TypeScript transpile diagnostics for all three edited TSX files: passed (syntax validation only).
- Baseline full `tsc --noEmit -p scoresnap/tsconfig.json`: crashes with `RangeError: Maximum call stack size exceeded` in TypeScript resolution before edits; full type validation remains unavailable.
- No browser/native visual review performed. Keep should review join lookup/player selection/joined score entry and live loading/active/error/chat states before merge.

## Delivery

Local draft branch in `/workspace/QuickScore/sunday-ledger-draft` because the original checkout's `.git` is read-only. Original tracked deletion of `august-industries-site` was left untouched. Preferred `/workspace/aos-state/codex-runs` is outside this session's writable roots, so the review artifact lives here. No vault write or merge_gate needed.

No push, merge, deployment, force-push, or paid operation performed. Remote draft PR has not been opened; publishing a branch may invoke repository deployment workflows, so this delivery stops at the requested draft branch and review notes.

## Proposed draft PR

Title: Extend Sunday Ledger typography to guest join and live scoreboard

Guest join and live chat still showed default system type despite the Sunday Ledger theme. Use existing Marcellus and Source Sans tokens for headings, body, buttons, and score entry, and use the theme's muted text color for placeholders. Complete live scoreboard note typography.

Validation: diff check and TSX transpilation pass. Full typecheck hits a pre-existing TypeScript stack overflow. Visual review remains pending. Scope is three UI files plus this review note; no behavior changes.
