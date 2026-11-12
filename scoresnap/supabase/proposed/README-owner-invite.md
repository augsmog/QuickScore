# AUG-331: restored-owner invite safety (offline proposal)

## Status and owner gate

The client guard is independently useful with the old server: a restored round
never invents, displays or shares a cached local code, and cannot be re-enrolled
as a new empty round. It does **not** recover a valid invite until the server
extension below is approved, applied and verified. This is not added to Build 28.

`20261101190000_owner_invite_snapshot.sql` is **proposal-only**, deliberately
outside `migrations/` and the active migration ledger. No live database was read
or changed for this work. Applying it, changing the deployed contract, including
it in a release, and live/device verification need the applicable owner's gates.
Do not infer deployment from the earlier owner-discovery/game-settings proposals.

## Contract and provenance

- Keep `fetch_snapshot(uuid,bigint)` and every existing field unchanged. Add
  `invite_code` only when `c.owner_id = auth.uid()` and the session is not anonymous.
  Even an approved membership with role `host` is not sufficient. Nonowners do not
  receive the key. Missing/unauthorized contests still receive the existing denial.
- The definition is copied from the game-settings predecessor
  `20261031230000_restore_game_settings.sql`, not the older baseline snapshot.
  Its contest lock, revision checks, `SECURITY DEFINER`, fixed `search_path` and
  grants are unchanged. The paired file in `rollbacks/` restores that exact body.
- Client wire field is optional. Old clients ignore it; new clients on an older
  server keep restored invites unavailable. No public discovery/member response,
  direct-table RLS policy, credential, enrollment or score-write permission changes.
- The stored value must already satisfy the existing six-character join alphabet.
  The client does not trim/uppercase malformed database values: `request_join`
  normalizes user input but compares against the stored code literally.
- Initial and subsequent owner repairs replace/clear persisted restored codes.
  A lower-revision response rejected by the memory store cannot overwrite that
  persisted repair. The persisted value itself is never authorization after reload.
- Display requires the matching current approved host view after checking the
  current actor/contest. Share re-proves owner access and reads the accepted fresh
  snapshot, checking actor, component lifetime and response identity before the
  clipboard/native share call. Concurrent clicks share no stale fallback. New
  accepted Online sync recovery clears the previous failure state.
- Paused/completed snapshots remain readable but their invites are unavailable.
  Ordinary newly created/local/offline rounds keep existing generation and
  enrollment; guest request/join flow is unchanged.

## Validation and remaining boundaries

Run from `scoresnap/`:

```
npm ci --ignore-scripts --no-audit --no-fund
node node_modules/jest/bin/jest.js --runInBand --testPathIgnorePatterns=android-permissions.test.cjs
node node_modules/typescript/bin/tsc --noEmit
```

The aggregate command excludes the unrelated Android prebuild source-generation
suite; it does not build a native binary or contact a live backend.

The new suites execute production selectors/restoration/enrollment/repair and real
React 19 component hooks; native UI, clipboard, Auth and RPC are explicit mocks.
They cover absent/invalid codes, canonical legacy alphabet examples, reload,
existing wrong cache, denied/member/foreign/paused views, out-of-order repairs,
rotation observed by a fresh share, network failure, repeated taps, identity
change, unmount, external retry, and unchanged local generation/guest tests.
The SQL source regression checks exact predecessor preservation and rollback.
A disposable PostgreSQL-compatible execution is separate evidence, not live proof.

### Required PostgreSQL 17 rehearsal receipt

Generic green schema/API/browser checks do not establish that this proposal ran.
The existing `m4b-local.sh` native PG17 launcher and `verify-foundation-ci.sh`
local Supabase database lane now call `owner-invite-rehearsal.sh`. No additional
job, permission, service, active migration or manual dispatch is introduced.
The caller must have just created/reset its disposable cluster and supply the
explicit `SNAPSCORE_DISPOSABLE_TEST=1` opt-in. **Loopback alone is not disposal
proof:** a forwarded live database must never be used, even with that flag.

Before persistent writes the runner rejects unsupported destinations and libpq
overrides, starts psql without rc/password/service files in a clean environment,
verifies the actual PG17 endpoint, and requires the pristine active-chain function
bodies/security/ACLs with no pre-existing game-settings columns. It applies the
exact game-settings prerequisite, then the unchanged owner-invite forward SQL,
exact predecessor rollback, reapply and rollback again. Each phase seeds and
rolls back its own fixture transaction; migration BEGIN/COMMIT blocks never commit
the fixtures. The final prerequisite rollback must restore both original routine
definitions/owners/ACLs/configuration, the existing normalized logical catalog,
and every migration-ledger row/column. Physical OIDs/dropped-column tombstones
are deliberately not claimed identical. Failed runs remain nonzero and require
the owning launcher to discard the disposable cluster; cleanup does not attempt
to repair an unknown database or convert a failed rehearsal to success.

Receipt lines prefixed `PASS: AUG331` establish owner/nonowner/anonymous access,
unchanged nested snapshot fields, exact RPC privileges, invalid revisions,
paused/completed reads, and returned-code → `request_join` → correct fixture
contest (not merely generic pending). Named privacy and wrong-predecessor mutants
must be rejected specifically. Require the forward, exact predecessor rollback,
reapply, prerequisite rollback, unchanged ledger and final PG17 receipt lines
from **both jobs on the reviewed head** before calling this prerequisite passed.
Execution against the full Supabase database still does not, by itself, exercise
real HTTP/JWT validation, PostgREST schema reload timing, Realtime, native sharing,
or physical devices. Those remain separate acceptance gates.

A server administrator can still rotate a code immediately after a successful
snapshot response. There is no atomic read-and-share operation, and arbitrary
out-of-band code edits do not necessarily increment `sync_revision`. Share-time
fetch narrows but cannot eliminate that race. This proposal adds no rotation API;
any supported future rotation must define revision/notification semantics.

Before claiming full recovery: review exact deployed predecessor and privileges,
explicitly approve this additive contract/migration, rehearse forward/rollback on
a disposable full Supabase/PG17 stack, apply only with live authorization, then
verify a fresh owner device displays and shares the server code and a separate
signed-in guest can request that same round. Verify owner/member/anonymous denial,
failed retry, reload, paused/completed behavior and the intended release identity.
