AUG-1157 / OpenAI builder aos-ready-2 / separate cross-company checker required.
Candidate worktree: /workspace/aos-work/lanes/aos-ready-2/aug1157
Exact HEAD 44190e66c21abda28d471b01995217b9e46bda06; tier=low, audit=no (risk-tier.json).
Diff: minWidth/minHeight 44 plus responsive two-chip widths and snapping on Home's existing mode row, preventing an 8px left sliver exposed by initial min-size-only candidate. New real-export browser regression on three profiles exercises J-home-create-cancel, screenshots/geometry at entry/create/edit/cancel/reveal/open, clipped fourth-chip scroll and real modal activation. Shared mode geometry assertion is invoked by existing J-home-create-cancel adapter so existing CI runs it without workflow changes. No product text changes.
Acceptance: named Home mode controls expose >=44x44 visible targets, >2px overlap fails, clipped fourth control can be fully revealed and activated. Preserve unrelated capture auditor findings rather than claim parent geometry acceptance. No native/owner acceptance gate.
Commands (browser/export always under flock /workspace/aos-state/locks/browser-perf.lock):
cd scoresnap && BASE_URL=http://127.0.0.1:8199 OUT_DIR=<evidence>/green-snap node --test e2e/journeys/home-mode-targets.browser.test.mjs
Optional CAPTURE_AUDITOR=/workspace/aos-work/lanes/aos-ready-2/evidence/20261116-1157/capture-auditor/e2e/journeys/capture-layout.mjs runs the immutable AUG-1155 strict full-capture auditor and retains all findings.
node --test e2e/journeys/ci-registration.test.mjs e2e/journeys/metrics.test.mjs e2e/journeys/reach-report.test.mjs => 43 pass
npm test -- --runInBand tests/home-see-all-modes.test.cjs => 2 pass
Evidence red.log: expected 33px rejection on SE/15Pro/ProMax against immutable failing export 73dfa7fb08b4810992bcb6041d747544cc156496 (source-export.json in original AUG1155 evidence).
Please read diff and bind verdict to exact candidate HEAD. Independent read-only check, no Linear writes on claude-mac. End with VERDICT: PASS only if justified, otherwise one FAILING-CHECK: <check> -- <evidence> per failing check. Maximum two rounds; fix only named failures. No same-company fallback.
Fresh green-snap.log: 3/3 rendered profiles PASS, including explicit clipped-negative rejection, 7 captures each with geometry and all strict auditor findings retained. green.log is the earlier min-size-only candidate 2 PASS/1 FAIL (15Pro 8px left sliver), NOT the final result. red-final.log is an infrastructure failure after the original shared export was removed, NOT a product-size reproduction.

