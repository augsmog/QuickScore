# M1 baseline provenance and known live debt

Captured from project `pltgbizexllikiwryozm`, PostgreSQL 17.6, 2026-10-26 20:12 MST. Schema only; no rows or credentials. Catalog is authoritative; older reconstructed SQL was not used as executable baseline.

Baseline is for an empty local public schema. It intentionally fails on duplicate app objects; it is not a general rerunnable migration and must never execute on live. Publication additions alone are guarded. No enum/domain/custom standalone composite types were captured.

## Known live debt, fixed in M2+

- **Views use postgres owner permissions (default security definer behavior) — known live debt, fixed in M2+:** `channel_effectiveness`, `content_insights`, `feedback_themes`, `funnel_health`, `golfcore_usage_summary`, `golfcore_usage_summary_v2`.

- **Functions with mutable search_path — known live debt, fixed in M2+:** `calculate_retention`, `get_dau`, `get_mau`, `handle_new_user`, `handle_updated_at`, `increment_daily_revenue`, `increment_daily_signups`.

- **Functions with search_path including public — known live debt, fixed in M2+:** `reconcile_golfcore_usage`, `reserve_golfcore_call`.

- **Functions executable by PUBLIC — known live debt, fixed in M2+:** `calculate_retention`, `get_dau`, `get_mau`, `handle_new_user`, `handle_updated_at`, `increment_daily_revenue`, `increment_daily_signups`, `rls_auto_enable`.

- **Security definer functions (privileged legacy entry points; audit in M2+) — known live debt, fixed in M2+:** `calculate_retention`, `chat_contest`, `create_share_link`, `get_dau`, `get_mau`, `get_shared_round`, `handle_new_user`, `increment_daily_revenue`, `increment_daily_signups`, `is_contest_member`, `is_contest_owner`, `list_host_messages`, `list_messages`, `post_message`, `publish_shared_round`, `reconcile_golfcore_usage`, `remove_message`, `reserve_golfcore_call`, `revoke_share_links`, `rls_auto_enable`.

- **Broad anon/authenticated table and view ACLs (all privileges, including MAINTAIN) — known live debt, fixed in M2+:** `automation_log`, `channel_effectiveness`, `content_insights`, `content_performance`, `contest_players`, `contests`, `daily_metrics`, `feedback`, `feedback_themes`, `funnel_health`, `funnel_snapshots`, `improvement_actions`, `marketing_events`, `profiles`, `revenue_events`, `scans`, `score_events`, `settlements`.

- **Broad anon/authenticated sequence ACLs (SELECT, UPDATE, USAGE) — known live debt, fixed in M2+:** `golfcore_usage_drift_id_seq`, `golfcore_usage_id_seq`.

- **Postgres/public default ACLs — known live debt, fixed in M2+:** all table privileges (including MAINTAIN), function EXECUTE, and all sequence privileges granted to anon, authenticated and service_role. Baseline restores these explicitly after clearing inherited grants.

- **RLS enabled without policies (service-role/RPC-only access, preserve and review) — known live debt, fixed in M2+:** `course_catalog`, `course_search_cache`, `golfcore_usage`, `golfcore_usage_drift`, `published_rounds`, `round_messages`, `share_links`.

- **RLS not forced (owners bypass RLS) — known live debt, fixed in M2+:** `automation_log`, `content_performance`, `contest_players`, `contests`, `course_catalog`, `course_search_cache`, `daily_metrics`, `feedback`, `funnel_snapshots`, `golfcore_usage`, `golfcore_usage_drift`, `improvement_actions`, `marketing_events`, `profiles`, `published_rounds`, `revenue_events`, `round_messages`, `scans`, `score_events`, `settlements`, `share_links`.

- **Legacy contest policy/helper and share/chat RPC behavior — known live debt, fixed in M2+:** bodies, quals and grants are preserved, including legacy membership/direct-write paths and spectator projection. No M2 authorization/privacy fix is included. Full definitions remain in the snapshot.


The advisor is context, not a schema substitute. Captured finding categories/counts:


- `rls_enabled_no_policy`: 7. Known live debt, fixed in M2+.

- `security_definer_view`: 4. Known live debt, fixed in M2+.

- `function_search_path_mutable`: 7. Known live debt, fixed in M2+.

- `pg_graphql_anon_table_exposed`: 18. Known live debt, fixed in M2+.

- `pg_graphql_authenticated_table_exposed`: 18. Known live debt, fixed in M2+.

- `anon_security_definer_function_executable`: 10. Known live debt, fixed in M2+.

- `authenticated_security_definer_function_executable`: 17. Known live debt, fixed in M2+.

- `auth_leaked_password_protection`: 1. Known live debt, fixed in M2+.


## Evidence boundaries

The expanded self-contained extractor records identity/generated flags (nonempty
entries), all public sequence parameters and ownership dependencies, relation
reloptions (non-null entries), public schema owner/ACL, column ACLs (non-null
entries), row-trigger enabled flags, and application event triggers. Application
event triggers include every public-function trigger regardless of owner and
triggers whose owner is outside the explicitly named Supabase managed role set.
Extension internals and managed non-public event triggers remain outside scope.
All public default ACLs, including supabase_admin, and postgres global defaults
are compared. There are no live postgres global defaults and no reviewed platform
differences. The three supabase_admin/public expectations are listed individually
in schema-drift/reviewed-default-acls.json and restored exactly by the baseline.

Live ensure_rls exists, owned by postgres, enabled O, invoking
public.rls_auto_enable at ddl_command_end for CREATE TABLE, CREATE TABLE AS and
SELECT INTO. It is preserved as live behavior, including its security-definer
function and exception handling. Both row triggers are enabled O. Both bigint IDs
are GENERATED ALWAYS AS IDENTITY with cache 1 and exact maximum
9223372036854775807; sequence start/min/max are extracted as text. All public
reloptions and column ACLs were null in the supplemental capture. In particular,
all six views lack security_invoker, preserving their known live owner-permission
debt. Public schema owner is pg_database_owner, with owner UC and only USAGE for
PUBLIC, postgres, anon, authenticated and service_role. This is restored explicitly.
See schema-snapshot/PROVENANCE.md for the source of each added key. The box must
replace this merged snapshot with a single new read-only capture before merge.

Auth settings other than anonymous sign-ins are explicit local development
settings, not a claimed full export of hosted Auth. Anonymous sign-ins remain off.
No app code or other workflow was changed. Tournament E2E remains OFFLINE and
receives the new reset chain; web/iOS behavior still needs their existing CI.

## Platform-provided supabase_admin default ACLs and pg_graphql (CI emulation)
Hosted Supabase carries three supabase_admin/public default ACLs (tables, sequences, functions)
recorded in live.json. The baseline does not set them (postgres lacks permission; SQLSTATE 42501),
and the local CLI 2.122.0 image does not create them. CI therefore applies
`schema-drift/platform-emulation.sql` as local supabase_admin after `db reset`. That file is CI/offline
only and must never be run against live.

## M2 disposition (local only)

See [M2-FOUNDATION.md](M2-FOUNDATION.md) for exact frozen RPC contracts, staged
owners/milestones and apply/rollback gates. The inventory above describes captured
**pre-apply live debt**, not a claim that every item is fixed in M2. M2 closes
postgres future-object client defaults (including global PUBLIC EXECUTE), fixes
seven mutable legacy paths, revokes unused TRUNCATE/REFERENCES/TRIGGER on the
three contest tables, and gates their legacy access by protocol. Existing legacy
DML/routine grants, unrelated ACL/view issues and share/chat privacy changes are
staged with owners in that document. Eight ordered adopted live ledger rows (seven markers plus the exact
20261027000000 live_baseline row) are now expected after the approved adoption;
local full chain has ten entries. live.json stays PRE-APPLY;
expected-after.json describes baseline plus M2 and M2b. Anonymous Auth
remains disabled; no hosted settings or app code changed.
