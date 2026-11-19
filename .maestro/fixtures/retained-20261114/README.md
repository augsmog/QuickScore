# Retained Nov 14 2026 existing-binary hierarchy captures (AUG-637 / AUG-1280)

Raw `hierarchy-at-failure.json` dumps from the last `$0` evidence pack that re-ran the shared
`create-two-player-skins.yaml` / `aug-309-safe-area.yaml` flows against the two existing EAS
artifacts named in AUG-637, before any existing-binary-compatible selector repair existed.

- `aug637-settlement-6a97486c-hierarchy.json` — settlement run, EAS build
  `6a97486c-6f45-42cd-ad09-27d959395fb4`, flow SHA `f23fc9687d673673af339ab5cfbbd7aa41f29596`,
  CI run 43614179377, failed at the `game-mode-skins` wait.
- `aug637-safe-area-33ac8ba5-hierarchy.json` — safe-area run, EAS build
  `33ac8ba5-c7d1-49b5-ba8e-f14c44211882`, same flow SHA, CI run 43614787562, failed at the
  `Search courses...` scroll.

Source: `/workspace/aos-state/e2e/snapscore-ios/20261114T164000Z-aug637/` (run id
`43614179377+43614787562`, box-only, not a git repo — copied here so
`tests/e2e-existing-binary-selectors.test.cjs` can prove selector uniqueness without a simulator).

These two EAS builds predate the AUG-612 iOS a11y `childOf` fix (`game-mode-skins` never gets an
accessibility id) and predate `EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true` in the offline profile (the
Players & Course step renders the plain "Course name" `TextInput`, same as today's
`COURSE_SEARCH_ENABLED=false` branch in `app/contest/new.tsx`). Both builds are frozen (no new
EAS build is authorized — $0, AUG-637) so the harness needs build-specific selectors instead.
