# Live baseline and drift guard

M1 replaces the incompatible 001–008 executable chain with seven provenance-only
markers and `20261027000000_live_baseline.sql`. The markers match the exact live
ledger names/versions; baseline creates the physical schema only for fresh local
stacks. The current live snapshot is the single post-M2/M2b capture from
2026-10-27 02:20 MST. `baseline.json` preserves the historical pre-M2 snapshot
for baseline and rollback checks. See `../schema-snapshot/PROVENANCE.md`.
No live apply, repair, network connection, app change, or security fix is part of M1.

## Run locally

From `scoresnap/`, with CLI **2.122.0**, Docker, psql, and Python 3:

```sh
SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io supabase start -x vector,logflare,studio,imgproxy,mailpit
supabase db reset
psql postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres -X -v ON_ERROR_STOP=1 -f supabase/schema-drift/platform-emulation.sql
bash supabase/schema-drift/verify-foundation-ci.sh
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
It tests DDL and RPC role/JWT authorization using stub Auth functions, not the Auth service. No daemon remains.
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

Normalizer sorts object arrays, role/config arrays and ACL entries; enum labels, publication column lists, and paired extension config/condition lists preserve order. It strips SQL
formatting whitespace outside quoted strings/identifiers/dollar bodies, and
retains literal contents and function bodies. Null aggregate sections become
empty arrays. Visible ordinal column order remains compared; dropped physical attnum gaps are compressed for down/reapply parity. Normalizing an
already normalized snapshot is safe. Only the SQL-bearing keys def, qual, with_check, default, filter,
argument_defaults and partition_bound receive whitespace normalization.
Stored function bodies are deliberately
stricter than semantic SQL equivalence.

Normalization exceptions are implemented by drift.py using `allowlist.json`:
its ledger description is historical (seven live/eight local); executable ledger
expectations come from expected-ledger.json and drift.py, as described below.

- `taken_at`: capture time is not schema.
- `server_version`: compare major (17), omit patch/packaging differences
  (hosted 17.6 versus offline 17.11).
- Only versions of six **named** extensions may differ: pg_graphql,
  pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp. Inventory,
  schema, relocation flag and dump config/conditions remain compared by drift.py.
  Offline PostgreSQL supplies only pgcrypto, uuid-ossp and plpgsql. Before offline
  comparison, platform_ext.py copies missing pg_graphql, pg_stat_statements and
  supabase_vault records verbatim from baseline.json; verify-foundation.py uses
  live.json for the same extension-only injection. Offline parity therefore does not independently verify those
  three extensions or their installation. CI installs real extensions and compares
  their extracted records without this injection; other missing inventory fails.
- Default ACL scope: **every role's global** defaults (namespace zero rendered
  `-`) plus **every role's public-schema** defaults. Exact entries compare.
  `reviewed-default-acls.json` records three platform-provided public defaults;
  the baseline does not alter supabase_admin defaults. Offline setup emulates
  them. `platform_differences` is empty; no role-wide exceptions exist.
- Migration rows are omitted from the physical comparison, then separately
  checked for exact names/versions: live requires the applied ten rows in exact order; baseline retains the first eight rows; local has the full ten rows. Historical pre-adoption mode has seven rows. Only live mode checks input order; the other modes sort by version before checking.
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
inserts exactly the seven historical pre-adoption ledger entries. This simulates the live public
schema and ledger, not a second running hosted Auth service. Template0 avoids
cloning `postgres` while stack services hold active connections.

It compares this schema/ledger, runs `migration list`, asserts dry-run lists
exactly these files in order before repair:

1. `20261027000000_live_baseline.sql`
2. `20261027120000_sync_foundation.sql` (M2)
3. `20261027130000_guest_write_guard.sql` (M2b)

It repairs only baseline to applied, lists again, and asserts the dry-run lists
exactly M2 then M2b (`20261027120000_sync_foundation.sql`,
`20261027130000_guest_write_guard.sql`). It then rechecks unchanged physical
schema and the eight-row baseline ledger (seven historical markers plus
`20261027000000 live_baseline`). It drops the disposable database on success. A failed
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
compares schema to the post-M2b `live.json` and the exact ordered ten-row live
ledger in `expected-ledger.json`, and fails closed with a human diff.
M2 and M2b were applied live with Augie approval on 2026-10-27 at approximately
02:20 MST. On success it prints:

```text
Schema matches
Ledger matches: live
Guard passed.
Next: M3 requires separate approval; no approved apply is pending.
```

No approved apply is pending. M3 requires separate approval. Baseline repair is
complete; never execute baseline DDL on live. The guard performs no apply.
See [LIVE-APPLY-PREFLIGHT.md](LIVE-APPLY-PREFLIGHT.md) for checksums.

After an approved future live schema change, save the fresh read-only raw capture,
review the diff against the expected migration, normalize it over `live.json`,
and explicitly update ledger expectations for that milestone. Do not refresh to
silence unexpected drift or expand the allowlist to hide app differences.
Eight, nine, eleven, missing, renamed, reordered, duplicate, extra and wrong
baseline variants fail the live gate. Baseline/local/pre-adoption modes retain
historical CI/rehearsal semantics; baseline physical checks use `baseline.json`.

SHA256 (files in this directory):

```text
c8fd85bd1acc57ab87dbb6294baa8488f464d9953eacc96068feab2318b99388  preapply-check.sh
28fe833309d506592aa3201742ce5c1ef1b28d3fcf020e48255bbdacbd484486  drift.py
b3335057646f63786a439d5e14012d10080ecfb23c907713161320695b28ece7  expected-ledger.json
```

## Historical verification receipt (fix round 1)

This receipt describes that round, not the current full-chain harness. The
current offline scripts emulate platform default ACLs and the three extension
records described above; pinned-stack execution is still a separate gate.

PG17 offline apply, catalog parity, ledger checks, JSON mutation fixtures, and
15 transactional SQL mutations pass. Every mutation is also rejected by the offline
pre-apply guard before any next step is printed. SQL fixtures run through the
same extractor and comparer in pinned-stack CI. `rls-probe.sql` requires the new
public table to have RLS enabled and drops it within a rolled-back transaction.
Single-user PostgreSQL suppresses event triggers, so the behavior probe explicitly
skips there and is mandatory in CI. Event-trigger creation is unconditional: the
pinned Supabase image's supautils allowance for postgres must succeed; no privileged
role impersonation, swallowed permission failure, or skipped DDL is used. This
workspace cannot verify that allowance or platform-provided defaults and
pg_database_owner on the pinned stack; CI must.

Historical markers now contain comments only. The CLI migration runner records a
migration version independently of its statement batch; an empty SQL batch needs
no SELECT to create a ledger entry. The pinned 2.122.0 reset and adoption rehearsal
must prove this behavior with the seven comment-only files.

No network, live DB, CLI, or Docker was used for this fix. A fresh live execution
of the expanded query and pinned-stack CI remain required before merge.

## Round 2 catalog sweep (PostgreSQL 17)

The table below enumerates **every column** of the requested PG17 catalogs,
checked against the installed PostgreSQL 17 bootstrap catalog. “Compared” includes
semantic deparsing and joins that replace cluster-specific identifiers with names.
Raw OIDs and parse trees never compare directly. The scope is public relations,
standalone types and routines, application event triggers, the Auth trigger calling
public code, all publications/extensions, and global/public default ACLs. Managed
Auth/storage/system internals are excluded from the application boundary. There
are no application objects in another schema in the reviewed baseline; introducing
another application schema is detected by unreviewed_schemas and requires extending
this scope and its fixtures. The individually named managed schemas excluded from
that boundary inventory are listed directly in the SELECT; public, global default
ACLs, publications, extensions and application event triggers have their broader
coverage described above. No arbitrary schema-name prefix except PostgreSQL
reserved pg_ is excluded.

`pg_get_constraintdef` covers CHECK expressions/NOT VALID/NO INHERIT, FK columns,
referenced table, MATCH, ON UPDATE/DELETE and deferrability. Explicit validation,
deferral and inheritance flags supplement it. `pg_get_indexdef` covers access
method, uniqueness, key order, expressions, INCLUDE, collations/opclasses and
predicates. Index validity/readiness/live/replica identity flags supplement it.
`pg_get_triggerdef` covers timing/events/WHEN/arguments/transition tables/constraint
relationships and deferral; enabled state is separate, including internal FK
triggers. Internal generated trigger names are replaced with a stable constraint,
function and trigger-type identity, never a numeric OID suffix.
`pg_get_functiondef` covers source/body, language, return/argument types and names,
variadic/modes/defaults, strictness, security and planner settings; explicit fields
make these settings independently visible. Aggregates have a separate definition
capture because that deparser rejects aggregate routines.

| Catalog | Compared columns (directly or semantic definition) | Deliberately excluded columns and reason |
|---|---|---|
| `pg_class` | `relname`, `relnamespace`, `reloftype`, `relowner`, `relam`, `reltablespace`, `relpersistence`, `relkind`, `relchecks`, `relrowsecurity`, `relforcerowsecurity`, `relispopulated`, `relreplident`, `relispartition`, `relacl`, `reloptions`, `relpartbound` | `oid`: cluster identity, resolved by names; `reltype`: row type derived from relation and attributes; `relfilenode`: physical storage location; `relpages`: runtime statistics; `reltuples`: runtime statistics; `relallvisible`: runtime visibility statistics; `reltoastrelid`: automatic physical TOAST storage; `relhasindex`: lazy maintenance hint; actual indexes compare; `relisshared`: system-only property; app relations cannot be shared; `relnatts`: derived from attribute positions; dropped slots excluded; `relhasrules`: lazy hint; actual rules compare; `relhastriggers`: lazy hint; actual triggers compare; `relhassubclass`: lazy hint; inheritance edges compare; `relrewrite`: transient rewrite identity; `relfrozenxid`: maintenance transaction horizon; `relminmxid`: maintenance multixact horizon |
| `pg_attribute` | `attrelid`, `attname`, `atttypid`, `attnum`, `atttypmod`, `attndims`, `attstorage`, `attcompression`, `attnotnull`, `attidentity`, `attgenerated`, `attislocal`, `attinhcount`, `attcollation`, `attstattarget`, `attacl`, `attoptions`, `attfdwoptions` | `attlen`: derived from type; `attcacheoff`: backend cache offset; `attbyval`: derived from type; `attalign`: derived from type; `atthasdef`: derived from attrdef presence; `atthasmissing`: physical fast-default implementation; expression and visible default compare; `attmissingval`: physical fast-default implementation; changes after rewrite without schema change; `attisdropped`: dropped attributes excluded; visible ordinal positions compare after gap compression |
| `pg_attrdef` | `adrelid`, `adnum`, `adbin` | `oid`: cluster identity |
| `pg_constraint` | `conname`, `connamespace`, `contype`, `condeferrable`, `condeferred`, `convalidated`, `conrelid`, `contypid`, `conparentid`, `confrelid`, `confupdtype`, `confdeltype`, `confmatchtype`, `conislocal`, `coninhcount`, `connoinherit`, `conkey`, `confkey`, `confdelsetcols`, `conexclop`, `conbin` | `oid`: cluster identity; `conindid`: support index definition/constraint semantics compared through indexes; `conpfeqop`: derived FK equality operators from compared types and supporting index opclasses; `conppeqop`: derived FK equality operators from compared types and supporting index opclasses; `conffeqop`: derived FK equality operators from compared types and supporting index opclasses |
| `pg_index` | `indexrelid`, `indrelid`, `indnatts`, `indnkeyatts`, `indisunique`, `indnullsnotdistinct`, `indisprimary`, `indisexclusion`, `indimmediate`, `indisclustered`, `indisvalid`, `indisready`, `indislive`, `indisreplident`, `indkey`, `indcollation`, `indclass`, `indoption`, `indexprs`, `indpred` | `indcheckxmin`: transient transaction visibility horizon; validity/readiness compared |
| `pg_trigger` | `tgrelid`, `tgname`, `tgfoid`, `tgtype`, `tgenabled`, `tgisinternal`, `tgconstrrelid`, `tgconstraint`, `tgdeferrable`, `tginitdeferred`, `tgnargs`, `tgattr`, `tgargs`, `tgqual`, `tgoldtable`, `tgnewtable` | `oid`: cluster identity; `tgparentid`: derived cloned-trigger ancestry; inheritance and trigger definitions compare; `tgconstrindid`: derived support index; index and constraint definitions compare |
| `pg_policy` | `polname`, `polrelid`, `polcmd`, `polpermissive`, `polroles`, `polqual`, `polwithcheck` | `oid`: cluster identity |
| `pg_proc` | `proname`, `pronamespace`, `proowner`, `prolang`, `procost`, `prorows`, `provariadic`, `prosupport`, `prokind`, `prosecdef`, `proleakproof`, `proisstrict`, `proretset`, `provolatile`, `proparallel`, `pronargs`, `pronargdefaults`, `prorettype`, `proargtypes`, `proallargtypes`, `proargmodes`, `proargnames`, `proargdefaults`, `protrftypes`, `prosrc`, `probin`, `prosqlbody`, `proconfig`, `proacl` | `oid`: cluster identity |
| `pg_publication` | `pubname`, `pubowner`, `puballtables`, `pubinsert`, `pubupdate`, `pubdelete`, `pubtruncate`, `pubviaroot` | `oid`: cluster identity |
| `pg_publication_rel` | `prpubid`, `prrelid`, `prqual`, `prattrs` | `oid`: cluster identity |
| `pg_publication_namespace` | `pnpubid`, `pnnspid` | `oid`: cluster identity |
| `pg_extension` | `extname`, `extnamespace`, `extrelocatable`, `extconfig`, `extcondition` | `oid`: cluster identity; `extowner`: platform-managed installer identity; app object ownership/ACLs compare; `extversion`: only six allowlisted names may differ; all other versions compare |
| `pg_default_acl` | `defaclrole`, `defaclnamespace`, `defaclobjtype`, `defaclacl` | `oid`: cluster identity |
| `pg_type` | `typname`, `typnamespace`, `typowner`, `typlen`, `typbyval`, `typtype`, `typcategory`, `typispreferred`, `typisdefined`, `typdelim`, `typsubscript`, `typelem`, `typinput`, `typoutput`, `typreceive`, `typsend`, `typmodin`, `typmodout`, `typanalyze`, `typalign`, `typstorage`, `typnotnull`, `typbasetype`, `typtypmod`, `typndims`, `typcollation`, `typdefaultbin`, `typacl` | `oid`: cluster identity; `typrelid`: row/composite relation identity; attributes and relation definitions compare; `typarray`: automatic companion array type; derived from element type; `typdefault`: human-readable duplicate of compared typdefaultbin expression |
| `pg_enum` | `enumtypid`, `enumsortorder`, `enumlabel` | `oid`: cluster identity |
| `pg_range` | `rngtypid`, `rngsubtype`, `rngmultitypid`, `rngcollation`, `rngsubopc`, `rngcanonical`, `rngsubdiff` | None |
| `pg_inherits` | `inhrelid`, `inhparent`, `inhseqno`, `inhdetachpending` | None |
| `pg_partitioned_table` | `partrelid`, `partstrat`, `partnatts`, `partattrs`, `partclass`, `partcollation`, `partexprs` | `partdefid`: derived from DEFAULT child bound and inheritance edge |
| `pg_rewrite` | `rulename`, `ev_class`, `ev_type`, `ev_enabled`, `is_instead`, `ev_qual`, `ev_action` | `oid`: cluster identity |
| `pg_statistic_ext` | `stxrelid`, `stxname`, `stxnamespace`, `stxowner`, `stxkeys`, `stxstattarget`, `stxkind`, `stxexprs` | `oid`: cluster identity |
| `pg_event_trigger` | `evtname`, `evtevent`, `evtowner`, `evtfoid`, `evtenabled`, `evttags` | `oid`: cluster identity |

Automatic array types are represented by their element definitions; table row types
also have type behavior records, and standalone composite attributes compare.
Enum order compares the `enumsortorder` ordering, not incidental float values;
renumbering those floats without changing order has no semantic effect.
Default ACL rows in non-public, nonzero namespaces are outside this app scope.
System attribute rows (`attnum <= 0`) and dropped columns are excluded; their
physical allocation does not define active app columns. Generated expression
capture uses pg_attrdef even though information_schema reports no column default.
Column collation is recorded when it differs from the type's default collation.

Supplemental catalogs: pg_sequence parameters and ownership dependencies,
pg_namespace public owner/ACL, pg_foreign_table/server/FDW definition fields, and
all pg_aggregate transition/final/moving functions, types, initial values, sort
operator and modification flags are compared. Statistics **data** (pg_statistic,
pg_statistic_ext_data), row counts, transaction/storage identities and server
runtime state are intentionally excluded; extended-statistics **definitions** and
targets compare. Extension member objects in public remain subject to normal
application comparison.

The 41 targeted semantic SQL fixtures capture before and after within one rolled-back transaction
and assert the **specific semantic section** changes, then require the comparison
CLI and preapply guard to reject. This prevents fixture setup objects from hiding
an uncaptured mutation. They include the requested typmod/collation/generated
expression, publication actions/filter/columns, persistence and all replica
identity modes, supabase_admin global ACL, enum reorder and extension relocation,
plus function flags/defaults/language/cost/rows, internal FK trigger enablement,
RLS force, inheritance/partition bounds, rules, CHECK validation, FK actions,
index predicate/uniqueness, domain/range, policy roles/permissiveness, aggregates,
extended statistics and publication schemas.

The snapshot additions are **pending live capture**, not independently observed
live facts. See PROVENANCE.md before using preapply against hosted state. The query
remains one self-contained SELECT, suitable for a single read-only fresh capture.

## Historical round 2 verification receipt

`PGBIN=/usr/lib/postgresql/17/bin` with verify-offline.sh: baseline DDL apply,
strict pending-snapshot parity, local ledger, JSON mutations, and **56 real SQL
mutations** (41 targeted before/after semantic checks plus 15 prior regressions).
All SQL mutations require both comparison and preapply rejection. The event-trigger
behavior probe remains explicitly skipped in single-user mode and required by CI.
Superuser-only leakproof/all-tables publication and extension-owner mutations use
`--admin-url`, as do platform-owned trigger/default ACL operations. No network,
live database, Docker or M2 work was used. This verifies the pending local
expectations; it does not replace the mandatory single fresh hosted capture.
The current runner has 60 SQL mutations: 41 semantic checks plus 19 regressions.
Pinned-stack CI skips four reserved-role mutations (supautils); offline PG17
executes those four, so CI executes 56 SQL mutations plus the RLS behavior probe.


## M2 + M2b full-chain gate

`verify-foundation-ci.sh` is the disposable-loopback-only gate used by CI. It
rolls down M2b first and requires the guest-contest failure, runs the unsafe
rollback race red, restores/reapplies M2 and runs the guarded race green, then
rolls down the unused foundation to compare the baseline prefix against baseline.json,
checks its ledger, proves baseline default privileges red, and runs M1 JSON and
SQL mutations with both postgres and supabase_admin connections. It then reapplies
M2 foundation and M2b guest guard, compares the full chain to expected-after.json,
and checks the ten-entry local ledger: seven historical markers +
`20261027000000 live_baseline` + `20261027120000 sync_foundation` +
`20261027130000 guest_write_guard`. It runs future-default, protocol/role, legacy
compatibility, guest-write guard and guest-guard mutation tests.
`check-active-sql.py` requires exact active migration names, reviewed SHA256
hashes and git tracking. `preapply-check.sh` uses the post-M2b live
snapshot and exact ordered ten-entry live ledger. See ../M2-FOUNDATION.md for contracts,
staged debt and live approval requirements.
