# Local M4b SQL lane receipts — 2026-10-29

Base main: `8c0a40aee04be34c1ab17075c404159656fa868b`.
Native PostgreSQL 17, disposable loopback database, no hosted calls.

Commands from repository root:

```
bash scoresnap/supabase/schema-drift/m4b-local.sh
python3 scoresnap/supabase/schema-drift/selftest.py
python3 scoresnap/supabase/schema-drift/verify-foundation.py
python3 scoresnap/supabase/schema-drift/reference-guard.py
git diff --check
bash -n scoresnap/supabase/schema-drift/m4b-local.sh scoresnap/supabase/schema-drift/verify-foundation-ci.sh
```

All passed. `native-pg17.txt` is the final comparison-mode run (not snapshot record
mode). 201 guest-guard and 149 M4b mutations were independently rejected. CAS
and authorization races synchronize on an observed PostgreSQL lock wait;
the unsafe no-lock fixture fails with the specific first-cell uniqueness error.
Fresh-chain and seeded pre-M4b receipt replay/cache rebuild passed. M4b down
restores exact M3 catalog on unused schema; M3/M2b/M2 down reaches baseline.
An enrolled writer makes M4b down wait and refuse without losing its event.

Auth/JWT and realtime.send are SQL stubs in the native harness. These receipts
are not actual Auth, Realtime socket, PostgREST, M4a, native app or four-phone
proof. Hosted CI is wired but was not executed locally. CI and independent
verifier status must be recorded separately; no CI green claim is made here.
See ROLLBACK-M4B.md for open integration work and operational rollback.
