# M2 sync foundation (stacked on M1)

Applied live with Augie approval on 2026-10-27 at approximately 02:20 MST,
followed by M2b. This local snapshot refresh used no network or live database.
The migration does not enable Auth or enroll clients. Delivery remains staged:
rounds plus rewritten-008 tournaments first; leagues M9, extras M10. Initial
claims and new-phone recovery use host approval; no slot PIN or name takeover.
Live anonymous sign-ins were DISABLED in the read-only 21:11 capture. Nothing
here enables them, even locally; SQL tests simulate verified JWT claims. Live
Auth enablement remains a separate Augie decision.

## Migration and security boundary

`20261027120000_sync_foundation.sql` follows seven ledger markers and the M1
baseline. Existing invite_code is NOT NULL/UNIQUE; its constraint is reused.
A new default allocator uses pgcrypto's six random bytes, maps each byte to the
exact 32-symbol alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` without modulo bias,
locks each candidate for the transaction, and retries occupied candidates up to
32 times. Explicit legacy codes remain accepted for compatibility. There is no
public code rotation/enrollment endpoint in M2. M4b enrollment must allocate a
fresh code and import legacy scores under the contest lock.

Postgres public-schema default table/sequence/function grants to anon and
authenticated are revoked; service_role defaults remain deliberate. PostgreSQL's
built-in PUBLIC function EXECUTE default is global, so its removal also requires
a global default revoke (a schema-only revoke cannot subtract it). Existing
function EXECUTE grants remain unchanged. No other creator role's defaults are
silently changed. Three new tables have enabled and forced RLS, no client grants
or policies; service_role retains explicit ALL and its managed BYPASSRLS role.
All new functions use SECURITY DEFINER, search_path=pg_catalog, qualified objects
and explicit execute ACLs. The candidate helper/allocator/trigger have no client EXECUTE;
legacy_contest_open(uuid) is an authenticated-only policy predicate.

Legacy contests/players/events retain the DML grants the shipped app needs.
TRUNCATE, REFERENCES and TRIGGER are safely revoked on these three tables:
there are no shipped client DDL callers, and TRUNCATE bypasses RLS. Event
UPDATE/DELETE grants are revoked too: the baseline already has no client policies
allowing those operations, and score events are append-only. Restrictive
policies AND with the original permissive policies: protocol 0 continues to
work; protocol 1 denies raw access and legacy mutation. Clients cannot set
protocol/sync_enabled/revision to enroll themselves. The legacy membership
helper returns false for protocol 1; new memberships never depend on legacy
user_id. Transfer revokes the previous identity's membership, clears all of its
legacy bindings in that contest, then assigns the stable slot in one transaction.
The decided join request records approver, target and decision time.

A trigger blocks old publish snapshot writes to protocol-1 contests under a
contest row lock. Watch/get/chat/moderation bodies and signatures are untouched.
Protocol-0 owner publish/update plus watch-holder read/chat are exercised with
real SQL roles. This SQL gate does not replace the required unchanged old-binary
run against the full disposable stack before any production apply.

Seven mutable legacy paths are fixed with `pg_catalog, public`: calculate_retention,
get_dau, get_mau, handle_new_user, handle_updated_at, increment_daily_revenue,
increment_daily_signups. Their relations are already public/auth qualified;
their remaining calls/operators are catalog builtins, with the one unqualified
ON CONFLICT daily_metrics reference bound to its qualified INSERT target. No
extension or caller-schema lookup is needed. Bodies, ACLs and results are retained.

## Frozen RPC contracts

Argument names are part of the PostgREST contract. All return jsonb; all require
role authenticated and actor auth.uid(). They never accept an actor parameter.

```sql
request_join(code text, display_name text) RETURNS jsonb
list_join_requests(contest_id uuid) RETURNS jsonb
decide_join_request(request_id uuid, approve boolean, player_id uuid) RETURNS jsonb
my_membership(contest_id uuid) RETURNS jsonb
write_score(contest_id uuid, round_id uuid, player_id uuid, hole integer,
            action text, strokes integer, expected_version bigint,
            op_id uuid, request_hash text) RETURNS jsonb
```

- request_join: always `{"status":"pending"}` for well-formed known/unknown,
  disabled or ineligible codes. No contest ID, request ID, roster or score is
  returned. Duplicate pending requests are coalesced. Name is trimmed, 1–80 chars.
- list_join_requests: host owner only, non-anonymous; JSON array of request records.
  Pending users cannot call it, even for their own request.
- decide_join_request: host owner only, non-anonymous, active/enabled protocol 1.
  Contest lock precedes request lock and every permission/state check. Approval
  validates player belongs to contest and transfers an occupied slot after a new
  identity has requested approval. Reapproving an already approved identity is
  rejected, never silently giving it a second slot. Reject accepts NULL player_id.
  Result is `{"status":"approved"}` or `{"status":"rejected"}`.
- my_membership: own membership only (`role`, `status`, `player_id`), or SQL NULL
  if none. A pending join request has no membership yet; request_join's generic
  status is its public acknowledgment. Revoked status conveys no event data.
- write_score: validates under contest lock, then serializes actor/op receipt
  (including absent receipts), then locks latest cell event. Host non-anonymous
  may write any contest player; approved player only its own slot. Scorer/viewer
  writes are denied until M3/M4b supplies assignments. M2 accepts NULL round_id
  only; non-NULL is explicitly rejected rather than trusting a foreign UUID.
  No rounds/groups/assignments are created here. M3/M4b must replace this body
  while preserving the exact interface and adding round validation, group scope,
  submission invalidation, projections, snapshots and revision notifications.

Accepted result: `{"status":"accepted","version":1,"strokes":4,"revision":1}`.
Conflict result: `{"status":"conflict","version":1,"strokes":4,"revision":1}`.
Cell version starts at zero; each accepted set/clear increments both cell and
contest revisions. Clear appends a NULL-strokes tombstone; set requires 1–15.
No LWW and no version chosen by timestamps. Legacy events have NULL versions;
M2 does not import their arrays/events into versioned state. Enrollment/import is
therefore intentionally unavailable to clients until the integration migration.
The event log is authoritative; M2 does not update old player score arrays.

Both accepted and conflict responses are receipted. Same op/payload returns the
original receipt; changed payload/hash with the same op raises OP_REUSED.
request_hash is a bounded immutable caller label; the server stores SHA256 of
canonical jsonb array `[contest,round,player,hole,action,strokes,expected_version,
request_hash]`, binding the entire request even if the caller reuses its label.
Receipt actor/op is globally unique across contests. Permission and feature-state
checks precede receipt replay, including for revoked identities.

| SQLSTATE | Message | Meaning |
| --- | --- | --- |
| 42501 | AUTH_REQUIRED / HOST_REQUIRED / FORBIDDEN | Missing identity or insufficient current permission |
| 22023 | INVALID_REQUEST / INVALID_PLAYER / HOST_SLOT | Invalid join/decision input |
| 22023 | INVALID_SCORE / ROUND_NOT_READY / OP_REUSED | Invalid score, unavailable round schema, changed immutable operation |
| 23505 | ALREADY_APPROVED | Identity already has approved membership; unique active claim index also rejects duplicates |
| 55000 | SYNC_PAUSED / LEGACY_PROTOCOL | Disabled/inactive protocol or blocked legacy mutation |
| P0001 | CODE_EXHAUSTED | 32 allocation collisions exhausted |
| P0001 | M2_DOWN_UNSAFE | Rollback would discard enrolled/protocol data |

## Staged debt and owners

The exact baseline inventory stays in BASELINE-NOTES.md and baseline.json. No broad
legacy grant or SECURITY DEFINER entry point is silently declared safe.

| Inventory retained | Owner / exit milestone |
| --- | --- |
| Legacy direct DML grants and protocol-0 self-join/member-wide score inserts | SQL/API lane M4b; preserve old local/flags-off behavior, enforce enrollment/import gates and final matrix |
| Existing analytics/profile/marketing/settlement table/view broad ACLs; golfcore sequence ACLs; six owner-permission views | Security lane M6, with app-owner review before any grant removal |
| Legacy PUBLIC EXECUTE on calculate_retention/get_dau/get_mau/handle_new_user/handle_updated_at/increment_daily_revenue/increment_daily_signups/rls_auto_enable | Security lane M6; inventory existing callers before narrowing |
| public path in reserve_golfcore_call/reconcile_golfcore_usage | Security lane M6; unrelated extension/caller behavior requires regression fixtures |
| Existing RLS force flags and RPC-only tables without policies | SQL/API M4b for sync surfaces; security M6 for unrelated tables |
| Legacy share-link token format, spectator game units, missing viewer sessions/expiry enhancements | Privacy/SQL lane M5–M6; `games: []` sanitizer change explicitly deferred to M5 |
| Join/write rate budgets, shared failed-code lookup budget, CAPTCHA, Auth/session durability and real four-device tests | M0/M4b/M6; live anonymous Auth remains off until Augie's yes |
| Round/group relationship validation, scorer assignment, enrollment/import, snapshots, submission invalidation, finalization, notification/revocation sockets | M3 then M4b final integration; no M2 race-proof claim |
| Existing legacy publish/chat/share-lock ordering | SQL/API M4b must reconcile with contest-first integration; old bodies retained, publish guard added |

M2 tests simulate JWTs using actual database roles, not real Auth-issued sessions.
Pending/outsider/revoked/anonymous-host denials, approved-player/host success,
claim uniqueness/transfer, and legacy RPC compatibility are covered. No M2
assignment/scorer authorization is implied; it is explicitly denied.

## Verification and drift

`schema-snapshot/live.json` is the normalized post-M3 capture and matches
`expected-m3.json`; baseline.json preserves the pre-M2 schema. expected-after.json
is the M2b catalog. The separately checked local ledger contains seven historical markers + `20261027000000 live_baseline` +
`20261027120000 sync_foundation` + `20261027130000 guest_write_guard` (ten ledger
rows); the live ledger adds `20261028162155 tournament_rounds_live` as the eleventh row. Normalization removes ledger rows from expected-after.json. CI starts CLI 2.122.0 with ghcr.io, resets the full chain, and applies hosted
platform emulation as supabase_admin. It rolls down M2b and requires the guest-contest red result, runs the unsafe
rollback race red, restores/reapplies M2 and runs the guarded race green, then
rolls down the unused foundation,
compares baseline to baseline.json (eight local ledger entries), requires the default
fixture to fail on baseline, and runs M1 selftest and SQL mutation/preapply
rejection fixtures with --url/--admin-url (four reserved-role mutations run
only in offline PG17 because of supautils). It reapplies both M2 and M2b with CLI
migration up, compares expected-after and ten local ledger entries, then runs the
M2 role/ACL/default/future/join/CAS/legacy gates and M2b guest-write guard and
mutation gates before ledger-adoption rehearsal. Live preapply now requires the exact ordered eleven-row applied ledger ending in `20261028162155 tournament_rounds_live`;
local mode expects the ten-row M2b prefix. Active SQL names, SHA256 and git tracking are checked.
Rehearsal asserts exactly baseline, M2 and M2b pending in that order before
repair: `20261027000000_live_baseline.sql`, `20261027120000_sync_foundation.sql`,
`20261027130000_guest_write_guard.sql`. It repairs only baseline, then asserts
exactly M2 and M2b remain pending in that order; physical schema still matches
baseline.json and the ledger matches the eight-row baseline prefix.

Normalization now compares **visible ordinal column order**, compressing gaps
left by PostgreSQL DROP COLUMN. It still detects additions/removals/reordering;
physical attnum gaps alone do not make a safe down/reapply differ forever.
The historical pre-apply snapshot is now preserved as baseline.json; live.json
contains the post-M3 schema and matches expected-m3.json. M3 was applied on 2026-10-28.

Offline command (no server, sockets, Docker or network):

```sh
bash scoresnap/supabase/schema-drift/verify-offline.sh
```

Includes M1 catalog/ledger/mutation checks and verify-foundation.py, using PG17
single-user mode and stub auth functions reading request.jwt.claims. Tests use
SET LOCAL ROLE and claims for four UUID identities. Collision tests replace the private candidate helper transactionally, prove
collision retry/exhaustion without altering extension functions, then roll back
the replacement. Expected snapshots are generated only by an explicit
`verify-foundation.py --record`, never automatically by CI. Single-user mode
does not fire event triggers or enforce raw RLS row filtering; pinned-stack CI additionally proves ensure_rls.

Local results are recorded in the linked receipt. Full Supabase/Auth/PostgREST,
unchanged old binary, web/Jest and tournament Docker workflows require CI;
final two-session both-order races against rewritten 008 remain M4b.

## Rollback and live sequence

Down is `rollback/20261027120000_sync_foundation.down.sql`. Back up first. It
refuses if any contest is enrolled/enabled/revised or any membership/request/
receipt/versioned event exists. It never deletes accepted protocol data to make
a down pass. On an unused foundation it restores exact baseline function body,
search paths, ACL/default ACLs, constraints and visible catalog. Apply down in a
transaction; only after success repair the foundation ledger to reverted, on the
same intended target. Reapply via the normal migration workflow. Tests exercise
both down and reapply on disposable databases.

M2 and M2b were applied live with Augie approval on 2026-10-27 at approximately
02:20 MST. That post-apply capture matches expected-after.json and the
ten-row M2b ledger. M3 (`20261028162155_tournament_rounds_live`) was applied
on 2026-10-28. Live preapply now requires the post-M3 schema and the exact
ordered eleven-row ledger. No approved apply is pending. Never execute baseline DDL on live or repeat
adoption repair. Auth enablement remains a separate decision. See
[schema-drift/LIVE-APPLY-PREFLIGHT.md](schema-drift/LIVE-APPLY-PREFLIGHT.md).

## Local receipt

[tests/M2-OFFLINE-RESULTS.md](tests/M2-OFFLINE-RESULTS.md) records exact commands,
red/green results, skips and the local commit outcome.

## Port onto final-candidate M1 9023862

At this historical M2-only port, expected-after.json was regenerated with the
new catalog-query.sql, PG17 single-user baseline + foundation, hosted role
attributes/memberships, and the default ACL
statements from platform-emulation.sql. Only unavailable platform extension
inventory rows are injected by M1's offline platform_ext.inject; no role, ACL,
relation or publication rows are injected. The baseline prefix and rollback both
compare equal to the historical baseline.json under the existing normalization.

The intentional M2 foundation schema delta is listed below. The current
expected-after.json also includes the subsequent M2b policy and ACL changes
documented in M2B-GUEST-GUARD.md; it represents the full ten-row local chain.

The M2 foundation delta is:

- Three tables: contest_memberships, contest_join_requests, operation_receipts,
  with their columns, composite row types, constraints, seven total new indexes
  (including the two score_events indexes), FK triggers, forced RLS and explicit
  postgres/service_role ACLs. No numeric columns are introduced; existing live
  numeric(5,4), numeric(5,2), numeric(4,2) typmods remain unchanged.
- contests adds sync_revision/protocol/sync_enabled and two checks; invite_code
  gets the allocator default. score_events adds round_id/cell_version/
  contest_revision/actor/op_id/request_hash/action, two positive-version checks,
  actor FK, nullable strokes and the set/clear strokes check.
- score_events replica identity changes from DEFAULT to FULL for realtime old-row
  UPDATE/DELETE payloads; rollback restores DEFAULT. Publication membership and
  publication attributes are unchanged: contests, contest_players, score_events
  remain published. RPC-only membership/request/receipt tables are unpublished.
  Realtime delivery and revocation semantics remain integration work.
- Nine functions are added: join_code_candidate, allocate_join_code, request_join,
  list_join_requests, decide_join_request, my_membership, write_score,
  legacy_contest_open, guard_sync_legacy. Their definitions/proc attributes and
  explicit ACLs are captured. Seven legacy search_paths change as listed above;
  is_contest_member gains the protocol guard. Existing legacy routine ACLs stay.
- Three restrictive legacy policies and m2_publish_guard are added. Client
  TRUNCATE/REFERENCES/TRIGGER grants on contests/contest_players/score_events
  and UPDATE/DELETE on score_events are removed; relation ACL inventories reflect
  those same removals. Owner identities do not change.
- postgres public-schema table/sequence/function defaults lose anon/authenticated;
  the global postgres function default loses PUBLIC EXECUTE. The global default
  is closed, rather than relying on an ineffective schema-only PUBLIC revoke.
  service_role and platform-provided supabase_admin defaults remain deliberate;
  M2 does not alter other creators' defaults or existing function grants.

All other catalog sections are equal, including app_roles,
app_role_memberships, extensions/placement, enum ordering, collations, rules,
partitions and publication definitions. M2 changes no role attribute/membership;
service_role BYPASSRLS is baseline, not a migration delta. The table below is an
exhaustive section-level delta inventory. Counts are normalized rows removed and
added (a modified row counts once on each side; dependent catalog rows are
included). No other section differs.

| Catalog section | Removed rows | Added rows |
| --- | ---: | ---: |
| `column_definitions` | 2 | 50 |
| `columns` | 2 | 34 |
| `constraints` | 1 | 23 |
| `default_acls` | 3 | 4 |
| `functions` | 8 | 17 |
| `grants` | 22 | 42 |
| `index_behavior` | 0 | 7 |
| `indexes` | 0 | 7 |
| `owners` | 3 | 6 |
| `policies` | 0 | 3 |
| `relation_behavior` | 3 | 13 |
| `rls` | 0 | 3 |
| `routine_grants` | 0 | 24 |
| `triggers` | 0 | 31 |
| `type_behavior` | 0 | 3 |

Augie's decision 2 remains open. Host approval is the implemented default:
request_join only queues a pending request and returns a generic acknowledgment;
it never inserts membership or binds a slot by matching a name. The only M2
client-callable approval path is decide_join_request, which checks the current
non-anonymous contest owner under the contest lock before assigning/transferring
a slot. A fixture explicitly asserts request_join leaves my_membership NULL.
Protocol-0 legacy behavior remains the documented compatibility boundary.

## Verifier 2: synchronized rollback regression

The earlier sleep-based CI race could pass without proving rollback waited.
`schema-drift/rollback-race-test.sh <db-url> [rollback-file]` now keeps a writer
transaction open through a FIFO, records its backend PID, and observes the
rollback backend in `pg_stat_activity`: `wait_event_type = 'Lock'` and the writer
PID in `pg_blocking_pids`. Only then does it release COMMIT. Each polling stage
has a 30-second deadline; an early rollback exit fails. The rollback must exit
nonzero with `M2_DOWN_UNSAFE`, retain `contest_memberships` and the committed
protocol-1 contest, and clean the test rows. Exit traps terminate both sessions.
Only explicit localhost/127.0.0.1 URLs without query overrides are accepted.

CI first runs the exact old a5c154a rollback fixture (header added only). It can
wait at later DDL after its unsafe guard; that wait alone is insufficient. The
red gate requires observation of the wait followed by erroneous rollback success.
The fixture is wrapped in a transaction so interruption cannot leave partial DDL.
CI restores baseline if necessary, reapplies M2, and runs the real rollback green
before the existing baseline, M1, migration-up and M2 gates in their prior order.
`schema-drift/rollback-race-local.sh` builds a throwaway PG17 server using the
shared `offline-bootstrap.sql` and runs the same red/green sequence. The sandbox
denied socket creation; the box must run this harness and the full CLI-stack CI.
No concurrent-session red/green execution is claimed from single-user tests.

To revert this PR's code after merge, run `git revert -m 1 <merge-commit>` on the
intended branch and review the resulting revert. A code revert does not undo an
applied database migration; use the guarded M2 down procedure above separately.
M2 is applied live as of 2026-10-27 02:20 MST. Future milestones require separate approval.
