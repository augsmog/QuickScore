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
