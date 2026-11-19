# Web real-app check (Playwright)

Drives the offline exported Expo app and saves 390×844 screenshots plus `results.json`.

From the repository root:

```bash
cd scoresnap
npm ci
npm test -- --runInBand
EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web
npx playwright install chromium
node e2e/serve.mjs  # keep running in a separate terminal; stop it after testing
```

In a second terminal, from the repository root:

```bash
BASE_URL=http://127.0.0.1:8089 OUT_DIR=scoresnap/e2e/screens node scoresnap/e2e/web-real-flow.mjs
```

Flow: Home without implicit demo → create contest (Augie, Sam, Lee, Pat;
Stroke Play + Skins + Nassau) → empty-text validation → paste 18-hole scorecard
(Sam's all-4s row regression) → review → import → four-player leaderboard →
scorecard → calculated Skins/Nassau results → settlement with all four player rows
fully reachable → missing/malformed/empty review-data errors.

Any failed check, uncaught page error, or thrown browser action exits nonzero.
CI runs the same flow in `.github/workflows/web-smoke.yml` and uploads screenshots.
Demo data is a separate opt-in: `EXPO_PUBLIC_DEMO_MODE=true`; offline mode alone
never enables it. Skins scoring rules are unchanged pending the owner's decision.

## Web matrix (local and CI)

Build and serve as above, then from `scoresnap/`:

```sh
npm run e2e:matrix
# Inventory without a browser:
node e2e/web-matrix.mjs --list
# Rerun one failed case, preserving the full report:
OUT_DIR=e2e/screens/matrix/rerun npm run e2e:matrix -- --only=foursome-best-ball-18-manual
```

24 isolated-browser flows: 2-player Match Play / Skins, 4-player Skins + Nassau / team Best Ball, 8-player Skins / team Best Ball; each with manual/paste entry and 9/18 played holes. Stroke Play is retained in every bundle. Nine played holes means a partial 18-hole round, not a true nine-hole course (creation currently defaults to 18). Zero handicaps keep the score and payout comparisons straightforward. Best Ball assigns equal teams through the UI. Screenshots (390×844 leaderboard/settlement, or failure state) and a timed `results.json` go to ignored `e2e/screens/matrix/`. `BASE_URL` and `OUT_DIR` can override defaults. External service requests are blocked; Expo Camera's public static jsQR worker is allowed (no camera capture or live OCR). The runner continues after individual failures and exits nonzero on any failure, including launch errors.

Assertions cover persisted scores, per-player leaderboard totals and holes played, rendered settlement amounts, zero-sum integer cents, nonzero payouts, transaction reconciliation, session total, and uncaught page errors. Settlement amounts are compared to the production engine in process; engine rule correctness still depends on independent calculator tests. No OCR or backend coverage is claimed. CI runs the matrix after Browser smoke against the same served build with `--retries=1` (one retry per failed flow), and uploads matrix screenshots and results in the web smoke artifact. Retry attempts remain in `results.json`; failure screenshots include the attempt number.

## Additive GS-16 usability gate

See [the usability test plan](../docs/usability-test-plan.md) for the route matrix, shared UH contract, gate, coverage gaps and ordered adapter queue. GS-13 commands and outcome assertions above remain required on the same build/revision.
