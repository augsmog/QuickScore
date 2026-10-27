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
normal migration-ledger workflow. Verify catalog against the M2-only chain.
M2b down must precede M2 down; do not run M2 down under installed M2b policies.

Reapply with normal migration up workflow and verify expected-after.json and
local ledger. No default ACL, owner or service_role change needs restoration.
Live apply and later anonymous Auth enablement each require Augie's explicit
yes. CAPTCHA integration remains mandatory before enabling anonymous sign-ins.
