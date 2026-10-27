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

The supplied extractor does not record view reloptions, column identity/generated
attributes, sequence parameters/dependencies, schema privileges, event triggers,
or extension internals. It records relation owners and ACLs, sequence ACLs,
function definitions/config/owners/ACLs, and the Auth row trigger. Catalog parity
must not be represented as proof of those unrecorded attributes.

The two bigint IDs (`golfcore_usage.id`, `golfcore_usage_drift.id`) have null
column_default and named sequences in the live catalog; archived 006/007 explicitly
use GENERATED ALWAYS AS IDENTITY. Baseline preserves those identity declarations
and their default sequence parameters/ownership rather than creating disconnected
sequences. This is corroborating SQL evidence, not a fresh live identity query.
All six views use default owner behavior as in the earlier schema SQL; the advisor
specifically flags the four anon-accessible analytics views. A supplemental
read-only live reloptions/identity/sequence query is needed for independent proof
of attributes missing from the supplied catalog. No claim that CI can prove an
uncaptured live value is made.

Auth settings other than anonymous sign-ins are explicit local development
settings, not a claimed full export of hosted Auth. Anonymous sign-ins remain off.
No app code or other workflow was changed. Tournament E2E remains OFFLINE and
receives the new reset chain; web/iOS behavior still needs their existing CI.
