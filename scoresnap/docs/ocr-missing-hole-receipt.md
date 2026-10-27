# Missing-hole OCR receipt — 2026-10-27

GS-13 / GS-B9, App Store rung 2: local implementation complete; release gates pending. OCR holes normalize to null/zero confidence. Numbered geometry preserves gaps; ambiguous image alignment stays blank. Camera/paste/fallback/review carry hole identities. Nine-hole readings are retained with manual-entry blocking because the existing engine mapping is unsupported. Legacy/active-round imports validate complete batches and unique explicit mappings. Quick Settle validates before addContest. Review has partial totals, accessible blanks, announced reasons and scrolling numpad/actions. Back-button fix preserved; excluded surfaces untouched.

Commands from `scoresnap/`:

| Command | Actual result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Failed: default cache permissions |
| `npm ci --no-audit --no-fund --cache /tmp/snapscore-npm-cache` | Failed: registry.npmjs.org EAI_AGAIN; Node 20.19.2 engine warnings |
| `node_modules/.bin/jest tests/ocr-missing-hole.test.cjs tests/engine.test.cjs tests/error-back.test.cjs tests/scorecard-corpus.test.cjs --runInBand` | **196 passed, 0 failed; 4 suites**, including all 5 engine runner tests |
| `node --import tsx src/services/__tests__/ocr-client.test.ts` | **18 passed, 0 failed**, mocked; nonzero exit on failure |
| `node_modules/.bin/tsc --noEmit` | **Failed: 45 existing unrelated app/engine/Deno diagnostics**; none in changed scan/OCR/store sources or nullable fixture assertions |
| `git diff --check` (repo root) | Passed |

Dependencies reused locally with `cp -a /workspace/QuickScore/scoresnap/node_modules/. scoresnap/node_modules/` from repo root. Versions/lockfile unchanged. Initial Node subprocess pipes failed EPERM; file-backed stdio fixes the executable test harness. Historical parser/corpus zero and guessed-character expectations now require blanks.

Coverage: both normalizers; malformed routes; missing/sparse/null/empty/zero/non-finite/malformed cells and confidence; interior geometry gaps; OUT/IN; fallback failure; explicit/course-selected front/back nine and partial eighteen; actual store batch atomicity, omitted/duplicate/unmatched players; Quick Settle rejection; actual review component rendering. Hole 7 stays partial 68 through review, becomes 72 on entry of 4, and clearing restores 68/blocked. Exact corrected engine results: strokes 72/108, Stableford 36/0, gross/net skins 18/0, settlement +45/-45 at bet unit 5 with handicaps 8/-2. Invalid batches leave all persisted state unchanged.

[Side-by-side evidence](ocr-missing-hole-review-evidence.html) comes from rendering the actual review component with native host mocks, not device screenshots. Chromium capture attempted from repo root:

```
/home/box/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome --headless --no-sandbox --disable-gpu --disable-background-networking --disable-dev-shm-usage --user-data-dir=/tmp/snapscore-ocr-browser --screenshot=scoresnap/docs/ocr-missing-hole-review-evidence.png --window-size=1500,1800 file://$PWD/scoresnap/docs/ocr-missing-hole-review-evidence.html
```

Failed SIGTRAP: `setsockopt: Operation not permitted`. No PNG claimed.

Pending: integrated device evidence (large text, numpad/reason visibility, assistive announcements and existing UI rules); independent verifier PASS; exact candidate/back-button reconciliation and M3/M4 owner review; PR CI (web-smoke, ios-boot-smoke, tournament-e2e, schema-drift). Local-only/no-push instructions preclude PR/merge and release actions here. Actual pre-merge main SHA, merge method/revert command and rehearsal require the future integrated candidate. Oct 30 runner/cutoff, M6/M7 and Apple processing remain unconfirmed; no delivery/inclusion claimed. No dedicated build or migration. Code rollback does not repair old imported zeros; distributed regression needs a replacement Apple-processed build or OCR import held.

Commit attempt: `git add … && git commit -m "SnapScore: missing OCR holes stay blank (proto 2026-10-26)"` failed before staging: `.git/index.lock: Read-only file system`. The sandbox mounts this clone's `.git` read-only and approval is unavailable. An offline commit patch is saved at `/tmp/snapscore-ocr-missing-hole.patch` using temporary writable Git metadata; the current clone's branch cannot be updated here. No source/remote refs were changed.


## Fix round 1

Read the cut and independent FAIL report for PR #29 at `4c5f33e`. Restored automatic matching for null IDs only when case-insensitive exact names are unique on both sides in the selected group and no explicit row reserves the target. Duplicate names, unmatched rows and duplicate IDs still block visibly; no positional or zero-score fallback. Match/rematch stays available on every contest row, including invalid mappings; Clear match removes an assignment, and choices are limited to the selected group.

ML Kit now keeps unnumbered player names clean and retains candidate score cells at confidence 0 with an explicit alignment block. Numbered collisions/offsets retain every recognized reading in that block rather than discarding them. Corpus expectations now require retained identity, zero confidence and the block, replacing the all-null success expectation.

Validation from `scoresnap/` (reused `/workspace/QuickScore/scoresnap/node_modules`, unchanged versions):

- `node_modules/.bin/jest tests/ocr-missing-hole.test.cjs tests/engine.test.cjs tests/error-back.test.cjs tests/scorecard-corpus.test.cjs --runInBand`: **199 passed, 4 suites passed**. Includes the actual review screen with the web smoke's Augie/Sam/Lee/Pat scanData URL payload, enabled Confirm, exact successful store import, duplicate selection → blocked → clear/rematch → enabled, and wrong-group mapping recovery. Tests also cover exact-name ambiguity and ML Kit absent headers/collisions/offsets.
- `node --import tsx src/services/__tests__/ocr-client.test.ts`: **18 passed, 0 failed**.
- `node_modules/.bin/tsc --noEmit`: exits 2, **45 diagnostics**, identical diagnostic set to archived original head using the same dependencies; **0 new diagnostics**.
- Smoke located at `e2e/web-real-flow.mjs` ("Confirm returns to the contest"). Browser preflight with Playwright Chromium failed at launch (sandbox closes the browser); the full browser smoke was not run. The executable component/store test above covers its payload and import regression. No green browser/remote CI claim.
- `git diff --check`: passed. Excluded Supabase, workflows, build configuration, package versions, share/join UI, headers and game sheets untouched. No push or remote write.

Fix-round commit attempt with message `SnapScore OCR missing-hole: fix round 1 (auto-match, ML Kit readings, rematch)` failed: `.git/index.lock: Read-only file system`. Changes remain in this isolated worktree, uncommitted, per instruction. No pushes.

## Fix round 2

Read the full `e2e/web-real-flow.mjs`, including every post-Confirm assertion, and main `8ab5ec2` review/store import paths. Main matched names across groups but wrote only the selected group. The unchanged smoke imports Group 1 (Augie/Sam), reopens the same four-row null-ID card, selects Group 2 (Lee/Pat), then expects totals 81/72/90/108 and matching persisted calculators.

Restored that selected-group behavior with unique case-insensitive exact-name matching across contest groups. Other-group rows stay visible with player-specific accessibility labels and “Not imported — belongs to <group>”; only selected-group rows enter the existing atomically validated store batch. Unmatched/duplicate mappings and missing holes still block visibly (including missing holes in excluded rows). No positional or zero fallback. Store validation is unchanged.

Replaced the misleading single-group smoke fixture with the real two-group names, scores, handicaps and null match IDs, with no groupId route parameter. Executable actual-component/store coverage verifies enabled Confirm, exclusion labels, both selected-group imports, exact persisted scores, unchanged other-group players, and both successful return navigation calls; duplicate, unmatched, missing-hole and wrong-group recovery checks remain covered. E2e assertions and excluded surfaces unchanged.

Validation (from `scoresnap/`, existing local dependency versions reused):

- `node_modules/.bin/jest tests/ocr-missing-hole.test.cjs tests/engine.test.cjs tests/error-back.test.cjs tests/scorecard-corpus.test.cjs --runInBand`: 199 passed / 4 suites.
- `node --import tsx src/services/__tests__/ocr-client.test.ts`: 18 passed / 0 failed.
- `node_modules/.bin/tsc --noEmit`: exit 2, 45 diagnostics. Archived pre-fix HEAD with identical dependencies: same 45 diagnostic lines, 0 new.
- `EXPO_PUBLIC_OFFLINE_MODE=true node_modules/.bin/expo export --platform web --output-dir /tmp/ocr-round2-web`: succeeded.
- `OUT_DIR=/tmp/ocr-round2-screens node e2e/web-real-flow.mjs`: Chromium launch failed before navigation, `sandbox_host_linux.cc:41`, shutdown Operation not permitted, SIGTRAP. Browser/CI pass is not claimed.
- Logs: `/tmp/ocr-round2-{jest,client,tsc,original-tsc,export,e2e}.log`. No push or remote mutation.
- Full `node_modules/.bin/jest --runInBand`: 295 passed / 59 failed (11 failed suites), subprocess `spawnSync /usr/bin/node EPERM`, matching verifier environment failures. With the verifier's inspected external file-backed stdio preload: `NODE_OPTIONS=--require=/tmp/ocr-verify-stdio.cjs node_modules/.bin/jest --runInBand`: **354 passed, 21 suites passed**. Commands/arguments and failure propagation preserved; no repository test runner/config changes. Logs `/tmp/ocr-round2-all-{jest,adapted}.log`.
- `git diff --check`: passed. Commit attempted with `SnapScore OCR missing-hole: fix round 2 (multi-group import)`; failed creating `.git/index.lock` because `.git` is read-only. Three changed files remain in the isolated worktree, uncommitted. No pushes.

## Fix round 3

Read the whole GS-1 section of `e2e/web-real-flow.mjs` (missing scanData, malformed JSON, and empty player list). Restored the exact message `Invalid scorecard data: no players found in the scan.` for empty or non-array JSON before player validation and contest-player matching. Missing scanData and malformed JSON retain their separate messages. Actual review-component Jest assertions use no contestId and cover `scanData="[]"`, non-array values, and every GS-1 text check. E2e and out-of-scope surfaces are unchanged.

Validation from `scoresnap/` using unchanged local dependency versions:

- `node_modules/.bin/jest tests/ocr-missing-hole.test.cjs tests/engine.test.cjs tests/error-back.test.cjs tests/scorecard-corpus.test.cjs --runInBand`: 199 passed, 4 suites passed.
- `node --import tsx src/services/__tests__/ocr-client.test.ts`: 18 passed, 0 failed.
- `node_modules/.bin/tsc --noEmit`: exit 2, 45 diagnostics; output identical to archived unchanged head `dc0a079` with the same dependencies, 0 new diagnostics.
- `NODE_OPTIONS=--require=/tmp/ocr-verify-stdio.cjs node_modules/.bin/jest --runInBand`: 354 passed, 21 suites passed, using the same external file-backed subprocess stdio preload documented in round 2.
- `git diff --check`: passed. Logs: `/tmp/ocr-round3-{jest,client,tsc,baseline-tsc,all-jest}.log`. Browser smoke was not rerun; no remote CI claim. No pushes.

Commit attempted with `SnapScore OCR missing-hole: fix round 3 (empty scan message)`; failed before staging because `.git/index.lock` is on a read-only filesystem. The three changed files remain in this isolated worktree, uncommitted. No pushes or source/remote ref updates.
