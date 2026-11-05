# M4a frozen v1 wiring receipts — Oct 29 PM

Source contracts copied byte-for-byte from M4b head
`e99d684b3154a7aee3f7298d305bff093c5e37b5`, introduced at
`261103c49244a936017d150379dc8667b365af37`. No M4b merge or SQL import.

SHA256:
- sync-contract-v1.md: f5ed813d326a1d1697d4c38a69e3ab76d8be2eee0dffc927e34ccbda5aa3703f
- sync-contract-v1.ts: 6f498425d6455bfbd33ffc02d6207150fb40aa4931f0fe7941454a3cb1f76a85

Commands run in scoresnap, logs retained beside this file:

- `npm test -- --runInBand`: 26 suites / 390 tests PASS.
- `node --test e2e/usability-gate.test.mjs`: 9/9 PASS.
- `npx tsc --noEmit`: FAIL, 42 baseline diagnostics; none in changed modules.
- For each flag false/true: `EXPO_PUBLIC_OFFLINE_MODE=true EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=<flag> npx expo export --platform web --output-dir <local-output> --clear`.
- Serve exports with `WEB_ROOT=<local-output> PORT=<18149/18150> node e2e/serve.mjs`.
- `EXPECT_CROSS_DEVICE_SHARING=<flag> BASE_URL=http://127.0.0.1:<port> OUT_DIR=<local-screens> node e2e/web-real-flow.mjs` and matching `e2e/join-gate.mjs`.
- `BASE_URL=http://127.0.0.1:18149 node e2e/live-share.mjs`: six printed checks PASS.
- Flag-off real flow: 92/92 PASS; matching join gate PASS.
- Flag-on real flow: 96/96 PASS; matching join gate PASS.

These browser flows use OFFLINE_MODE and local fixtures. They prove flag
compatibility, not the new UI against actual Auth/PostgREST/Realtime. New v1
behavior is covered with injected RPC/channel fixtures in Jest: own approved
membership discovery, pending privacy, revocation, pause, identity races,
subscription acknowledgement/cleanup, revision-only payloads, asymmetric rounds,
clear tombstone CAS, offline authorized-view retention and late snapshot ordering.
Native persistence, actual socket delivery/revocation, four real identities and
final-stack/native acceptance remain unrun. Sharing remains default OFF.

Red receipts: fresh snapshot version initially lost to old receipt (1 vs 9),
late older snapshot overwrite (8 vs 9), absent CAS builder, and transport outage
clearing authorized view. Each regression test now passes in the full suite.
Initial command working-directory errors and fixture adjustments were corrected;
failed/intermediate checks are not counted as green. Exports/screenshots are
local temporary artifacts; only text receipts are committed.

Text logs have trailing whitespace stripped for repository whitespace checks.
