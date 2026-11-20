# AUG-1384: one device-layout/v1 contract (PR #341 + PR #342)

Two candidates were built for AUG-1381:

- **PR #341** (`claude/aug-1381-device-layout-v1`, head before this change `7bfc69b8`): `packages/device-layout/`. It has the CLI, receipt, waiver document, vision verdict, SnapScore and Godot adapters, and its own CI workflow.
- **PR #342** (`tater/aug-1381`, head `99aeb9e5`): `scoresnap/e2e/device-layout/v1/`. It has a config schema with provenance, flows and retention, a cross-company reviewer policy, a Maestro adapter and a Godot Control-tree adapter.

## Decision

- **Canonical location: `packages/device-layout/` (PR #341).** It sits at the repo root, outside the SnapScore app, so LRD and later products can vendor it unchanged. PR #342 lives inside `scoresnap/e2e/`.
- **Superseded: PR #342.** It should be closed without merging, through the authorized PR workflow. The claude-mac lane does not close or comment on other lanes' PRs, so this branch only records the decision. Merge this PR only after #342 has been marked superseded.

## What was carried over from PR #342

| PR #342 behaviour | Where it lives now | Test |
|---|---|---|
| Config `adapter`, `provenance`, `flows/states/checkpoints`, `reviewerPolicy`, `fixtures`, `retention` | `src/config.mjs` `validateContract` (required in v1) | `contract: config must declare ...` |
| `sourceSha/buildHash/configHash` provenance | `src/gate.mjs`: snapshots and the receipt share it; stale or missing hashes make the run INVALID or FAIL | `provenance: ...` |
| Cross-company reviewer (Claude-built work is reviewed by OpenAI, never Grok, effort high) | config `reviewerPolicy`, plus `evaluateVision({policy})`, which also rejects a third provider the policy doesn't name | `vision: config reviewerPolicy ...` |
| Missing-platform evidence can never be waived | `validateWaivers` rejects non-check rules and any "missing platform/evidence" waiver | `gate: missing platform evidence cannot be waived` |
| Negative-fixture rubric-drift self-check | `evaluateVision({fixtures})`: every declared negative fixture must be reviewed (matched by `artifactHash`) and must return a major finding. A fixture that isn't committed yet (`artifactHash: null`) counts as drift and fails closed | same |
| Maestro hierarchy adapter | `adapters/rn-maestro.mjs`, which emits the canonical `device-layout/snapshot/v1` | `rn-maestro adapter ...` |
| Godot Control-tree adapter | Not ported. PR #341 `adapters/godot.mjs` + `dump_layout.gd` already cover Godot and are tested against the same dump format | existing godot tests |
| Element tree `{bbox, hitRegion, clip, scrollState, children}` | Not ported as a second format. The flat snapshot (`targets` with `parentId` and `size`, `texts` with `owners`) is the one normalized tree. One format is how the two products stay on a single contract | — |
| Structural JSON-schema mini validator | Not ported. The hand-written validators plus the JSON Schemas in `schema/` cover it | `shipped configs validate` |

## Section F gaps, stated explicitly

- `RECONCILED-PLAN.md` section F is at `/workspace/aos-state/...` (box-only), so the Mac lane could not read it. This contract follows the AUG-1384 acceptance text, AUG-1373 sections A and B, and PR #342's README, which quotes section F. The checker should diff the contract against section F itself.
- **The adapters are pure transforms over fixtures. They do not prove that native exports lay out correctly.** No simulator, emulator, Maestro or Godot run happens here. Native Maestro capture is AUG-1385. LRD Control-tree capture is AUG-1386. Real mobile-export touch journeys for LRD remain open.
- The shipped negative fixtures (`multi-day.png`, `team-mode.png`, the LRD notch band) are not committed. Each is declared `artifactHash: null` with a pending ticket, so a vision run on the shipped configs FAILS until the images and their hashes land.
- SnapScore `screens` are not declared yet. A config with no `screens` coverage contract **fails closed**: `runGate` reports a `{'*','*'}` missing-coverage gap, so a single snapshot can never certify the 6-device/3-flow matrix as covered (a doc acknowledgement does not satisfy "reject missing coverage"). AUG-1385 lists the SnapScore screens with native capture. The vision `requiredCheckpoints(config)` already expands devices × flows × checkpoints.
- `retention` is declared and validated, and it is copied into the receipt. Enforcing it (deleting artifacts) is up to the CI artifact store, not this package.
- The parents' game (AUG-1024) adapter is still a stub that throws.
