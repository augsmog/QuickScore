# AUG-559: share-rate observability audit

Reviewed QuickScore `origin/main` at `598c142dda4fbacbf7f89d8c746ab430ba957618` on 2026-11-04. This report is a source audit and proposal only; no live Supabase database was read or changed.

## Surface inventory and durable evidence

| Surface | Classification | Source evidence |
| --- | --- | --- |
| `scoresnap/src/ui/LiveShare.tsx` | Link created is durably recorded. The UI calls `createLiveLink`, then shares or copies the returned URL; sheet completion itself is client-only. | `LiveShare.tsx:84-96` |
| `scoresnap/src/ui/ContestJoinCode.tsx` | Invite share/copy is client-only intent. Producing a join URL/code in this component does not write a share event. | `ContestJoinCode.tsx:70-98` |
| `scoresnap/src/services/share-scorecard-pdf.ts` | Client-only intent / OS handoff. The implementation documents resolution as sheet closure or download dispatch, not proof that a recipient received the PDF. | `share-scorecard-pdf.ts:8-9, 14-26, 28-47` |
| `scoresnap/app/contest/[id]/settlement.tsx` | Native text share, PDF share, and recap share are client-only intent. `share_tapped` is emitted from the client analytics helper; it is not a durable Supabase record in the audited schema. | `settlement.tsx:113-115, 191-196, 234-237, 310-313`; `src/services/analytics.ts`; `src/services/analytics-web.ts` |
| `public.share_links` and its RPCs | `create_share_link` durably creates a hashed link row, so **link created** is observable. The table has no `created_at`, open count, or last-open time. Token validation and `get_shared_round` read the row without recording an open; round completion only adjusts expiry. Revocation updates `revoked_at`, which records revoke state only. | `20261027000000_live_baseline.sql:276-281, 484-512, 534-549, 708, 765-777` |
| `public.contest_join_requests` | Server-observed join request (intent), including requester and `created_at`; not a completed share or accepted join by itself. | `20261027120000_sync_foundation.sql:31-37, 88-100` |
| `public.contest_memberships` | An approved non-host membership is a server-observed non-organizer join and is used as the observable **confirmed completion** proxy. It does not prove that a particular share link caused the join. | `20261027120000_sync_foundation.sql:20-30, 118-135` |

## Definition and limits

The denominator follows the existing proposed first-finish/cohort contract: one `first_round_finishes` record per non-anonymous account, grouped by the Los Angeles date of `finished_at`, excluding `analytics_cohort_exclusions`. The first-finish proposal records `contest_id`, and the retention proposal establishes the non-anonymous/exclusion pattern (`20261103170000_first_round_finished.sql:2-10, 41-57`; `20261104090000_activation_retention.sql:2-5, 16-25`). This is the currently available first-round completed-round cohort, not a count of every later round.

The view resolves local-first and published-first finishes through `published_rounds`: its join matches either finish UUID or the local ID text, then safely casts UUID-shaped `local_id` values at `scoresnap/supabase/proposed/20261104110000_activation_share_rate.sql:8-18`. The membership, request, and link checks match the finish ID, published ID, and mapped local UUID at lines 21-38. Invalid/non-UUID `local_id` strings map to NULL and are ignored. The disposable fixture at `scoresnap/scripts/ci/test-activation-share-rate.sql:34-61,72-91` covers local-first plus published-first, puts published-first membership/request signals on both IDs, and checks it contributes one round. Even after identity resolution, a server join may arrive via another path, so it cannot prove a specific share link caused the join. Client share-sheet intent remains `NULL` (unknown), never inferred.

The minimum producer proposal for exact completion and attribution is an append-only server-side share event record written by the recipient-facing open/join path, keyed by contest and an opaque link identifier, with server timestamp and non-organizer identity (or an appropriately privacy-preserving stable actor key). It should record link opens independently from membership decisions. Client share-sheet intent would require a separate event and cannot be confirmed by server evidence. Neither producer change is implemented here.

## Proposed artifact

`scoresnap/supabase/proposed/20261104110000_activation_share_rate.sql` adds `round_share_rate`; its rollback drops only that view. The view exposes eligible denominator, confirmed numerator and rate, server join-request intent rounds, created-link rounds, and a `NULL` client-intent count. Access is service-role-only, matching the activation proposals. No live apply is included.

The disposable fixture seeds confirmed, link-only, excluded, and no-share rounds plus a pending join request. It also seeds `published_rounds` with distinct server contest IDs and local-ID mappings so link lookup exercises the production identity split. All cohort finishes share one timestamp to remain deterministic across timezone boundaries. It asserts numerator/denominator, separation of server request and created-link signals, unknown client intent, and service-role access. The activation-candidate workflow applies the proposal, runs that fixture, rolls it back, and reapplies it on the disposable stack.
