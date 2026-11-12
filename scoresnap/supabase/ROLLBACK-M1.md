# M1 rollback

M1 makes no live change. Rollback is reverting the product PR. No row data is
changed and no down migration should run on live.

The archived historical files are byte-identical to 001–008 and carry SHA256s in
`archive/pre-baseline/README.md`. To restore the historical repository layout,
revert the PR (preferred), or remove the eight new migration files and `git mv`
the eight archived SQL files back to `migrations/` in a reviewed rollback commit.
Do not reset/deploy that historical chain against live. **008 is superseded and
must never be applied**; restoring it as historical source does not authorize it.

The only future live action for M1 is ledger adoption, after a fresh read-only
catalog passes the guard and Augie explicitly says yes:

```sh
supabase migration repair 20261027000000 --status applied --linked
```

That changes the ledger only; it does not execute the baseline. It is reversible
by the ledger-only command below, also requiring Augie's explicit yes and review
of any subsequent migrations before running:

```sh
supabase migration repair 20261027000000 --status reverted --linked
```

Both commands run from `scoresnap/` with the linked project verified as
`pltgbizexllikiwryozm`. Never `db push` the baseline to live after reverting its
ledger entry. Never run baseline rollback DDL or drop live objects for M1.
