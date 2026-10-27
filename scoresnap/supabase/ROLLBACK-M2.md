# M2 rollback

Merging M2 makes **no live change**. The foundation migration
`migrations/20261027120000_sync_foundation.sql` is not applied to live
(`pltgbizexllikiwryozm`) and must not be applied without Augie's explicit yes.

## Code rollback (what merging can break)

Revert the merge commit of the M2 PR (`git revert -m 1 <merge-sha>`, reviewed PR,
green CI). This removes the foundation migration, its down file, tests, the
synchronized rollback race test and the CI wiring, returning the repo to the M1
baseline. No database action is needed because nothing was applied live.

## Database rollback (only if M2 is ever applied to a database)

The full local chain has ten ledger rows (seven historical markers +
`20261027000000 live_baseline` + `20261027120000 sync_foundation` +
`20261027130000 guest_write_guard`), and expected-after.json includes the M2b physical schema; migration rows are
removed by normalization and checked separately by drift.py.
If M2b is installed, roll it down and repair its ledger first as described in
ROLLBACK-M2B.md, leaving the nine-row M2-only chain. Successful M2 down and
ledger repair then leave the eight-row baseline prefix.

Use `rollback/20261027120000_sync_foundation.down.sql` (see `M2-FOUNDATION.md`,
"Rollback and live sequence"). Back up first. Run it with
`psql -v ON_ERROR_STOP=1 -f <file>`; it takes ACCESS EXCLUSIVE locks on every
guard table before its safety check and refuses with `M2_DOWN_UNSAFE` once any
protocol data exists, so it never discards accepted data. Only after it succeeds,
repair the ledger:

```sh
supabase migration repair 20261027120000 --status reverted --linked
```

For live, every step above (apply, down, ledger repair) is a live write and
needs Augie's explicit yes. `schema-drift/rollback-race-test.sh` proves on a
disposable database that the down waits for, and then refuses after, a
concurrent committed writer; `schema-drift/rollback-race-local.sh` runs it red
(old unlocked fixture) and green (real down) on a throwaway PG17.
