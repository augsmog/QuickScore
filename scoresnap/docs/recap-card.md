Recap card preview (local only)

From the repository root:

```sh
cd scoresnap
npm ci
EXPO_OFFLINE=1 npx expo start --web --localhost --port 8081
```

Open http://localhost:8081/dev/recap-card. The development-only route bypasses onboarding and uses a local fixture calculated by the settlement engine. Its example.com link is a placeholder. Production exports intentionally render no preview content, so use the dev server for screenshots.

With the server running, in another terminal from `scoresnap`:

```sh
node e2e/recap-card.mjs
```

Requires Playwright Chromium installed (`npx playwright install chromium` if needed). Writes `/tmp/snapscore-recap-card.png`. The script blocks non-local requests.

The real card appears above Share Results at `/contest/<id>/settlement` for a scored contest. Share Results continues to share text. Generate a live link using the existing Share live scoreboard control below the card; the current link is included in both the card and shared text. Tokens stay in component memory and must be regenerated after leaving the screen; revoked links are removed from the card. Existing server sharing configuration/authentication is required for real live links.

Game summary lines show net payouts from the rounded settlement ledger, not skin counts or front/back Nassau outcomes (the settlement summary does not expose those). Active rounds are labeled provisional. Image export is a TODO because view-shot is not installed; users can screenshot the card.

Validation in the restricted workspace: the recap Jest test passes. Full Jest: 179 passed, 60 failed across 13 suites; failing existing tests report spawnSync EPERM. `npx tsc --noEmit` reports 42 existing errors (including settlement's existing unused gameBreakdowns access and Deno function types); none refer to the new recap files. `git diff --check` passes. Browser rendering could not be verified here: Expo port probing fails under the sandbox, and Chromium exits with Operation not permitted.
