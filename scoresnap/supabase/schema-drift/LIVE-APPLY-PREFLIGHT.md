# Next milestone live preflight

M2 and M2b were applied live with Augie approval on project
`pltgbizexllikiwryozm` on 2026-10-27 at approximately 02:20 MST.
Baseline ledger adoption completed on 2026-10-26 at 23:11 MST.
No approved apply is pending. M3 requires separate approval.

Use a fresh read-only capture of the post-M2b schema and exactly the ten ordered
rows in `expected-ledger.json`. Run:

```sh
bash scoresnap/supabase/schema-drift/preapply-check.sh CAPTURE.json
```

Expected output (exit status 0):

```text
Schema matches
Ledger matches: live
Guard passed.
Next: M3 requires separate approval; no approved apply is pending.
```

The guard runs only Python against files; it neither connects nor applies SQL.
Live mode requires exact list equality: eight, nine, eleven, missing, renamed,
extra, duplicate, reordered and wrong baseline name/version ledgers fail closed.
The ten rows are the eight adopted rows followed by M2 then M2b.
`baseline` retains the eight-row prefix; `pre-adoption` retains its first seven;
`local` retains the full ten-row chain. Those three modes compare sorted rows
for historical CI/rehearsal semantics; live mode requires input order too.
`schema-snapshot/live.json` is normalized from the post-apply single capture
and matches `expected-after.json`. `baseline.json` preserves the pre-M2 physical
schema for CI, rollback and adoption rehearsal. See snapshot `PROVENANCE.md`.
Never execute baseline DDL on live or repeat adoption repair.

SHA256 (files in this directory):

```text
c8fd85bd1acc57ab87dbb6294baa8488f464d9953eacc96068feab2318b99388  preapply-check.sh
28fe833309d506592aa3201742ce5c1ef1b28d3fcf020e48255bbdacbd484486  drift.py
b3335057646f63786a439d5e14012d10080ecfb23c907713161320695b28ece7  expected-ledger.json
```

Local offline verification for this refresh: `selftest.py`,
`check-active-sql.py`, `verify-offline.sh`, and standalone
`verify-foundation.py` all passed. The raw capture passes live/local ledger checks
and preapply; normalized live matches expected-after. Shell syntax and
`git diff --check` passed. No migration or rollback SQL changed. Single-user
PG17 does not verify raw RLS filtering or event-trigger firing; pinned-stack CI
and concurrent-session races were not run in this offline task.
