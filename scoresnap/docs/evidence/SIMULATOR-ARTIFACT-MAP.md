# SnapScore simulator artifacts → evidence source / config requirements (AUG-1271)

Doc-only inventory. No build, no device run, no code or config change. Every row cites a file that exists on this branch (base `cba2a58`). Refs: AUG-1265, AUG-412, AUG-400.

## 1. Build artifacts (what produces a `.app`)

| Artifact | Path | Config it needs | Backend / flags | Evidence it can yield |
|---|---|---|---|---|
| EAS `simulator` profile | `scoresnap/eas.json` → `build.simulator` | EAS project + `production` environment; `EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1`, `EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true` | Online. Production env leaves `EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING` off | arm64 sim `.app` URL |
| EAS `simulator-offline` profile | `scoresnap/eas.json` → `build.simulator-offline` | `OFFLINE_MODE=true`, `DEMO_MODE=false`, `CROSS_DEVICE_SHARING=false`, `E2E_COURSE_FIXTURE=true`, `SENTRY_DISABLE_AUTO_UPLOAD=true` | None (local-only) | arm64 sim `.app` URL |
| Source build in CI | `.github/workflows/e2e-ios-sim.yml` ("Build simulator app from source") | `app_url` input empty; macos-15 runner; mirrors the two env sets above via `BUILD_KEY` | Same as profile | `.app` with `SourceCommit.txt` (must equal `GITHUB_SHA`) |
| Contract tests | `scoresnap/tests/eas-simulator-profile.test.cjs`, `simulator-no-mlkit.test.cjs` | none | none | Static proof that profiles keep `ios.simulator`, `internal`, no ML Kit |

Gap: no profile exists with **cross-device sharing ON plus a loopback backend URL**. The league/shared-round journeys require it (see §3).

## 2. Single-simulator Maestro harness (aos-e2e/v1)

| Artifact | Path | Needs | Evidence produced |
|---|---|---|---|
| Config | `.maestro/e2e.config.json` | `appId com.scoresnap.app`, `device iPhone 16`, `builds.{online,offline}`, `fixtures.paid-tier`, `evidenceRoot aos-state/e2e/snapscore`, `blocked`, per-flow `liveWrite`/`skipInAll`/`partial` | n/a |
| Runner | `.maestro/scripts/run-ios-sim.sh` | macOS + Xcode simulators, `python3`, `maestro`; one of `--app-url` / `--app-path`; no credentials | `manifest.json` (build url/sha256/lipo arch, device, runtime, git sha, per-flow status), `flows/<id>/{*.png,maestro.log,junit.xml,hierarchy.json}` |
| Workflow | `.github/workflows/e2e-ios-sim.yml` | Manual dispatch; inputs `app_url`, `build`, `flows` | Artifact `e2e-snapscore-<run-id>`; box fetch via `fetch_gh_e2e.sh` |
| Fixture | `.maestro/fixtures/asyncstorage-paid-tier.json` | Pre-launch AsyncStorage seed | Paid-tier state without purchase bypass |
| Contract test | `scoresnap/tests/e2e-maestro-harness.test.cjs` | plain Node | Config/flow/ticket consistency |

Flows (all in `.maestro/flows/`):

| Build | Flows | Notes |
|---|---|---|
| offline | aug-270, 271, 309, 315, 319, 325, 429-ux-pass | 315 is partial (share sheet only); 325/319/315 use `paid-tier` fixture; 429-ux-pass needs `E2E_COURSE_FIXTURE=true` |
| online | aug-269, 259, 429-tee-confirm | 259 is `skipInAll`: needs a cross-device-enabled build and does a live guest-join write; 429-tee-confirm is `skipInAll` (opens on sign-in gate) |

Config-recorded blocks: AUG-294 and AUG-331 need a signed-in demo/owner account whose credential would be a CI secret (needs Augie's yes).

## 3. Four-simulator journeys (static configs; deviceExecutionInThisSlice=false)

| Artifact | Path | Ticket | Needs to actually execute | Static proof today |
|---|---|---|---|---|
| League journey | `scoresnap/e2e/league/four-sim-league.journey.json` | AUG-1273 | 4 simulators (`sim-1..4`); existing sharing-enabled app (`CROSS_DEVICE_SHARING=true`); disposable loopback backend; fixture stack | `validate-journey.mjs` + `.test.mjs` |
| Shared-round journey | `scoresnap/e2e/league/shared-round.journey.json` | AUG-1274 | Same four identities; `productionWrites:false`, `newBuild:false` | `validate-shared-round.mjs` + `.test.mjs` |
| Fixture stack | `scoresnap/e2e/xdevice/four-identities.mts`, `native-stack.sh` | AUG-412 | `XDEVICE_BACKEND` (scoresnap dir with `supabase/schema-drift/offline-bootstrap.sql` + migrations), `POSTGREST_BIN` (12.2.12), PG17 binaries, `psql`, `openssl`; loopback only (script asserts 127.0.0.1/localhost) | none (needs PG+PostgREST) |
| Staging seed | `scoresnap/e2e/staging/` | n/a | see its README; not simulator evidence | `seed.test.mjs` |

Identities: host (organizer, signed-in), bravo/charlie/delta (anonymous guests). Evidence the journeys assert but nothing yet produces on a simulator: no-roster-before-approval (RLS `42501`), approval mapping, sync, offline, relaunch.

## 4. Web journeys (not simulator, but share the same evidence vocabulary)

`scoresnap/e2e/journeys/` (runner, `journeys.json`, `EVIDENCE.md`, `nightly.sh`) runs against an offline sharing-on web export in Chromium 390×844. It is the only currently *executed* journey evidence; README states it does not prove cross-device join, crash recovery, native accessibility or StoreKit.

## 5. Requirement matrix: what each evidence claim needs

| Evidence claim | Artifact that can prove it | Missing input |
|---|---|---|
| Single-device local flows on arm64 sim | §2 flows + `simulator-offline` build | none (runnable now) |
| Online sign-in/onboarding on sim | §2 online flows + `simulator` build | none for 269; 259/429-tee need sharing build or account |
| Four-identity join/approval/sync/offline/relaunch | §3 journeys | (a) sim build with sharing ON pointed at loopback API, (b) 4 booted simulators + driver that maps `sim-N` to Maestro/devices, (c) loopback stack inputs `XDEVICE_BACKEND`, `POSTGREST_BIN`, PG17 |
| Cross-device (physical) | none; AUG-404 is "needs-device-lab" per config | physical phones (explicitly out of acceptance in §3) |
| Store screenshots | `scoresnap/e2e/store-capture/capture-config.json` (AUG-1279, uncommitted in the main checkout at time of writing, not on this branch) | accepted release-mapped build, 6.9" and 13" sim runtimes |
| Signed-in flows (AUG-294/331) | none | Augie decision on a CI credential |

## 6. Open questions for a build slice (not decided here)

1. Add a `simulator-xdevice` EAS profile, or build from source in CI with sharing ON and an API URL? The existing `simulator` profile inherits the production env, which has sharing off.
2. Four simulators on one macOS host (box Mac mini) vs GitHub-hosted runners: the runner script boots one simulator today.
3. Who owns the driver that turns `steps[].actions` in the journey JSON into Maestro flows? Nothing consumes those JSON files beyond the validators.
