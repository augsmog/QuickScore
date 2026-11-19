# SnapScore sync contract v1 — frozen Oct 29, 2026

Contract identifier `snapscore-sync-v1`, API version 1. SQL source:
`scoresnap/supabase/migrations/20261029180000_sync_api.sql`.
Existing M3 signatures and return fields remain compatible. Additive client wire
types live in `sync-contract-v1.ts` (no runtime dependency). Breaking changes need
a new version. All RPC calls use the current real Supabase session; no actor
argument, code-as-authorization, or client service key.

## Discovery

`my_sync_status()` has no arguments. Returns `{api_version:1,memberships:[],requests:[]}`.
Membership entries are `{contest_id,role,status,player_id}` and include only the
caller's rows, including pending/revoked rows. Requests are
`{request_id,status,contest_id}` and include only the caller's requests.
A request's contest_id is null unless the caller currently has an approved
membership in that contest. No roster, requested names, host identity, other
requesters, invite codes or private event metadata are returned. No JWT identity:
SQLSTATE 42501 AUTH_REQUIRED. Empty results are ordinary success.

New phone: `request_join(code,name)` still returns generic pending even for an
invalid code. Poll discovery while foreground. Pending request IDs identify only
one's own requests; they grant no event access. Approval exposes the contest UUID
through the approved membership. Fetch capabilities then full snapshot. Rejection
and revocation never grant reads. Discovery is a point-in-time status, not a grant:
every subsequent RPC rechecks authorization under the contest lock.

## Handshake and snapshot

`sync_capabilities(contest_id uuid)` returns
`{api_version:1,contract:"snapscore-sync-v1",protocol,enabled,revision,channel}`.
`enabled` is true only for protocol 1, active status and server sync_enabled.
Client remote writes require build flag AND supported contract/protocol AND
server enabled. A false result preserves outbox drafts; do not discard or rebase.
Protocol-0 enrollment remains explicit host-only `enroll_contest(uuid,bigint)`;
this handshake does not promise import eligibility. Unauthorized/missing event:
42501 FORBIDDEN (same response). `enabled` is not an authorization token.

`fetch_snapshot(contest_id uuid,after_revision bigint=0)` returns a consistent full
snapshot, even if the cursor is current; negative/null/future cursors fail 22023
INVALID_REVISION. It retains protocol/revision/completed/games/rounds and adds:

- contest_id, name, course, capabilities (same handshake as above), id_map.
- rounds: id, number, name, date, course, assignment_revision, groups, players.
- groups: id, name, sort_order. Players: id, displayName, handicap, status, team,
  group_id (null if unassigned), cells. Cells: hole (1–18), version, strokes.
- id_map: kind (round/group/player), local_id, server_id, scoped to this contest.

Course uses round course_data or contest course when absent; only name and holes
(num/par/hcp/yards) are projected. No arbitrary provider/location extensions.
An empty/incomplete legacy course remains empty/incomplete: client requests manual
course repair and must not invent pars. Canonical scorecard keys are server
contest/round/player UUID plus hole. Local mappings seed identity caches, never
authorization. Unassigned players remain in the roster; group_id supplies explicit
round assignment. Scorer write scope remains enforced by the server.
All 18 cells are present: no event = version 0/strokes null; clear = version >0/
strokes null. Map null to UI zero only at the rendering boundary; retain the
version for CAS. games is always []. No cross-round score aggregation in this
response. Commit snapshot and revision together before overlaying queued drafts.
`tournament_snapshot(uuid)` remains the M3 shape; use fetch_snapshot for v1 repair.

## Private revision transport

Channel topic is exactly `snapscore:<lowercase canonical contest UUID>`; no
`private:` prefix in the Supabase channel argument. Subscribe with
`supabase.channel(topic,{config:{private:true}})`, listen to Broadcast event
`revision`; payload is exactly `{revision:integer}`. The channel object in the
handshake is `{topic,private:true,event:"revision"}`. Never put scores, credentials,
identities or roster data in hints. Client sends to snapscore topics are forbidden
by restrictive INSERT policy, including when another permissive policy exists.
SELECT requires authenticated JWT + protocol 1 + non-anonymous owner or current
approved membership. Exact topic equality rejects malformed/foreign topics.

Subscribe acknowledgement then fetch closes the initial race. Duplicate/old hints
are ignored; a newer hint triggers authorized fetch, never changes a score itself.
Poll at 30 seconds only while foreground when notifications are unavailable.
Reconnect renews session, subscribes/acks and fetches before replay. SQL permission
revocation blocks future reads/writes/replays immediately. Realtime authorization
may be cached on an existing socket: actual disconnect/re-auth latency remains an
integration gate. Hints carry only revisions during that interval. No transport
proof is claimed by the native SQL stub tests.

All RPC responses are private session data: client must exclude them from shared
caches/telemetry and clear current remote views after denial or identity change.
HTTP no-store headers/PostgREST and actual socket/Auth behavior require integrated
stack verification; SQL alone does not assert those headers or delivery.
