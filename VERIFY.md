# AUG-70 remaining pilot gates — independent read-only check

Builder OpenAI/Codex, lane ss-infra. Review HEAD against origin/main.
Scope: tests only, three files. Gate 2 resolved separately by merged PR240 /
AUG-1048, included in the base de6dd43; native camera Gate 5 is excluded.
The earlier exhausted parent review concerned Gate 2, now isolated and Done;
this is the newly refined remaining Gate 1/3/4/6 scope, not another Gate 2 retry.

Acceptance:
- Gate 1: `web-real-flow.mjs --pilot-user` uses fresh browser storage, offline
  mode OFF, creates its own unique synthetic local identity and sees Home with
  no Sample Round. It asserts the persisted identity and zero initial contests.
  Signed-out routing is checked before seeding, so offline exports cannot pass.
  This is local persistence proof, not remote authentication proof.
- Gate 3: existing fixed-fixture Jest tests prove Games/Settlement net/gross
  agreement; full browser checks compare persisted modes on both screens.
- Gate 4: added Jest case for 2026-11-12 23:30 PST / 2026-11-13T07:30Z.
  A temporary UTC implementation was rejected (expected 12th, got 13th);
  production source was restored byte for byte before final tests.
- Gate 6: cold document GET of a real newly created contest, status 200, actual
  contest-screen visible, exact route retained, screenshot saved.

Commands from scoresnap:
`TZ=America/Los_Angeles node node_modules/jest/bin/jest.js --runInBand tests/local-date.test.cjs tests/skins-mode.test.cjs` (8/8).
`node --check e2e/web-real-flow.mjs`; `git diff --check`.
The shared node_modules symlink matches the package-lock SHA. No installs.
Export was `bash scripts/local-web-export.sh dist-web-pilot EXPO_PUBLIC_OFFLINE_MODE=false EXPO_PUBLIC_DEMO_MODE=false EXPO_PUBLIC_PRO_ENABLED=true EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_ANON_KEY=`.
Only test/docs changed after export; app source and config are identical.
Browser command under browser-perf lock: serve dist-web-pilot on 8097 then
`BASE_URL=http://127.0.0.1:8097 OUT_DIR=<evidence>/browser node e2e/web-real-flow.mjs --pilot-user`.

Evidence: /workspace/aos-work/lanes/ss-infra/evidence/20261112-70-remaining/.
Full browser rerun FINISHED at exact HEAD 0cce8fa9b10c926f12466a0cf3b7c054c6ca4d9d:
browser.exit=0; browser/results.json has 133 PASS, zero failures/unknowns,
zero page errors. Home screenshot browser/01-home.png and cold route screenshot
browser/04-cold-contest-route.png. Final focused Jest 8/8 at same head.
First run retained at browser-first-failed/: 132 passing checks, one page error
because network containment denied Expo Camera's exact pinned jsQR asset. Final
change adds the same exact asset exception as existing web-matrix, retaining all
backend denial and the strict page-error gate. Do not ignore page errors.

Risk script reports LOW; builder requests HIGH for stronger scrutiny of the
synthetic-session fixture and acceptance semantics. audit=no. No product auth,
copy, workflow or shipping configuration changed. No advisor trigger (test-only
change, 3 files, parent AUG-499 outside top-three).

Please inspect the diff and run the focused Jest checks. Reuse bound browser
evidence; don't launch duplicate exports or the whole browser suite. No writes,
no same-company checker. End with VERDICT: PASS or one
FAILING-CHECK: <check> -- <evidence> line per failing check. At most two rounds;
only named checks will be fixed.
