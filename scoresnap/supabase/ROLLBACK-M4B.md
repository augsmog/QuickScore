# M4b sync_api rollback and verification

This PR authors SQL only. It does not apply to live, change Auth configuration,
merge M4a, or close the M4b integration milestone. Keep the client sharing flag OFF.
Version `20261029180000` follows the committed eleven-entry live ledger ending in
`20261028162155`. `live.json` is normalized and contains no ledger array; the
separate `schema-drift/expected-ledger.json` is the live ledger fixture.
`expected-pending-ledger.json` adds this pending migration. No remote ledger or
Management API was queried in this run.

Before enrollment, run the paired schema down on an explicitly disposable target:

```
psql "$DISPOSABLE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/rollback/20261029180000_sync_api.down.sql
```

Down locks the guard tables before checking safety, refuses `M4B_DOWN_UNSAFE` if
any protocol-1 contest, versioned event or receipt exists, and restores exact M3
routine definitions/ACLs. It removes only M4b functions, triggers and Realtime
policies. It never deletes accepted events, receipts, rounds or memberships.
After successful down, remove only this version's ledger entry through the
normal reviewed ledger workflow. M4b down precedes M3, M2b and M2 down.

After enrollment or accepted writes, use
`rollback/20261029180000_sync_api.pause.sql` instead. It atomically disables
protocol-1 mutations and enrollment, revokes client execution of mutation RPCs,
and disables revision notifications. It retains strict policies, sanitized
snapshots, all scores/receipts and the applied ledger. This is operational pause,
not schema down. Do not run the destructive historical rollback-008 draft.
Fix forward with a later reviewed migration; re-enable only after verifier and
integration receipts. A code revert alone does not undo database changes.
No live action is authorized by this build brief.

## API contract

- Frozen `write_score(uuid,uuid,uuid,int,text,int,bigint,uuid,text)` remains cell CAS.
  `submit_score` adds `expected_revision bigint` as argument 10; non-NULL values
  also CAS the contest revision. Frozen calls use NULL for event revision.
  Set writes 1–15; clear writes NULL and increments cell version. Conflicts are
  receipted and immutable. Changed payload/op reuse fails. Revocation is checked
  under the contest lock before returning even an old receipt.
- `fetch_snapshot(contest_id, after_revision=0)` returns a full allowlisted
  round/player/cell snapshot, including clear versions; future cursors fail.
  It excludes course/location/contact/account fields and game units. Approved
  viewers receive the same names/scores projection. Reads remain available when
  sync is paused. `tournament_snapshot` preserves its frozen shape.
- `request_join`, `list_join_requests`, `decide_join_request`, `my_membership`
  retain their signatures. Host approval transfers the stable slot, revokes the
  prior membership and scorer scopes, clears old legacy bindings, and increments
  revision. Pending requests never grant a roster. `revoke_membership` revokes
  membership/scorer scopes and legacy bindings under the same lock.
- `sync_capabilities` returns current authorized protocol/flag/revision.
  `enroll_contest` is real-host-only and supports empty pilot events. Nonempty
  historical events/arrays/publications require a reviewed importer and are
  refused, never silently collapsed. Client flags/allowlisting remain integration
  responsibilities; this PR does not enroll any event.
- Legacy flags-off publish/get/watch/chat signatures remain. New watch tokens use
  32 CSPRNG bytes. Spectator `games` is always `[]`. Accepted scores synchronously
  rebuild the default-round array and published compatibility snapshot. Protocol-1
  watch fetches read the canonical projection after versioned writes. Old uploads
  cannot replace enrolled data. Unrelated putts remain unchanged.
- Private topic `snapscore:<contest UUID>` / event `revision`, payload exactly
  `{ "revision": <integer> }`. Receive checks current membership; client sends
  to this topic are denied even in the presence of other permissive policies.
  Previously connected sockets may cache authorization: hints carry no scores or
  identities, and every fetch/write rechecks current membership. Real transport
  delivery/disconnect behavior is still unverified.

## Local proof and remaining gates

`bash supabase/schema-drift/m4b-local.sh` uses native PG17, role/JWT claims and
Auth/Realtime SQL emulation in `/tmp/m4b-XXXX`; all clusters/temp trees are removed.
It checks full up/down, catalog/ledger parity, legacy/guest/M3/API suites, policy
and ACL mutation kills, unsafe no-lock red versus safe CAS green, both-order
revoke/transfer/fetch races, down waiting/refusal and operational pause preserving
accepted data. The hosted CI job separately checks real schema apply/catalog and
API SQL; native-only Broadcast capture assertions are explicitly excluded there.
Neither job alone proves real Auth sessions or socket delivery.

M4b integration after M4a exit must still exercise four real independent Auth
identities, offline replay/lost responses and tombstones across rounds, actual
Realtime/PostgREST and reconnect/revocation, native persistence, old binary
compatibility, group submission/finalization race APIs, bounded join/write abuse
budgets and invite/session expiry, and the nonempty import/enrollment contract.
No final integration or production readiness is claimed here. Independent SQL
verification and CI receipts are required before promotion.

The receive-only policy and cached-channel caveat follow the official
[Realtime authorization contract](https://supabase.com/docs/guides/realtime/authorization).
The table/function surface is documented in
[Realtime concepts](https://supabase.com/docs/guides/realtime/concepts).
