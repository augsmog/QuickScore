# REQUIRES LIVE MIGRATION APPROVAL

Full fresh-device owner restore and game/settings restore require BOTH proposed SQL files:

- Owner enumeration: `supabase/proposed/20261101020000_owner_discovery.sql`; rollback: `supabase/rollbacks/20261101020000_owner_discovery.sql`.
- Game metadata: `supabase/proposed/20261031230000_restore_game_settings.sql`; rollback: `supabase/rollbacks/20261031230000_restore_game_settings.sql`.

The baseline permissive Owner full access policy is insufficient: `m2_legacy_contests` in `20261027120000_sync_foundation.sql` is restrictive and requires protocol=0. PostgreSQL ANDs it with permissive policies, hiding protocol-1 contests even from their owners. The proposed owner-only SECURITY DEFINER list_owned_contests RPC returns IDs; list_join_requests then proves host access before sync_capabilities/fetch_snapshot restoration. Local IDs are hints, never authorization.

Without these proposals, the live schema still supports my_sync_status membership discovery and approved-member snapshot restoration, and host restoration for already-known local IDs. Missing owner enumeration (PGRST202, 42883, or HTTP 404) is cached for the session, with concurrent first probes shared. Local own-code hints undergo server host proof; approved local member codes undergo membership proof if host proof denies access. Anonymous/nonowner joins retain the existing request flow when owner lookup is available (anonymous sessions skip owner lookup).

On the unchanged live schema, an authenticated code absent from local storage cannot be safely classified as owner versus nonowner: request_join does not reveal ownership and can create an unapprovable self-request. That unresolved code receives the neutral fallback sentence instead of a request. This also limits fresh code requests by authenticated nonowners while the owner RPC is unavailable; existing membership discovery/restoration remains available. Other owner-lookup errors still propagate. No pending request claims successful owner restore.

Games cannot be restored client-only: sync_round_bundle currently ignores game metadata and fetch_snapshot emits games: []. The game proposal adds bounded JSON columns and replaces those RPC bodies, preserving authorization, locking and signatures. Changed settings increment the sync revision through the existing broadcast trigger; legacy bundles without games preserve stored metadata. Scores and membership/request rows are untouched. Its rollback reinstates the previous RPC bodies and drops the new columns, losing newly saved game metadata. The owner rollback drops only its new function.

Both proposals are outside the auto-applied migrations directory. Applying either is a live Supabase write requiring Augie's explicit yes. Review and promotion into the active migration chain, manifest/count expectations, and authorized rollout must precede full owner/game restore. No SQL in this PR has been applied to production. CI's disposable stack applies the owner proposal; green browser CI is conditional on that schema, not proof of live migration.

Existing DGTWEW/R63H7T snapshots contain no original game settings. Neither proposal can reconstruct previously discarded settings. Separately authorized resynchronization from the original organizer device is still required; this build does not backfill or modify samples, and fresh-device games/Settle up remain unverified until then.
