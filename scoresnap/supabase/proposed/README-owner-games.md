# REQUIRES LIVE MIGRATION APPROVAL

Owner discovery and own-code join need no server change: the live-baseline Owner full access policy permits authenticated owner-filtered SELECT on contests. The client then proves host access through list_join_requests and restores through sync_capabilities/fetch_snapshot. Local contest data never supplies authorization.

Games cannot be restored client-only: roundPayload previously omitted them, sync_round_bundle ignores them, and fetch_snapshot explicitly emits games: []. There is no existing remote game configuration read/write surface. The proposed SQL adds two bounded JSON columns and replaces those two RPC bodies, preserving their authorization, locking and signatures. Changed settings increment the sync revision and use the existing broadcast trigger. Legacy bundles without games preserve the stored settings. Scores and membership/request rows are untouched.

The migration is deliberately outside the auto-applied migrations directory pending approval:

- Forward: `supabase/proposed/20261031230000_restore_game_settings.sql`
- Rollback: `supabase/rollbacks/20261031230000_restore_game_settings.sql`

Rollback reinstates the exact previous RPC bodies before dropping the new columns. It loses the newly stored game metadata. No SQL in this PR was applied to production. The proposed migration must be reviewed and promoted into the active migration chain with the migration manifest and migration-count CI expectation updated before normal rollout.

Existing DGTWEW/R63H7T snapshots contain no original game settings. This migration cannot infer or recover them. After separate approval, the original organizer device's known configuration could be explicitly resynchronized; this build does not backfill, guess, or modify those samples. Until then their fresh-device games/Settle up are not verified. Owner restoration works against the existing live server, independently of this proposal.
