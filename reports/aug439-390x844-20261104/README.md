# AUG-439 local invite journey evidence

- Candidate head: `21bde3b9fe241e6b604849e057b965e0023aeefa`
- Built artifact: local Expo web export from that exact source head, with `EXPO_PUBLIC_OFFLINE_MODE=true`, `EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=true`, and `EXPO_PUBLIC_DEMO_MODE=false`.
- Viewport: 390×844 (temporary test-only profile based on the iPhone 15 Pro safe-area insets).
- Command: `JOURNEYS=J-invite-from-round DEVICE_PROFILE=iphone-390x844-check GIT_SHA=21bde3b9fe241e6b604849e057b965e0023aeefa OUT_DIR=/tmp/ss439-41789689699/local-390x844-sharing BASE_URL=http://127.0.0.1:8089 node e2e/journeys/runner.mjs`
- Result: PASS 1/1; invite visible, one activation, copied local invite outcome verified.
- Hosted exact-head evidence: https://github.com/augsmog/QuickScore/actions/runs/41789689699
