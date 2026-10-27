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
