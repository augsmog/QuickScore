# VERDICT: PASS — chk-AUG-1155-73dfa7fb08b4-20261116T094408

Ticket: AUG-1155 (AUG-313 slice: enforce safe-area, target size and overlap at every journey capture)
Head SHA: 73dfa7fb08b4810992bcb6041d747544cc156496 (worktree HEAD == enqueued sha; clean tree)
Builder: openai/codex (pull-lrd). Checker: anthropic/claude-code (claude-mac), tier=high, file-only, no Linear writes.

## Scope (6 files, +192/-53)
- NEW `scoresnap/e2e/journeys/capture-layout.mjs`: `createPaintHelpers` (shared browser factory: renderedChain/textContrasts/rgba) + `auditCapture(page,context)` returning {targets,texts,failures}.
- NEW `scoresnap/e2e/journeys/capture-layout.browser.test.mjs`: static wiring assertion + 18-fixture audit matrix.
- `runner.mjs`: geometry() refactored to use shared createPaintHelpers; step() audits every screenshot and demands zero failures; simulateSafeArea init script; writes results.json; copies GROWTH.md.
- `safe-area-profiles.mjs`: exports shared `simulateSafeArea`.
- `safe-area-sheets.mjs`: consumes shared `simulateSafeArea` (inline copy removed).
- `.github/workflows/web-smoke.yml`: adds capture-layout.browser.test to contract-browser list; EXIT trap enforces 120s matrix budget + writes matrix-timing.json.

## Acceptance verification
1. EVERY journey boundary audited: runner.mjs step() calls auditCapture before page.screenshot and `demand(layout.failures.length===0,'capture-layout')`. Safe-area exclusion (top<profile.top || bottom>height-profile.bottom), >=44x44 target-size, >2px control-overlap via findInteractiveTargetOverlaps (tolerance 2, no parentId exemption — targets carry no parentId), text-over-control >2px with own-label excluded by DOM ancestry only, unsupported-geometry failed not passed. Reuses extracted shared helpers. PASS.
2. Fixtures: rejects top-band y4 / bottom-band y800(bottom844>818) for 15Pro(59/34), 20x20 small-target, 3px overlap (button 44 at x100+x141), text-over-control; passes safe-edge(59/774 bottom818), 2px overlap, offscreen, hidden, transparent-text, opacity-product, covered-control. Failure objects carry profile/journey/capture/assertion/geometry/screenshot (asserted by test). PASS.
3. 3-profile SE/15Pro/ProMax loop preserved; results.json + reach.md + GROWTH.md(source present) + screenshots + timings retained; EXIT trap bounds integrated matrix to 120s. PASS.
4. Independent cross-company PASS at head (this verdict). Exact-head green CI (full live-app 3-profile journey matrix on :8092) is the separate safe_merge gate — not reproducible file-only; acceptance explicitly allows newly-exposed product defects to spawn sibling AUG-313 regression tickets rather than silent exemption.

## Independent checks run
- `node --test e2e/journeys/capture-layout.browser.test.mjs` -> 20/20 PASS (cached chromium-1248). Includes the static test proving runner.mjs orders auditCapture before page.screenshot, pushes layout onto a.steps, demands capture-layout, and adds the simulateSafeArea initScript.
- `node --check` on runner.mjs, capture-layout.mjs, safe-area-profiles.mjs, safe-area-sheets.mjs -> all OK.
- `git diff --check origin/main...HEAD` -> clean (no whitespace errors).
- Extraction equivalence: removed inline renderedChain/rgba/textContrasts bodies are byte-identical to createPaintHelpers; simulateSafeArea move is byte-identical; geometry() `page=locator.page()` in scope; JSHandle-in-arg resolution identical to the passing auditCapture path.

## Advisory (non-blocking)
Full live-app 3-profile journey-runner matrix + negative-proof require the served scoresnap export (BASE_URL :8092) and were not run file-only (heavy Expo export; inodes 75%). That is the independent exact-head green-CI merge gate, verified separately by safe_merge before merge.

VERDICT: PASS
