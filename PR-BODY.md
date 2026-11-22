## Release-bound screen coverage gate for SnapScore

Refs AUG-1373, AUG-496. Native-execution half split to AUG-1376.

**Problem (Issue 6 of the AUG-1367/1368/1369 cluster).** Layout regressions landed on
SnapScore screens with no per-PR gate forcing native visual acceptance per screen, and no
authoritative registry of which screens have native coverage. Browser geometry checks exist
but are not native proof.

**This PR (code half — fully on-box verifiable).** A per-PR coverage gate that keeps a
release-bound route/state coverage manifest in sync with `scoresnap/app/**`, so native visual
coverage can never silently regress — "missing coverage fails acceptance":

- `scoresnap/e2e/screen-coverage/coverage-manifest.json` — registers all 23 visual screens
  (currently `pending` native coverage, tracked by **AUG-1376**) and 6 non-visual exemptions.
- `scoresnap/scripts/check-screen-coverage.mjs` — validator: fails if a route file is
  unregistered, an entry is stale, or a `covered` claim lacks real flow/screenshot/device/
  assertion evidence (flow ids checked against `.maestro/e2e.config.json`).
- `scoresnap/scripts/check-screen-coverage.test.mjs` — 15 `node:test` cases.
- `.github/workflows/screen-coverage-gate.yml` — fast ubuntu per-PR gate on app/manifest paths.
- `npm run coverage:screens` / `npm run test:screen-coverage`.

**Split out to AUG-1376 (needs macOS CI, not buildable on the Linux box lanes):** the native
screenshot + geometry-assertion execution at 393×852 (iPhone 15 Pro) and 402×874
(iPhone 16 Pro); it flips manifest screens from `pending` to `covered`.

**Not in scope / owner-admin:** marking this check *required* in branch protection is a repo
settings change (owner/admin), not a lane action.

### Evidence
- `node scripts/check-screen-coverage.mjs` → exit 0, 29 route files registered (0 covered, 23 pending, 6 exempt).
- `node --test scripts/check-screen-coverage.test.mjs` → 15/15 pass.
- Negative integration: an unregistered `app/*.tsx` → exit 1 with a clear error.

```aos-closeout
{
  "schema": "aos-closeout/1",
  "project": "SnapScore",
  "ticket": "AUG-1373",
  "owner": "cross-product E2E system /workspace/aos-state/e2e/",
  "kind": "code",
  "status": "pr-open",
  "evidence": {
    "pr": "PR_URL_PLACEHOLDER",
    "head_sha": "5108034e9daba15847d5f7c6f8460672c47533f5",
    "tests": "node --test scripts/check-screen-coverage.test.mjs (15/15); node scripts/check-screen-coverage.mjs (exit 0)",
    "ci": "pending"
  },
  "verifier": {
    "independent": true,
    "company": "openai",
    "model": "gpt-6-astra",
    "tier": "high",
    "status": "pending",
    "head_sha": "5108034e9daba15847d5f7c6f8460672c47533f5"
  },
  "roles": {
    "builder": "anthropic/claude-code",
    "checker": "openai/codex-high",
    "advisor": null,
    "researcher": null
  },
  "advisor": { "calls": [] },
  "skills": []
}
```
