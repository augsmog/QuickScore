# M2 + M2b live apply preflight

Project `pltgbizexllikiwryozm` is ADOPTED: Augie approved baseline ledger repair
on 2026-10-26 at 23:11 MST. Use a fresh read-only capture with the unchanged
pre-apply schema and exactly the eight ordered rows in `expected-ledger.json`.
Run `bash scoresnap/supabase/schema-drift/preapply-check.sh CAPTURE.json`.
Expected output (exit status 0):

```text
Schema matches
Ledger matches: live
Guard passed.
Next: apply approved M2 (20261027120000_sync_foundation), then M2b (20261027130000_guest_write_guard), per the live-apply plan.
```

Follow the approved live-apply plan for M2 then M2b. Baseline repair is complete.
The guard runs only Python against files; it neither connects nor applies SQL.
Seven-row pre-adoption, already-applied M2/M2b, missing, renamed, extra,
duplicate, reordered, and wrong baseline name/version ledgers fail closed.
`baseline` remains the eight-row local prefix; `local` remains the ten-row full
chain: seven historical markers + `20261027000000 live_baseline` +
`20261027120000 sync_foundation` + `20261027130000 guest_write_guard`.
`schema-snapshot/expected-after.json` describes this full chain, including M2b.
`pre-adoption` exists only for the historical adoption rehearsal.

SHA256 (files in this directory):

```text
f94655ff3241dae5506dda5c6efaf97e39bf750084e9e1a01abb2a2a8961a8b2  preapply-check.sh
41f7ab7a0fcfad492fbe8fa6e9e9c30dcb374cdb6bbb94986e2a51327c35ad07  drift.py
2b7726e0912d79076322af6e198886e59c73eb92955a869c6dffd6c52d5147a6  expected-ledger.json
```
