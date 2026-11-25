# Manual native Join acceptance candidate

This is additive to the existing legacy invite-restore and browser journeys; it replaces no production or test code. Source selectors were checked against QuickScore 18172741104858493917c13aae07209aca8dd948. Recheck on whichever reviewed exact source will be signed. Node-only tests are not native proof.

## Run conditions

- Existing **local disposable** stack at `http://127.0.0.1:54321`: anonymous Auth enabled, test email confirmed on signup, four local SQL predecessor/proposals applied in the ordering already recorded for the invite-journey workflow. No live project links, production endpoint, or copied production state.
- Private mode 0600 `INVITE_STATUS` JSON with the local API URL, ANON_KEY, SERVICE_ROLE_KEY (from the disposable CLI); never upload this input.
- Build the intended source twice for simulator, with offline mode off and only Join sharing enabled vs. disabled. Each app has its original-build `SourceCommit.txt` and `InviteJourneyBuild.json` with the legacy metadata plus `bundle_sha256` for the packaged `main.jsbundle`. Do not manufacture provenance for an existing artifact. The runner compares the actual JS bundle and executable hashes and requires different bundled JS across profiles. Build gate, Apple approval, and app release are separate.
- Three different fresh booted simulators named `e2e-invite-*` (host, guest, flag-off control); no existing SnapScore installation. Run the device sizes required by AUG-1377 separately. Nothing is erased by the runner.
- Put the three scratch source files beside the production harness's existing `contract.mjs`; optional `INVITE_MAESTRO` chooses an approved Maestro executable. Provide a new private output directory path under an existing parent; the script will create it.

Run from scoresnap:

```sh
node --test e2e/invite-journey/native-manual-flow.test.mjs
# When the approved native runner has the exact artifacts, simulator UUIDs, local backend and private status:
INVITE_APP=... INVITE_NEGATIVE_APP=... INVITE_EXPECT_SOURCE=... INVITE_STATUS=... \
INVITE_HOST_UDID=... INVITE_GUEST_UDID=... INVITE_NEGATIVE_UDID=... OUT_DIR=... \
node e2e/invite-journey/native-manual.mjs
```

## Why the first-run route differs from the Home assertion

On this source, a brand-new guest with no session is routed to onboarding/sign-in, not Home. The native journey checks the organizer's flag-on Home Join button, the new guest enters by the first-run **Join a group** UI and types the manual code, and the same guest later uses Home **Join with code** on cold reconnect after the real anonymous identity persists. The negative checks onboarding, sign-in and authenticated Home while the same backend and retained test scores remain healthy. Never count a deep-link launch or separate mock check as equivalent.

The host uses normal sign-in; a synthetic owner identity only is prepared on loopback. Round IDs, two named player IDs, group bindings and invite code are read from the fresh UI-created, UI-enrolled row and owner snapshot. Positive pass requires a pending request, anonymous identity, exact host approval, scoring and cold reconnect on both clients, plus positive and negative artifact provenance. Device runner required to validate exact Maestro selectors and real readbacks. No League, Android, text scaling, layout matrix, or submission verdict is implied.
