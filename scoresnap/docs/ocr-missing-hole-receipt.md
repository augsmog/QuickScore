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
