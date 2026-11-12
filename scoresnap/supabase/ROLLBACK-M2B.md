# Roll back M2b

Code: revert the M2b commit (or `git revert -m 1 <merge-commit>` for a merge),
review and ship the resulting application/schema source change. A code revert
does not undo database changes.

Database: obtain Augie's explicit yes for live, back up and capture catalog and
ledger, then execute rollback/20261027130000_guest_write_guard.down.sql on the
intended target. It runs transactionally, removes only m2b_ policies and restores
exact M2 client grants, including the original vulnerable profile/guest paths.
Keep anonymous sign-ins disabled, or disable them before rollback if enabled.
Only after successful down repair version 20261027130000 to reverted using the
normal migration-ledger workflow. Verify catalog against the M2-only chain
(nine ledger rows: seven historical markers + live_baseline + sync_foundation),
rather than expected-after.json, which describes the M2b physical schema.
Migration rows are omitted from that normalized snapshot and checked separately;
there is no dedicated nine-row ledger mode in drift.py.
M2b down must precede M2 down; do not run M2 down under installed M2b policies.

Reapply with normal migration up workflow and verify expected-after.json and
the ten-row local ledger (seven historical markers + `20261027000000 live_baseline` +
`20261027120000 sync_foundation` + `20261027130000 guest_write_guard`).
No default ACL, owner or service_role change needs restoration.
Live apply and later anonymous Auth enablement each require Augie's explicit
yes. CAPTCHA integration remains mandatory before enabling anonymous sign-ins.

Fix round 3: M2b introduces no permissive roster DELETE policy, so M2's
filtered player DELETE behavior is unchanged in both directions. Down removes the presentation column UPDATE grant
and restores table INSERT/UPDATE on profiles. For each role and relation it
restores the prior TRUNCATE/REFERENCES/TRIGGER grants from live.json, except on
contests, contest_players and score_events where M2 had already revoked them.
This includes the four analytics views' ACL entries. It does not grant anything
on previously ungranted tables or touch service_role. Rollback reopens TRUNCATE
on settlements and analytics tables for both client roles, in addition to the
original guest and entitlement write holes; assess that exposure before live use.

Offline verify-foundation.py records the M2 catalog before apply and compares it
to the down result exactly, then verifies baseline rollback and full reapply.
The CI mutation suite rolls back its own mutations independently; do not use a
migration down to clean up mutation tests.
