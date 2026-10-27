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
