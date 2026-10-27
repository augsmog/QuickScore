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
All five tables had anon DML grants; these are revoked, including TRUNCATE.
Authenticated TRUNCATE on scans/profiles is also revoked because it bypasses
RLS (M2 already removed it on the other three tables). Guest UPDATE/DELETE
can legitimately affect zero rows rather than throw; no mutation is permitted.

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

Guest tests use real SET LOCAL ROLE authenticated and request.jwt.claims with
sub and is_anonymous=true, inside a rolled-back transaction. Each operation has
its own savepoint, and exception assertions use SQLSTATE 42501. Profile UPDATE
also accepts zero affected rows under restrictive USING. Matrix: guest contest
create, own/other-contest join, score insert/update/delete, own scan insert,
display-name and premium update; regular legacy create/join/score/scan/display
updates succeed, entitlement updates fail; no-JWT anon insert/update/delete
fail or filter all rows; guest request_join succeeds and host listing fails.

CI rolls M2b down before any M2 rollback/race gate. Against M2-only it requires
the specific M2B_UNGUARDED guest-contest failure, then m2b.red=true reverses the
expectations for every formerly vulnerable operation and requires all to succeed.
Infrastructure errors cannot count as expected red. The normal migration up
reapplies M2 and M2b after baseline gates; the same tests must then pass green.
Full-chain catalog and ten-entry local ledger parity follow. Ledger adoption
rehearsal leaves both M2 and M2b pending after baseline ledger repair.

Offline PG17 single-user mode verifies catalog/policy/column ACL inventory,
full-chain parity, exact M2b down-to-M2 parity, M2 down-to-baseline and reapply.
It does not enforce RLS row filtering; the real Supabase role/JWT suite and
concurrent rollback race are CI-only. No stack was started here.

## Delivery and live decisions

See ROLLBACK-M2B.md. Code revert and database down are separate operations.
Live migration apply requires Augie's explicit yes. Enabling anonymous sign-ins
requires a separate explicit yes and working CAPTCHA integration first; this
migration does not enable Auth or claim to solve abuse budgets or rate limits.
The box must stage/commit the new files (this clone's .git is read-only), run the
schema-drift CI stack and unchanged old-client gates, then push for review.

## Offline receipt

- verify-offline.sh: PASS, including baseline prefix, mutation fixtures and foundation verification.
- verify-foundation.py --record: PASS; regenerated full chain and proved both down/reapply catalog boundaries.
- selftest.py: PASS after extending the local ledger fixture to ten entries.
- check-active-sql.py: manifest names/hashes match; final Git-tracking assertion fails because the new migration cannot be staged in read-only .git. Box must stage files and rerun unchanged checker.
- Shell syntax and git diff --check: PASS.
- Supabase role/JWT red/green suite and concurrent race: not run; CI-only.

No network, linked/live DB, Auth settings or secrets were accessed. The audit
ledger was read from the supplied local path. No commit or push was possible.
