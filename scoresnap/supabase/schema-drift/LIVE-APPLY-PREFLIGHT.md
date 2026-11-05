# Next milestone live preflight

M3 (`20261028162155_tournament_rounds_live`) was applied live on 2026-10-28
at 9:21 AM PT. Supabase recorded version `20261028162155`.
M2 and M2b were applied live with Augie approval on project
`pltgbizexllikiwryozm` on 2026-10-27 at approximately 02:20 MST.
Baseline ledger adoption completed on 2026-10-26 at 23:11 MST.
No approved apply is pending.

Use a fresh read-only capture of the post-M3 schema and exactly the eleven ordered
rows in `expected-ledger.json`. The last row is version `20261028162155`,
name `tournament_rounds_live`. Run:

```sh
bash scoresnap/supabase/schema-drift/preapply-check.sh CAPTURE.json
```

Expected output (exit status 0):

```text
Schema matches
Ledger matches: live
Guard passed.
Next: M3 was applied on 2026-10-28; no approved apply is pending.
```

The guard runs only Python against files; it neither connects nor applies SQL.
Live mode requires exact list equality: eight, nine, ten, twelve, the old
`20261028100000` stamp, missing, renamed, extra, duplicate, reordered and wrong
baseline name/version ledgers fail closed.
The eleven rows are the eight adopted rows followed by M2, M2b, then M3.
`baseline` retains the eight-row prefix; `pre-adoption` retains its first seven;
`local` retains the ten-row M2b prefix. Those three modes compare sorted rows
for historical CI/rehearsal semantics; live mode requires input order too.
`schema-snapshot/live.json` is `drift.py normalize` of `expected-m3.json` and
matches that post-M3 schema byte for byte. `baseline.json` preserves the pre-M2
physical schema for CI, rollback and adoption rehearsal. See snapshot `PROVENANCE.md`.
Never execute baseline DDL on live or repeat adoption repair.

SHA256 (files in this directory):

```text
162e9f297ade7278a02d4fd6277cd713cb18b8121b43bda25763772674278b2a  preapply-check.sh
88e84a4298fd72acb3173eb09395332286c33f476802646e08416e9e9c3ee9a2  drift.py
0cfbb87b133980ff4063e067e0d5d946a1e2e0d244a6c8b6714ff68cd3681000  expected-ledger.json
```

Local offline verification for this refresh: `selftest.py`, `check-active-sql.py`,
`reference-guard.py`, and `verify-offline.sh` (PostgreSQL 17 single-user,
including `verify-foundation.py` and the SQL fixtures) passed. `live.json` and
`expected-m3.json` are byte-for-byte equal. Shell syntax and `git diff --check`
passed. The migration and rollback files were renamed to `20261028162155`; their
path comments were updated to that filename. Single-user PostgreSQL does not
verify raw RLS filtering or event-trigger firing; pinned-stack CI and
concurrent-session races were not run in this offline task. No live Supabase
connection was used.
