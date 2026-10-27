# Snapshot provenance — 2026-10-26 (MST, UTC−07)

This is a normalized merge of live facts, not a local-derived snapshot. Before
merge the box must run the new catalog-query.sql read-only and normalize a single
fresh capture over live.json. No raw file was modified.

- Original M0 capture (~20:12 MST): all pre-existing keys in live.json, from
  /workspace/scratch/qs-m0-evidence/live-catalog-20261026T2012.json. This includes
  columns, constraints, indexes, policies, RLS, functions, trigger definitions,
  views, grants, routine grants, publication, extensions, owners, types,
  regclass checks and server version. Existing normalization omits capture time,
  ledger and named managed extension inventory; ledger is checked separately.
- live-catalog-extra-20261026.json (~20:35 MST): identity_generated, reloptions,
  sequences, seq_deps, schema_acl, column_acls. Start/min converted to decimal
  text; sequence max deliberately does NOT use this capture's rounded JSON number.
- live-catalog-extra2-20261026.json (~20:58 MST): sequence_max_text supplies exact
  max 9223372036854775807 for each sequence; trigger_enabled augments existing
  trigger records; event_triggers supplies complete application trigger records;
  default_acls_all supplies all public defaults and confirms no postgres globals.
  Namespace OIDs are omitted; zero namespace is rendered '-' by the new extractor.

Null aggregate fields normalize to empty arrays. Sparse identity/generated,
reloptions and column-ACL sections use the same predicates as their live captures.
Application event filtering excludes managed owners only for non-public functions.
All postgres global defaults and all roles' public defaults remain compared.

## Single fresh capture — 2026-10-26 21:11 MST (2026-10-27T04:11:28Z)
The box ran this branch's `schema-drift/catalog-query.sql` read-only against live
(SELECT only, via the Supabase connector) and normalized it with `drift.py normalize`.
The result is byte-for-byte equal to the merged live.json above (no key differs), and
`preapply-check.sh` on that capture reported "Schema matches" and "Ledger matches: live".
live.json is therefore a single-capture snapshot as of 21:11 MST.

## Round 2 — PENDING LIVE CAPTURE (local expectations only)

The 21:11 MST receipt applies to the preceding extractor, **not** the expanded
round 2 query. The box MUST execute the entire new catalog-query.sql read-only
against live and normalize that **single fresh capture** over live.json before
using these additions as live evidence. No network or live database was used here.

The added sections are column_definitions, relation_behavior, index_behavior,
publication_behavior, publication_relations, publication_schemas, inheritance,
rules, extended_statistics, ranges, foreign_tables, aggregates, type_behavior
and unreviewed_schemas (empty by baseline construction).
Existing constraints/functions/triggers have supplemental fields; internal FK
trigger records are new. These expected values were obtained only from the exact
baseline applied to disposable PostgreSQL 17 by verify-offline.sh. The baseline
DDL constructs the expected type modifiers, defaults/expressions, function
attributes, FK/index definitions, ordinary logged tables, default replica identity,
publication settings, view rules and absence of custom domains/enums/ranges,
inheritance, partitions, rules, statistics, foreign tables and aggregates. Values
are expected from those constructions, **pending live capture**; offline parity
is not independent proof that live has these newly observed catalog properties.
Existing previously captured field values are retained, not refreshed from local.

Extension inventory was previously entirely erased by normalization. The three
records now present (pgcrypto/uuid-ossp in extensions, plpgsql in pg_catalog) are
**pending live capture** local prerequisite expectations, not a reconstructed
hosted extension inventory. The box must replace them with every present hosted
extension from its fresh capture; it must not discard additional managed records.
Only versions of the six individually named extensions are ignored. Hosted-only
extension inventory will cause strict offline parity to fail unless that offline
installation supplies the same extensions; pinned Supabase CI must verify full
hosted inventory. Do not broaden the allowlist to conceal that limitation.

All global defaults for all roles now survive normalization. No additional global
ACLs were invented from local defaults. If the fresh hosted capture contains
platform global defaults absent locally, list each exact hosted/local entry and
its justification individually in reviewed-default-acls.json; no such difference
has been authorized or suppressed in this round. The three existing
supabase_admin/public entries remain platform-provided and are emulated offline;
the baseline still does not attempt to alter them.

## Refresh 2026-10-26 21:45 MST (2026-10-27T04:45:03Z) — supersedes every "pending live capture" note above
The box ran the fix-round-2 `catalog-query.sql` once against live QuickScore (pltgbizexllikiwryozm)
as a single read-only SELECT through the Supabase MCP. live.json is now exactly
`drift.py normalize` of that capture (raw copy: aos-state/snapscore-xdevice/m1/live-catalog-v3-capture.json).
The capture disproved two "by construction" assumptions, which is why it was required:
1. Typmods: live has content_performance.{engagement_rate,click_through_rate,install_rate} numeric(5,4),
   daily_metrics.{dau_mau_ratio,d7_retention,d30_retention} numeric(5,2), daily_metrics.k_factor numeric(4,2).
   The archived 001–008 SQL said plain numeric; the baseline now matches live.
2. Hosted extension inventory adds supabase_vault (vault), pg_graphql (graphql), pg_stat_statements (extensions).
   verify-offline.sh/sql-fixtures --pgdata emulate those three exact live rows (platform_ext.py) because plain
   PG17 cannot install them; the pinned Supabase stack in CI compares them for real.
preapply-check.sh on this capture: Schema matches, Ledger matches: live.

## Refresh 2026-10-26 22:01 MST (2026-10-27T05:01:59Z) — role security attributes
Verifier 3 showed `ALTER ROLE authenticated BYPASSRLS` passed both gates. catalog-query.sql now captures
`app_roles` (super/inherit/createrole/createdb/login/replication/bypassrls for anon, authenticated,
service_role, authenticator) and `app_role_memberships` (every pg_auth_members edge touching them, with
admin/inherit/set options). live.json is exactly `drift.py normalize` of a fresh read-only live capture at this
time (raw: aos-state/snapscore-xdevice/m1/live-catalog-v4-capture.json); preapply passes on it.
verify-offline.sh stubs the same hosted attributes/memberships. Fixtures: role bypassrls, role login,
role membership, authenticator inherit — each rejected by compare and preapply.
