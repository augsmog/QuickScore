# M4a client draft — default flag OFF

Base: `8c0a40aee04be34c1ab17075c404159656fa868b` (current main at clone).
Read M1 #23, M2 #24, M2b #25, CAPTCHA #26, M3 #36/#41,
M2-FOUNDATION.md and the canonical plan mirrored as plan-rev4.md.
No SQL, live project configuration, build submission or live data changed.

## Implemented

- Flag-on session restore/listener derives anonymous status/provider from the actual
  Supabase user. Local skip has no remote identity. Hydration does not count as
  remote initialization. Cold real guests bypass the organizer auth/onboarding
  loop; existing new-contest anonymous-host refusal remains in place.
- Copy-on-write SecureStore chunks, legacy secure-key migration, read-back checks,
  propagated failures. Profile-only Zustand persistence; no refresh-token fields.
  Native AppState starts/stops refresh and rereads before restore.
- Actor-scoped durable score envelopes in SQLite on native, AsyncStorage on web.
  Browser Web Locks serialize tabs. Payloads materialize and commit before send;
  lost responses retry identical IDs/arguments. Receipts commit before successors
  materialize. Conflicts/denials pause same-cell successors. Explicit confirmed
  resolution cancels dependent drafts and creates a fresh operation for “Use mine”.
  Corruption/storage errors surface. Existing unscoped legacy queued operations
  block migration for identity review and remain untouched.
- Frozen RPC calls for generic pending join, host decisions, known-contest rejoin,
  authorized snapshots and host restore without requiring a host membership row.
  Remote store clears on denial/identity change; late responses cannot repair a
  different identity. Online sync panel exposes requests, queue states and conflicts.
- Foreground 30-second polling, revision-only hint handler, transport retry backoff,
  browser online listener, AppState cleanup. No raw table score/event subscriptions.
- New lane and repaired storage/routing behind the existing default-OFF feature
  flag. Offline flag-on retains the existing local demonstration join path.
  Sentry capture is disabled for the online feature lane pending M6 privacy proof.

## NOT M4a exit / M4b integration blockers

1. `request_join` returns only pending; `my_membership` requires a known contest UUID.
   There is no authorized own-membership discovery/status contract. A new phone
   can request approval but cannot discover its approved contest from its code.
   Do not return roster/contest data from the pending code endpoint to fix this.
2. `tournament_snapshot` contains scores/revision but no per-cell versions, server
   capability, course metadata or round identity mappings. The tournament adapter
   conservatively starts unknown cells at version zero; existing remote cells
   conflict rather than being overwritten. It cannot seed current CAS versions.
3. The private revision channel/topic, subscription authorization and capability
   RPC are not frozen in M2/M3. Hint handling exists, but no private Realtime
   subscription is wired. Polling does not prove realtime convergence, revocation
   sockets or the build-flag AND server-capability enablement handshake.
4. New standalone remote enrollment/scorecard projection and complete guest scoring
   after approval are not delivered by the available interfaces. Authorized remote
   snapshots live in the separate online store; the legacy local scorecard is not
   relabeled as a synchronized scorecard. Host approval requires server IDs from
   an authorized snapshot. Local fallback codes are not cloud invite codes.
5. Native force-quit/Keychain/SQLite/device restore, real Auth/CAPTCHA and four-user
   final-stack replay were not run. Unit storage tests use injected storage. No
   local database was needed for this client-only change. No live project used.
6. ID-map bundle writes still need integrated concurrent metadata-update coverage;
   actor/event scoping prevents cross-event reuse, but overlapping bundle updates
   are not a claimed distributed merge protocol. Legacy queue migration needs
   explicit actor validation before replay.

Estimate: **10–16 additional working hours to M4a exit after M4b supplies the
missing contracts/local stack**, including guest discovery/scoring wiring,
capability/channel integration, native persistence proof and verifier/fix cycle.
This is not a release ETA; the downstream serial M4b gates remain required.

## Validation and rollback

Local receipts (2026-10-29): Jest 25 suites / 382 tests pass; usability-gate
9/9 pass; default-off web-real-flow 92/92; clean flag-on offline web-real-flow
96/96; both join gates and live-share smoke pass. Web exports pass. TypeScript
fails with 42 diagnostics, exactly matching a git-archive copy of the base after
normalizing absolute node_modules paths; no diagnostic in new modules.
An initial flag-on export without --clear reused flag-off Metro cache and failed
91/92 plus its join gate; clean export/rerun is the reported green result.
See the external build report for exact commands and PR/head SHA.
Regression tests execute the base auth-store and base SecureStore adapter with
new assertions: anonymous restore and swallowed storage failure both fail there.
Current tests cover immutable replay, successor dependencies, conflicts, storage
failure, denied requests, round isolation, rejoin, identity-switch response races,
foreground lifecycle and revision hints. Existing browser tests run offline and
are not backend multi-device evidence.

ROLLBACK: revert the merge commit; keep
`EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=false`. No migration rollback is needed.
Retain SQLite/AsyncStorage draft envelopes; never erase accepted remote scores or
unsent drafts as part of rollback. Do not change the CAPTCHA config as part of this
client rollback. Keep draft until independent verifier and integration gates pass.

## Frozen v1 wiring (Oct 29 PM)

Copied only `sync-contract-v1.ts` and its companion Markdown from M4b source
`e99d684b3154a7aee3f7298d305bff093c5e37b5` (PR #50); no merge, SQL, workflow or
server implementation imported. Contract introduction commit:
`261103c49244a936017d150379dc8667b365af37`.

Foreground discovery calls `my_sync_status()` without a locator. Approved
memberships fetch capabilities and `fetch_snapshot`; pending/rejected requests
never fetch rosters. Revoked/missing memberships clear current views. Identity
epochs discard late responses. Host repair retains the host-only request check.
The app-wide restore loop also uses v1; snapshots/revisions commit together and
late older responses cannot replace a newer scorecard.

The join screen shows approved online scorecards, explicit round/player IDs,
assignment/course metadata and per-cell CAS versions, including clear tombstones.
Per-round course gaps display repair text; no pars are invented. Local mappings
from the authorized snapshot seed host ID lookup. Guest edits target the assigned
player; server authorization remains authoritative. Conflict/denial/queue state
and explicit conflict choices are shown separately from authoritative scores.
Unsent drafts are durable before replay, including when transport is offline.
Already-materialized requests stay immutable; fresh edits use the newer of the
snapshot version and a durable receipt version.

Private revision subscriptions use the exact server topic and private config,
authenticate the socket with the current session, and fetch on subscribe/reconnect
ack. Only an integer revision payload is accepted; hints cannot mutate scores.
Foreground polling remains a 30-second fallback. Background/unmount/identity
cleanup removes subscriptions. Every write transmission rechecks the build flag
and server enabled/supported v1 handshake; pause retains outbox drafts.

These are client wiring and local/offline receipts. Real Auth issuance, HTTP
cache headers, PostgREST, socket revocation/reconnect delivery, four-user CAS,
native force-quit/SecureStore/SQLite recovery and enrollment/import still require
an integrated disposable stack and native devices. Sharing stays default OFF.
