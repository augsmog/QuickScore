# device-layout gate (AUG-1380)

Cross-device **usability + visual layout** gate for SnapScore UI PRs. Two layers over
synchronized native geometry, agreed in
`/workspace/aos-state/reports/2026-11-19-device-gate-t1547u/RECONCILED-PLAN.md` (sections B–E):

1. **Deterministic geometry** — `lib/geometry-rules.mjs` implements rules 1–8 (overlap,
   clipping/reachability, truncation/context, spacing/alignment, tap targets, alignment/indent,
   state legibility, flow completion) over a *normalized element tree*. Ported from
   `scoresnap/e2e/journeys/capture-layout.mjs:134-150` and extended to the native rule set.
2. **Vision rubric** — `lib/vision-rubric.md` (v2). A screenshot reviewer (Codex **gpt-6-astra
   high** for Claude-built SnapScore; Claude for OpenAI-built; never Grok) flags overlap,
   clipping, truncation, misalignment, illegible control states, dead space, and "would a new
   user find this broken."

## Layout

| Path | What |
|------|------|
| `lib/geometry-rules.mjs` | rules 1–8 engine (`evaluateCheckpoint`) |
| `lib/normalize-maestro.mjs` | Maestro `captureHierarchy` → normalized tree adapter |
| `lib/vision-rubric.md` | the reviewer rubric (v2) |
| `lib/vision-schema.mjs` | validates the reviewer's JSON output |
| `lib/vision-selfcheck.mjs` | rubric-drift self-check (negative/positive fixtures) |
| `lib/waivers.mjs` | named, expiring waiver validation + application |
| `run-geometry.mjs` | layer-1 CLI over a capture bundle |
| `run-vision.mjs` | layer-2 CLI (reviewer + self-check) |
| `config/device-layout.config.json` | `device-layout/v1` config for SnapScore |
| `fixtures/negative/` | immutable owner negative fixtures (`multi-day.png`, `team-mode.png`) + sha256 + `fixtures.json` |
| `fixtures/negative/calibration/` | committed Codex astra/high reviews the self-check runs on |
| `waivers.json` | active waivers (empty) |
| `scripts/run-android-compact.sh` | Android compact-AVD native leg (AUG-1376 harness hook) |

## Run locally

```bash
cd scoresnap/e2e/device-layout
node --test lib/*.test.mjs                                   # layers 1–2 unit tests
node run-vision.mjs --self-check --reviews fixtures/negative/calibration   # rubric-drift check
node run-geometry.mjs <capture-bundle.json>                 # layer 1 over a captured flow
```

## Negative fixtures (gate must FAIL them)

`multi-day.png` and `team-mode.png` are real screenshots of SnapScore 1.0.1 build 32's broken
New Contest layout (iPhone 16 Pro, owner report t1547u), committed immutable with sha256. Every
run sends them through the vision step; each must return `verdict:"fail"` with a major finding
for each `requiredRuleGroup`, or the gate **fails itself** (drift detection). The required groups
encode the owner-confirmed defects — including the two that calibration **run 1 missed**: **rule
2** (player card hard-clipped by the sticky Continue footer) and the **rule 4/6 alignment
family** (player-card HCP/badge/chip imbalance). Calibration **run 2** (rubric v2, `../reports/
2026-11-19-device-gate-t1547u/run2/`) catches both; those reviews are committed under
`fixtures/negative/calibration/`. Corrected positive fixtures (over-rejection check) go in
`fixtures/positive/`.

> **Geometry negative fixtures** (frozen native hierarchy reproducing the same defects) are a
> **device-evidence** item: they must come from reproducing the defects on a verified matching
> build, never fabricated from screenshots — tracked by **AUG-1376**.

## Enforcement (`.github/workflows/device-layout-gate.yml`)

Always-start workflow with **internal path logic** (external path filters leave required checks
stuck "Expected"). UI-affecting changes run the gate; doc-only changes emit an explicit
successful exemption; unknown-impact changes run the gate (fail-safe). Per-PR required surface
today is the deterministic + vision-selfcheck layers (fast, no spend). The Android compact-AVD
native leg runs on ubuntu-latest KVM (1× quota) when the AUG-1376 harness is wired and the owner
sets repo variable `DEVICE_LAYOUT_NATIVE=true`; iOS rows land on the Mac mini runner (AUG-1376).

## Owner items (RECONCILED-PLAN section G)

1. Enable branch protection / required status checks on `augsmog/QuickScore` main.
2. Approve the `safe_merge.py` mandatory-named-check change (lander control code).
3. Register self-hosted runners (Mac mini iOS; Android hosted primary).
4. Wire the live vision reviewer credential into CI (or keep committed calibration reviews).
5. Confirm Actions quota/storage headroom; disable overage/spend.
6. Break the Friday-staging tie (RECONCILED-PLAN dispute E): both-platform native before PASS,
   vs. staged Android-hosted + one-shot iOS 16 Pro evidence.

## Reusable packaging

`config/device-layout.config.json` is a `device-layout/v1` instance. The same geometry engine +
vision rubric + waiver format are reused across stacks via per-stack adapters (Maestro here;
Godot `Control`-tree adapter for LRD, RN/Expo for the parents' game) — tracked by **AUG-1381**.

## Native evidence contract (AUG-1376 harness must satisfy this)

Added after the Codex astra/high check on `7116885` (three findings, all fixed):

1. **Paths.** `scripts/run-android-compact.sh` / `scripts/run-ios-sim.sh` resolve everything from the
   module dir (`$DL`) and repo root (`$ROOT`); `lib/native-scripts.test.mjs` runs the real scripts
   against a stub repo to prove it.
2. **Candidate-bound, complete bundles.** The harness provides `scripts/build-android.sh`,
   `scripts/build-ios-sim.sh` and `scripts/bundle-from-maestro.mjs <maestro-debug-dir> --platform
   <ios|android> --profile <id> --source-sha <sha> --out <bundle.json>`. A bundle carries
   `sourceSha, buildHash, profile, platform` and, per checkpoint, `flow, checkpoint, deviceId
   (== profile), platform, nodes[] (non-empty), screenshot (relative path), screenshotSha256`.
   `run-geometry.mjs --expect-sha <checked-out sha> --profile <id>` fails on missing metadata, empty
   node trees, stale SHA, or any omitted checkpoint of the per-PR flows in `config` (rule 8).
3. **Candidate vision.** The `vision-candidate` job (Mac runner) downloads every native bundle and
   runs `run-vision.mjs --candidate`: a fresh live self-check on the owner negative fixtures with
   the same reviewer, then a sha256-bound review of every candidate screenshot (verdict pass, no
   major finding, bound to sourceSha/buildHash/flow/checkpoint). The reviewer is
   `DEVICE_LAYOUT_VISION_CMD`, configured runner-side (reference: `scripts/review-codex.sh`, Codex
   gpt-6-astra/high; never Grok). Unset or failing reviewer => FAIL. The aggregate
   `device-layout-gate` requires `vision-candidate` success whenever native evidence is required.
