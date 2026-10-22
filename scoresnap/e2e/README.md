# Web real-app check (Playwright)

Drives the real exported web build — not a mockup — and saves screenshots plus `results.json`.

```bash
cd scoresnap
EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web
npx serve -s dist-web -l 8089            # any static server with SPA fallback
# playwright is not a project dependency; run from a folder where it is installed:
#   npm i playwright && npx playwright install chromium
BASE_URL=http://localhost:8089 OUT_DIR=e2e/screens node e2e/web-real-flow.mjs
```

Flow covered: home → create contest (Augie, Sam; Stroke Play + Skins + Nassau) → Scan screen
"Enter scorecard as text" (Sam's row is all 4s) → review of parser output → confirm → leaderboard,
scorecard, games, settlement → GS-1 checks (review with missing/malformed/empty scan data shows an
error, never sample players).

`screens/` holds the screenshots from the run on 2026-10-21 (15/15 checks passed).
