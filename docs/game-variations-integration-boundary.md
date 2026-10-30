# Game variations and PR #33 integration boundary

The controlling task prohibits basing on or editing PR #33, modifying Player or setup player rows, and editing tests/paywall-tiers.test.cjs. It requires minimal additive edits in types.ts and new.tsx. It does not exclude every file also present in #33. The approved scope's risk table explicitly permits: “Store additions narrowly scoped; review combined diff for #33 settings/Supabase behavior.”

This reconciles verifier r2 finding 3: the stronger blanket file exclusion used by the verification brief conflicts with the scoped store permission and is not the implementation boundary. The feature intentionally retains its contest-store.ts diff. It does not claim diff-level compliance with the blanket exclusion.

Store changes serve only rule enforcement and the required persisted inputs: round/group auxiliary namespaces, canonical shared-ball cards, pre-play/complete locks, host entitlement validation, and migration of the first round's inputs when adding a round. Removing them would break required capture/reload/settlement paths. No #33 storage-key, auth, settings, Supabase or privacy behavior is imported or replaced. This round makes no additional store edits.

Before integrating #33, retain its persisted-key import, storage key and gated storage wrapper together with these event writes. The fix-r1 report records an exact-head combined-tree run (23 suites / 150 tests passed) and its inherited #33 TypeScript diagnostics; it is historical compatibility evidence, not a claim that combined standard tsc passed. Run focused tests and standard tsc again on the actual combined integration tree. No merge or integration is performed by this fix.
