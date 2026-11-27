# device-layout Maestro flows (AUG-1376)

Per-checkpoint capture flows for the `device-layout-gate` native legs. Unlike the `aos-e2e`
regression flows, these are **capture** flows: each sub-flow drives the app to one layout
checkpoint and ends; the native orchestrators
(`scoresnap/e2e/device-layout/scripts/run-ios-sim.sh`, `run-android-compact.sh`) dump the live
Maestro view hierarchy (`maestro hierarchy`) + a screenshot after each one, then
`scripts/bundle-from-maestro.mjs` turns the capture directory into the bundle that
`run-geometry.mjs` (rules 1–8) scores.

## Session model

Within a flow directory the sub-flows run in filename order **in one app session** — only the
`00-*` sub-flow calls `launchApp`; the rest continue from the live state so the journey builds up
(multi-day on → 3 rounds → 4 rounds → teams → 4 players → scroll to footer). Each continuation
opens with an `assertVisible` so a broken state fails loudly instead of capturing the wrong screen.

## Flows

- `new-contest/` — the New Contest wizard: empty wizard, name entry (keyboard up), multi-day on,
  3 rounds, 4 rounds (scrolled), team mode on, four players, last player above the sticky footer.
  The footer (`contest-continue` / `contest-start` CTA) anchors rule 2's clip/occlusion check.
- `join/` — the Home join-code entry. The release ships join by code on, so the gate's build has it
  on (`DEVICE_LAYOUT_JOIN_FLAG` in the workflow) and the flow asserts the entry is present.
- `paywall/` — deep-links `snapscore://paywall?tier=td` and captures the tournament upgrade view.
- `sign-in/` — deep-links `snapscore://auth/sign-in` and captures the sign-in options; asserts
  "Continue with Google" is absent (1.0.1 ships without Google sign-in; the button is shown only
  when the build has a Google client id) and, on iOS, that "Continue with Apple" is present.
  Then the email and password form, the only route besides Apple and the one a review tester uses.

## Profiles & large text

The orchestrators run each per-PR profile (iOS: iphone-16-pro + iphone-se-3; Android:
android-compact) and, when total wall time stays under 15 min, re-run at the large-text profile
(iOS AX3 / Android fontScale 1.3) — otherwise the large-text pass runs nightly (AX1 / 1.3). See
`scoresnap/e2e/device-layout/config/device-layout.config.json`.
