# Live baseline and drift guard

M1 replaces the incompatible 001–008 executable chain with seven provenance-only
markers and `20261027000000_live_baseline.sql`. The markers match the exact live
ledger names/versions; baseline creates the physical schema only for fresh local
stacks. The committed snapshot merges the 2026-10-26 20:12 MST live capture with
the ~20:35 and ~20:58 MST supplemental captures. See
`../schema-snapshot/PROVENANCE.md` for the per-key source.
No live apply, repair, network connection, app change, or security fix is part of M1.

## Run locally

From `scoresnap/`, with CLI **2.122.0**, Docker, psql, and Python 3:

```sh
supabase start
supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -X -At -v ON_ERROR_STOP=1 -f supabase/schema-drift/catalog-query.sql > /tmp/local-catalog.json
python3 supabase/schema-drift/drift.py normalize /tmp/local-catalog.json /tmp/local-normalized.json
python3 supabase/schema-drift/drift.py compare supabase/schema-snapshot/live.json /tmp/local-normalized.json
python3 supabase/schema-drift/drift.py ledger /tmp/local-catalog.json --mode local
python3 supabase/schema-drift/selftest.py
bash supabase/schema-drift/rehearse-ledger-adoption.sh
supabase stop
```

Without sockets, Docker, or network, run from the repository root:

```sh
bash scoresnap/supabase/schema-drift/verify-offline.sh
```

This initializes a disposable PostgreSQL 17 cluster, executes the exact migrations
in single-user mode with stub Auth functions/users and local roles, extracts with
the same query, compares schema/ledger, runs fixtures, and removes the cluster.
It tests DDL, not Auth service or RPC authorization behavior. No daemon remains.
`PGBIN` can select another PostgreSQL 17 binary directory. Requires pgcrypto and
uuid-ossp; pg_graphql, supabase_vault, and pg_stat_statements are not installed by
this offline harness. The pinned CI stack supplies managed prerequisites.

## Comparison and explicit allowlist

`catalog-query.sql` extends the M0 extractor with the verifier supplemental fields. It returns one self-contained JSON object. Always execute as
postgres: information_schema privilege visibility is role dependent. `-X -At`
and `ON_ERROR_STOP` prevent psql startup files/formatting/errors from corrupting
JSON. Both sides use this exact query. Objects added to public are included;
there is no table-name whitelist. Unified diffs identify object kind, name,
field, and live/local value. Unknown catalog keys also compare.

Normalizer sorts object arrays, role/config arrays and ACL entries, strips SQL
formatting whitespace outside quoted strings/identifiers/dollar bodies, and
retains literal contents and function bodies. Null aggregate sections become
empty arrays. Physical column position remains a compared field. Normalizing an
already normalized snapshot is safe. Stored function bodies are deliberately
stricter than semantic SQL equivalence.

Every exception is in `allowlist.json`:

- `taken_at`: capture time is not schema.
- `server_version`: compare major (17), omit patch/packaging differences
  (hosted 17.6 versus offline 17.11).
- Six **named** extension inventory records only: pg_graphql,
  pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp. Managed versions
  and availability differ; no extension definition is reconstructed. Unexpected
  extension names still fail. Any public objects supplied by extensions still
  compare; moving an extension into public cannot hide its objects.
- Default ACL scope: include **all roles in public** and **postgres global**
  defaults (namespace zero rendered `-`). Live has no postgres global entries.
  `reviewed-default-acls.json` lists all three exact supabase_admin/public
  expectations. Baseline restores each; no local platform differences are
  permitted. Defaults in other schemas remain outside the app boundary.
- Migration rows are omitted from the physical comparison, then separately
  checked for exact names/versions: live has seven, local adds the baseline.
  Missing, extra, duplicate, or renamed ledger entries fail.

Public routine ACL text and information_schema EXECUTE grants are both compared.
All public relation owners/ACLs, both sequence ACLs, policies, function secdef and
proconfig, RLS/force flags, publication members, and the auth.users row trigger
are included. Identity/generated flags, sequence parameters/dependencies, relation
reloptions, schema owner/ACL, column ACLs, row-trigger enabled state, and application
event triggers are also compared. See `../BASELINE-NOTES.md` for provenance.

## Ledger adoption rehearsal

`rehearse-ledger-adoption.sh` targets only hard-coded loopback URLs. It creates
`live_rehearsal` from template0 in the same local stack, using the cluster roles,
minimal Auth stubs and extensions/publication, applies baseline **directly**, then
inserts exactly the seven live ledger entries. This simulates the live public
schema and ledger, not a second running hosted Auth service. Template0 avoids
cloning `postgres` while stack services hold active connections.

It compares this schema/ledger, runs `migration list`, asserts dry-run lists
**only** baseline, repairs baseline to applied, lists again, asserts dry-run says
up to date with no migration filenames, then rechecks unchanged physical schema
and the eight-row ledger. It drops the disposable database on success. A failed
run leaves the database for investigation; the CI stack cleanup removes it.

The CLI gets `--db-url` with a non-postgres database name; no `--linked` and no
`--include-all` is expected because all local historical markers already match.
This invocation and the CLI's dry-run text are deliberately asserted in CI, not
claimed proven offline. If CLI 2.122.0 rejects the database name or formats output
differently, CI must fail and the script must be adapted based on actual output.
Never replace this with a fabricated successful rehearsal.

## Box pre-apply and approved refresh

The box obtains a **fresh** live capture by executing `catalog-query.sql`
read-only as postgres, then runs:

```sh
bash scoresnap/supabase/schema-drift/preapply-check.sh /path/to/fresh-live-catalog.json
```

The guard uses only Python and the provided file: it never connects or writes to
live, reads no credentials, and never invokes Supabase. It normalizes both sides,
compares schema and exact seven-row live ledger, fails closed with a human diff,
and only on success prints the permitted next command:

```sh
supabase migration repair 20261027000000 --status applied --linked
```

Run that command from `scoresnap/` only after verifying the linked project is
`pltgbizexllikiwryozm` and obtaining **Augie's explicit yes**. A fresh match is an
engineering guard, not permission. Never execute the baseline SQL on live.
No live apply/repair is authorized by the guard itself.

After an approved future live schema change, save the fresh read-only raw capture,
review the diff against the expected forward migration, update expected physical
snapshot with `drift.py normalize RAW schema-snapshot/live.json`, and update the
ledger expectation/code for that approved milestone. Review those updates in a PR
and run identity/mutation/local parity/rehearsal checks. Do not refresh merely to
silence unexpected drift or expand the allowlist to hide app differences. M1's
guard intentionally refuses already-adopted (eight-entry) live ledgers; subsequent
milestones must explicitly revise that expectation.

## Verification receipt (fix round 1)

PG17 offline apply, catalog parity, ledger checks, JSON mutation fixtures, and
15 transactional SQL mutations pass. Every mutation is also rejected by the offline
pre-apply guard before any repair command is printed. SQL fixtures run through the
same extractor and comparer in pinned-stack CI. `rls-probe.sql` requires the new
public table to have RLS enabled and drops it within a rolled-back transaction.
Single-user PostgreSQL suppresses event triggers, so the behavior probe explicitly
skips there and is mandatory in CI. Event-trigger creation is unconditional: the
pinned Supabase image's supautils allowance for postgres must succeed; no privileged
role impersonation, swallowed permission failure, or skipped DDL is used. This
workspace cannot verify that allowance or postgres's ability to restore
supabase_admin defaults and set pg_database_owner on the pinned stack; CI must.

Historical markers now contain comments only. The CLI migration runner records a
migration version independently of its statement batch; an empty SQL batch needs
no SELECT to create a ledger entry. The pinned 2.122.0 reset and adoption rehearsal
must prove this behavior with the seven comment-only files.

No network, live DB, CLI, or Docker was used for this fix. A fresh live execution
of the expanded query and pinned-stack CI remain required before merge.
