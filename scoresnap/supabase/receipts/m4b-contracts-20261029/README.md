# Contracts + CI repair round — Oct 29, 2026

Source branch: snapscore/xdevice-m4b-sync-api, draft PR #50.
Contracts: docs/xdevice/sync-contract-v1.md and sync-contract-v1.ts.

Commands from repository root:
- bash scoresnap/supabase/schema-drift/m4b-local.sh (native-pg17.log)
- python3 scoresnap/supabase/schema-drift/selftest.py (selftest.log)
- python3 scoresnap/supabase/schema-drift/verify-foundation.py (verify-foundation.log)
- python3 scoresnap/supabase/schema-drift/reference-guard.py (guards.log)
- python3 scoresnap/supabase/schema-drift/check-active-sql.py (guards.log)
- git diff --check; bash -n on changed runners; Python compile on changed harnesses.

Native PG17 uses disposable Auth/Realtime SQL stubs, real roles/RLS and JWT claim
settings. No live Supabase, Auth service, socket or HTTP proof. No Docker or
Supabase CLI available locally: full hosted rehearsal/setup must be proved by CI.

Previous failed run 40922838617: native job failed before harness because
/usr/lib/postgresql/17/bin/postgres was missing; workflow now installs PG17.
Rehearsal stopped because its pending list omitted sync_api. Expected files now
come from active-migrations.json; seven historical ledger rows are selected by
version, baseline is marked applied after physical catalog parity, and both
pending sets are asserted exactly. Only dry runs occur; baseline is never pushed.
Selftest rejects a post-adoption pending baseline, omitted sync_api and extra SQL.

Full pending catalog regenerated from native chain; historical M2b/M3/live
snapshots and existing M3 signatures remain unchanged. Paired M4b down restores
exact M3 catalog. All new DDL/grants stay in the existing migration transaction.

Native suite adds caller-only discovery before/after approval and revocation,
empty outsider status, authentication denial, pending UUID privacy, capability
pause/forbidden/topic checks, course projection with nested private sentinel,
asymmetric round course override/fallback and stable player/group ID mappings.
Mutation suite changes these semantics as well as endpoint/helper ACLs, existing
CAS and Realtime guards; each unsafe variant must fail a semantic assertion.

CI results and pushed SHA are appended to the external handoff report after push.
No milestone completion, M4a integration, real identity/socket/native recovery,
four-phone acceptance, provider readiness or release is claimed by these logs.

Follow-up CI 40925019734: PG17 native, iOS boot, tournament E2E passed; hosted
rehearsal caught the helper incorrectly including seven already-seeded historical
markers from the active manifest. Fixed by excluding versions before baseline.
Selftest now includes the literal five-file CI dry run and its four-file adopted
counterpart, plus rejection if a historical marker appears pending. This failure
was not counted as green. No SQL or contract change in the corrective commit.
