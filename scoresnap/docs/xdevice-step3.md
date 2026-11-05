# Account handoff (AUG-84)

All runtime behavior and native association configuration are behind
`EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=true`; real auth must also be configured.
The new migration is proposed only. Apply through the normal reviewed migration
process before enabling the feature. No live database was used for development.

Before email, Apple, Google sign-in or signup replaces a guest session, drain that
guest's outbox and refuse the switch if unresolved entries remain. Persist a random
capability before registering its SHA-256 hash using the guest session. The signed
account consumes it transactionally, and receives the same result on retry. Tokens
expire after 24 hours; consumed receipts remain retryable only by their target.
An expired unconsumed token requires returning to the original guest session to
prepare again. Keep guest device data until the success message appears.

Approved memberships transfer in place. Contest, round, player and score event IDs
never change; immutable score attribution and old operation receipts remain intact.
Account membership wins a collision, including pending/revoked membership. The
superseded guest access is revoked, so signing in cannot bypass host revocation.
Pending join requests remain pending; an existing account request wins. No guest
outbox is relabeled or replayed as an account.

Local-only guest scorecards are separately archived as private account history,
keyed by account and stable local contest ID. A contest snapshot contains its
nested tournament rounds. The account's first complete scorecard wins duplicate
IDs; never concatenate scores or dedupe by course, date, or player name. Snapshots
grant no live membership. Guest archives are a point-in-time history import;
later local-only edits are not continuous cloud sync. Live scores use the existing
sync protocol. Account deletion cascades the new history and capability rows when
the Auth user is deleted.

Both pending imports pin their destination before sending writes. Failed writes
retain local state; another account cannot finish the pending import. Sign in to
the original destination and use Retry round handoff. Sign-out still clears the
current contest store. Account deletion includes both pending storage keys.

Universal links accept only the configured HTTPS origin and exact `/r/<64 hex>`
or `/join/<6 character code>` routes. The existing custom scheme is also accepted.
Queries/fragments are discarded. Live links from PR #105 stay read-only and share
the existing token. Warm join navigation refreshes the code field.

Release prerequisites outside this offline code change:

- Build with an HTTPS origin in `EXPO_PUBLIC_WEB_URL`; share links and association
  domains must use the same host. Rebuild native binaries for new entitlements.
- Serve `/.well-known/apple-app-site-association` with the release Apple team ID,
  app ID `com.scoresnap.app`, and `/r/*`, `/join/*` paths.
- Serve `/.well-known/assetlinks.json` with package `com.scoresnap.app` and the
  release signing certificate SHA-256 fingerprint. Do not invent signing IDs.
- Test iOS and Android link verification, cold/warm launch, installed/uninstalled
  fallback, live link expiry/revocation, guest sign-in, conflicts, interruptions,
  account switch, and restoring the same account on a second device.
