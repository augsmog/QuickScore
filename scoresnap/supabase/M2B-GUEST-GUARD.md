# M2b guest direct-write guard

Local work only. Read the 2026-10-26 23:11 live audit ledger: anonymous
sign-ins remain disabled. M2 protects synced contests but leaves protocol-0
writes open to authenticated anonymous identities. Profiles also allowed
self-service entitlement changes. M2b closes these direct client paths without
changing reads, M2 policies, RPC bodies, owners, service_role or default ACLs.

| Table | New restrictive policies, TO authenticated |
| --- | --- |
| contests | m2b_contests_insert/update/delete |
| contest_players | m2b_contest_players_insert/update/delete |
| score_events | m2b_score_events_insert/update/delete |
| scans | m2b_scans_insert/update/delete |
| profiles | m2b_profiles_insert/update/delete |

Each command has its own policy: INSERT WITH CHECK, UPDATE USING and WITH
CHECK, DELETE USING. Every predicate rejects coalesced is_anonymous=true.
Anon INSERT/UPDATE/DELETE on all five guarded tables are revoked. M2b adds
only 15 restrictive policies and no permissive policies. Regular roster DELETE
retains M2's filtered zero-row behavior; no cascade deletion is enabled.
The M2/M2b catalog gate rejects permissive policy additions and new client grants
except UPDATE(display_name, avatar_url) on profiles. It runs offline and in CI.

## TRUNCATE and schema capabilities

TRUNCATE bypasses RLS. Explicitly revoke TRUNCATE, REFERENCES and TRIGGER from
anon and authenticated on every public table (including the three M2 tables),
and the four analytics views carrying these grants in live.json. No service_role,
owner or default ACL is changed. Views cannot actually be truncated: their ACLs
are checked separately rather than treating PostgreSQL 42809 as a denial.

The snapshot carries these three privileges for both roles on: automation_log,
channel_effectiveness (view), content_insights (view), content_performance,
contest_players, contests, daily_metrics, feedback, feedback_themes (view),
funnel_health (view), funnel_snapshots, improvement_actions, marketing_events,
profiles, revenue_events, scans, score_events, settlements. M2 already revoked
all three on contests, contest_players and score_events. Therefore the additional
removal is 15 relations × 2 roles × 3 privileges = 90 ACL entries. Explicit
revocations on other public tables preserve their existing lack of these grants.

REFERENCES permits creating foreign keys and TRIGGER permits installing triggers;
neither is a client data operation. Inspection of src/ and app/ found no SQL
TRUNCATE, CREATE TRIGGER or ALTER TABLE/foreign-key DDL against Supabase. Local
SQLite REFERENCES declarations in src/db/schema.ts do not use Supabase grants.
The exact prior grants are recoverable from live.json plus M2's three-table
revocations, so both capabilities are revoked too. Down restores each role/table
explicitly, preserving M2's existing revocations.

## Profile columns

live.json contains 18 profile columns. Only display_name and avatar_url receive
client UPDATE privileges, authenticated only. Table INSERT/UPDATE privileges
are revoked from both client roles; auth's postgres-owned handle_new_user
trigger still creates profiles. No column INSERT grants existed.

Entitlement/billing fields: is_premium, premium_since, premium_source,
churned_at describe paid status, provenance and lifecycle. referral_code,
referred_by and referral_count control referral identity, attribution and credit;
all remain server-controlled. The remaining excluded columns are id, email,
signup_source, onboarding_email_sent, onboarding_email_sent_at, total_scans,
total_rounds, created_at and updated_at: identity, attribution, automation,
usage and audit state are not editable presentation data. Grep of src/ and app/
found no profile mutation callers or protected-field writes. Service_role is
untouched. Tests check both presentation update and forbidden entitlement writes.

## Unchanged M2 RPC guest behavior

All five RPCs are postgres-owned SECURITY DEFINER with search_path=pg_catalog,
qualified relations and authenticated EXECUTE. They bypass table RLS but retain
their own authorization checks; M2b adds no functions or ACL changes to them.

| RPC | Guest rule |
| --- | --- |
| request_join | Allowed with uid and valid inputs; generic pending acknowledgment, queues eligible enabled protocol-1 request |
| my_membership | Own membership or NULL; requires uid |
| list_join_requests | Denied, non-anonymous owner required |
| decide_join_request | Denied, non-anonymous owner required |
| write_score | Approved player may write own slot; anonymous owner authority alone denied; active/enabled protocol-1 and CAS checks retained |

The positive guest request test verifies the underlying request exists as admin,
not merely the generic pending result. Existing foundation tests also exercise
approved guest scoring, transfers/revocation and anonymous host denials.

## Test matrix and CI

348 savepoint probes run with SET LOCAL ROLE and request.jwt.claims, in a rolled
back transaction. Only SQLSTATE 42501 satisfies a denial. Every unexpected SQLSTATE produces a
labelled M2B_UNEXPECTED_SQLSTATE warning. A temporary sequence retains failures
across savepoint rollbacks; the suite reports all probes then fails explicitly. For filtered guest
UPDATE/DELETE, it requires zero affected rows and compares the complete seeded
row before/after as superuser. Owned contests, players, scores, scans and profiles
exist before those probes. Positive UPDATE/DELETE must affect rows.

| Identity / fixture | Assertions |
| --- | --- |
| Guest, top-level true | Five guarded tables: INSERT, UPDATE, DELETE, TRUNCATE; own and other-contest player INSERT; profile display_name and is_premium UPDATE |
| Isolated guest policies | All 15 restrictive policies independently: supply test-only permissive policy and command grant within the savepoint, then require denial; UPDATE/DELETE also require row unchanged |
| JWT variants | String "true" denied; missing top-level allowed; top-level false with user_metadata true, app_metadata true, and both true allowed; top-level true with user_metadata false denied |
| Regular legacy user | Contest INSERT and live metadata UPDATE; player INSERT with/without user_id, UPDATE and zero-row DELETE; score INSERT; own scan INSERT; display_name and avatar_url UPDATE |
| Regular protected profile columns | is_premium, premium_since, premium_source, churned_at, referral_count, referral_code, referred_by UPDATE fail 42501; table INSERT ACL independently tested with permissive fixture |
| Anon | INSERT/UPDATE/DELETE all five guarded tables, independently of RLS through test-only permissive policies; all TRUNCATE probes require 42501 |
| Guest / regular / anon | TRUNCATE denied on every public table, including settlements and every physical analytics table; analytics view TRUNCATE ACL checked separately; REFERENCES/TRIGGER ACL checked for every explicitly revoked relation |
| Guest RPC | request_join and persisted request allowed; host listing denied; foundation suite retains the other RPC authorization cases |

CI rolls M2b down and requires the specific M2B_UNGUARDED guest-contest error on
the unchanged suite. Infrastructure errors cannot count as expected red. After
all baseline/race gates, migration up reapplies M2 and M2b and the suite must pass.
The 201-case mutation runner then drops each of the 15 m2b_ policies separately, re-grants
each revoked role/table/privilege separately, and removes the profile presentation
grant. Each mutation runs the suite in one psql transaction and must fail with
a guard assertion, permission error, or TRUNCATE ONLY foreign-key error
(the expected 42501 is replaced by 0A000 when the target grant is restored). Connection close rolls back failures;
a successful suite explicitly rolls back before the runner rejects it. Duplicate
ACL mutations are deduplicated. No mutation touches service_role.

Offline PG17 single-user mode checks policy/ACL inventory, full-chain parity,
exact M2b down-to-M2 parity, M2 down-to-baseline and reapply. It does not enforce
RLS row filtering. Run `bash schema-drift/guest-guard-local.sh` on the box for a throwaway PG17
server with hosted auth stubs and real role/JWT probes. It requires M2 RED,
M2b GREEN, then all 201 mutations RED. This sandbox denies socket creation;
role/JWT and mutation execution remain for the box and disposable CI stack.

## Delivery and live decisions

See ROLLBACK-M2B.md. Code revert and database down are separate operations.
Live migration apply requires Augie's explicit yes. Enabling anonymous sign-ins
requires a separate explicit yes and working CAPTCHA integration first; this
migration does not enable Auth or claim to solve abuse budgets or rate limits.
Before integration, run the schema-drift CI stack and unchanged old-client
gates. This task leaves working-tree changes only.

## Offline receipt (fix round 3)

- verify-offline.sh, verify-foundation.py and selftest.py: PASS.
- check-active-sql.py: PASS, including hashes and migration tracking.
- Shell syntax, Python compilation and git diff --check: PASS.
- PG17 role/JWT suite and 201 mutations: blocked here by socket denial; run
  guest-guard-local.sh on the box. Supabase CI and synchronized race remain for CI.

No network, live database or secrets were accessed. Changes remain uncommitted
in this isolated working tree.
