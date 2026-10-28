# Independent verification of PR #36

Commit under test: `57a695aac14cef7008c95bf42408e58185dad3de` on `snapscore/xdevice-m3-008`.
This review did not modify that branch, did not comment on PR #36, and did not connect to the hosted Supabase project.

## Environment

Disposable local PostgreSQL 16.15 on this machine only (`127.0.0.1`, peer auth, databases `m3v_*`, dropped after the run). Docker and the Supabase CLI are not installed here, so the stack is the repo's own loopback role bootstrap (`scoresnap/supabase/schema-drift/offline-bootstrap.sql`): roles `anon`, `authenticated`, `service_role` (BYPASSRLS), `authenticator`, schema `auth`, and `auth.uid()` / `auth.jwt()` reading `request.jwt.claims`. RLS was enforced by `SET ROLE`, not by the table owner.

The pre-008 database was built from `scoresnap/supabase/snapshots/live-schema.json` by loading `20261027000000_live_baseline.sql` (the DDL form of that catalog) and then the two migrations that post-date the snapshot and pre-date 008:

- `20261027120000_sync_foundation.sql`
- `20261027130000_guest_write_guard.sql`

Every column in the snapshot was present after that load. The only columns beyond the snapshot were the M2 columns (`contests.protocol`, `sync_enabled`, `sync_revision`, and `score_events.round_id`, `cell_version`, `contest_revision`, `actor`, `op_id`, `request_hash`, `action`). `hole_scores`, `contest_rounds`, and `contest_groups` were absent before 008.

PostgreSQL 16 has no `MAINTAIN` privilege. The baseline dump's grant lists include that PostgreSQL 17 token, so those tokens were stripped only while loading the baseline. Migration `20261028100000_tournament_rounds_live.sql` and its down file were applied unmodified. The hosted project was not used.

## Verdicts

| Item | Verdict |
| --- | --- |
| 1. Migration apply and backfill | PASS |
| 2. Independent security attacks | PASS |
| 3. Rollback | PASS |
| 4. Client, Jest, owner UI | PASS |
| 5. The +32,873 lines | PASS |
| 6. CI at that SHA | PASS |

## 1. Apply and backfill — PASS

`20261028100000_tournament_rounds_live.sql` applied in one transaction (`psql -1 -v ON_ERROR_STOP=1`) on the seeded database with exit code 0.

Seed before the migration, all `score_events.round_id` null:

- Alpha: contest, no score events
- Beta: contest, 3 legacy score events (two holes for one player, one hole for another)
- Gamma: contest, 2 legacy score events, `protocol = 1`
- Delta: contest, 2 legacy score events

After the unmodified migration:

| Check | Result |
| --- | --- |
| Contests including a post-migration insert | 5 |
| `contest_rounds` rows | 5, every one `round_number = 1`, `name = 'Round 1'` |
| Contests without exactly one round | 0 |
| Score events | 7 |
| Events left with a null `round_id` | 0 |
| Events whose round belongs to another contest | 0 |
| Alpha events | 0 |
| Beta events on Beta's round | 3 |
| Gamma events on Gamma's round | 2 |
| Delta events on Delta's round | 2 |
| `to_regclass('public.hole_scores')` | null |
| Versioned events (`cell_version` set) | 0 |
| `is_tournament` rows | 0 |
| Trigger `m3_default_round` | present |
| Constraint `score_events_round_fk` | present |
| Echo, inserted after the migration | 1 round, number 1, name `Round 1` |

`sync_round_bundle(uuid,jsonb)`, `set_tournament_meta(uuid,boolean,integer)`, `write_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text)`, and `tournament_snapshot(uuid)` all exist after the migration.

The two-round guard cannot see two rounds during a single unmodified apply: the migration creates `contest_rounds` and inserts round 1 before the backfill update, so every pre-existing contest has exactly one round at that moment. To reach the `count(*) = 1` predicate, the same statements were run in one transaction with one extra insert between the default-round insert and the score update: Delta received round 2 (`Championship`) before the update. Result:

- Delta rounds: `1,2`
- Delta's 2 events stayed `round_id` null
- The other 5 events were set to their own contest's round 1
- Cross-contest matches: 0
- `score_events_round_fk` validated (`convalidated = true`)

A contest that already has only the default round-1 shell also rolls back cleanly (see item 3). That shell case is separate from the two-round backfill.

## 2. Security — PASS

Attacks were written for this review and run as `anon` or `authenticated` through `SET LOCAL ROLE` plus a JWT claim. The author's `m3-acl.sql` was not executed. Each denial below has a matching allowed call, so the function was reachable and the denial is the authorization check.

Synthetic users only (`*@example.test`). No hosted data.

### Non-host approving a join

| Caller | Call | Result |
| --- | --- | --- |
| Authenticated stranger | `request_join('SYNCC1','Pat')` | allowed, row stayed `pending` |
| Stranger | `decide_join_request(..., true, ...)` | `42501 HOST_REQUIRED` |
| Approved scorer | same request | `42501 HOST_REQUIRED` |
| Anonymous stranger | same request | `42501 HOST_REQUIRED` |
| Anonymous owner of Anon Cup | `decide_join_request` on their own pending request | `42501 HOST_REQUIRED`, request stayed `pending` |
| Real non-anonymous host | `decide_join_request` on the Sync Cup request | allowed, `approved`, `decided_by` is the host |

### Scorer writing outside scope or player

| Caller | Target | Result |
| --- | --- | --- |
| Scorer scoped to Group A | Cam in Group B, `write_score` | `42501 FORBIDDEN` |
| Scorer scoped to Group A | Ada, but a round id from another contest | `22023 ROUND_NOT_READY` |
| Scorer scoped to Group A | Ada in Group A | allowed, `cell_version = 1` |
| Approved player Ada | Cam, `write_score` | `42501 FORBIDDEN` |
| Approved player Ada | Bea, `write_score` | `42501 FORBIDDEN` |
| Approved player Ada | Ada, `write_score` | allowed |
| Approved player Ada | direct `INSERT` of Cam's legacy row | `42501` violates restrictive policy `m3_score_player_scope` |
| Same player | direct `INSERT` of their own protocol-0 row (`round_id` null) | allowed |
| Scorer after `round_scorer_scopes.status = 'revoked'` | Bea, `write_score` | `42501 FORBIDDEN` |

The only new score rows were the two allowed versioned writes (Ada holes 1 and 2) and the one allowed legacy self-insert.

### Anonymous host

The Anon Cup owner called with `is_anonymous: true`:

| Call | Result |
| --- | --- |
| `sync_round_bundle` | `42501 HOST_REQUIRED` |
| `set_tournament_meta(..., true, 1)` | `42501 HOST_REQUIRED` |
| `write_score` | `42501 FORBIDDEN` |
| `tournament_snapshot` | `42501 FORBIDDEN` |

`is_tournament` stayed false. The contest still had only the trigger-created round 1.

### Watch token, revoked link, expired link

A live read token, an expired token, and a revoked token were inserted into `share_links` (sha256 of synthetic 64-hex tokens). The readable snapshot hung off a protocol-0 contest because the existing M2 trigger `guard_sync_legacy` rejects `published_rounds` writes when `protocol = 1`. That is pre-008 behavior. The write calls were still made against both contests.

| Caller | Call | Result |
| --- | --- | --- |
| `anon` with the live token | `get_shared_round` | allowed |
| `anon` | `write_score` | `42501 permission denied for function write_score` |
| `anon` | `tournament_snapshot` | `42501 permission denied for function tournament_snapshot` |
| Authenticated user with no membership | `write_score` | `42501 FORBIDDEN` |
| Authenticated user with no membership | `tournament_snapshot` | `42501 FORBIDDEN` |
| `anon` | expired token | `P0001 expired link` |
| `anon` | revoked token | `P0001 revoked link` |
| `anon` | unknown token | `P0001 invalid link` |
| `anon` holding the expired token | `write_score` | `42501 permission denied for function write_score` |
| Non-anonymous host | `tournament_snapshot` on their contest | allowed |

Execute privileges after 008: `anon` can execute `get_shared_round` and cannot execute `write_score`, `tournament_snapshot`, `sync_round_bundle`, or `m3_score_insert_allowed`. `authenticated` can execute the write RPCs; the function bodies then reject watchers.

### Cross-contest `round_id`

Composite foreign key `(round_id, contest_id) → contest_rounds(id, contest_id)`:

| Attempt | Result |
| --- | --- |
| `score_events` insert with Sync Cup's contest and Anon Cup's round | `23503`, key `(round_id, contest_id)` not present in `contest_rounds` |
| `contest_groups` insert with Anon Cup's contest and Sync Cup's round | same `23503` |
| `service_role` (bypasses RLS) inserting the same mismatch | same `23503` |
| Host `write_score` passing the other contest's round id | `22023 ROUND_NOT_READY` |
| Rows whose round contest differs from the event contest | 0 |

### RLS on the new tables

`contest_rounds`, `contest_groups`, `round_player_assignments`, `round_scorer_scopes`, `group_submissions`, and `sync_id_map` each have `relrowsecurity = true`, `relforcerowsecurity = true`, and zero policies.

`has_table_privilege` for `anon` and `authenticated` is false for SELECT, INSERT, UPDATE, DELETE, and TRUNCATE on all six.

Direct `SELECT`, `INSERT`, and `TRUNCATE` as `anon` and as the authenticated host each returned `42501 permission denied for table ...`. Row counts were unchanged (3 rounds, 2 groups, 3 assignments).

## 3. Rollback — PASS

### Empty shell

Catalog dumped after M2+M2b and before 008, then 008 applied, then `20261028100000_tournament_rounds_live.down.sql`. The down file exited 0 and `COMMIT`ted.

The post-down catalog matched the pre-008 catalog on every dumped line (columns with types, defaults, and nullability; constraints; index definitions; policies; function identity plus `md5(prosrc)` and config; triggers; table grants; RLS flags). Difference count: 0 lines only-before, 0 lines only-after.

After the down file:

- `contest_rounds`, `sync_round_bundle`, and `tournament_snapshot` are gone
- `contests.is_tournament` and `current_round` are gone (0 columns)
- `score_events.round_id` remains (1 column), which is the M2 column
- policy `m3_score_player_scope` is gone
- `write_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text)` remains, and its body hash matches the pre-008 function because the catalog diff is empty

A second shell with one contest and only the trigger-created round 1 also rolled back with exit 0. The contest row remained, `contest_rounds` was gone, and `is_tournament` was gone.

### Populated database

After 008, one contest was marked `is_tournament`, given a group, and given a versioned `score_events` row (`cell_version` and `round_id` both set). The down file stopped with:

```text
ERROR:  M3_DOWN_UNSAFE
```

Exit code 3. The transaction did not drop the M3 objects. After the failure: `contest_rounds` still present, 1 group, `is_tournament` still true, 1 versioned scored row, `is_tournament` column still present, `sync_round_bundle` still present.

## 4. Client, Jest, owner UI — PASS

`scoresnap/src/services/tournament-sync.ts` at this SHA calls only:

- `supabase.rpc('sync_round_bundle', { contest_id, payload })`
- `supabase.rpc('set_tournament_meta', { contest_id, is_tournament, current_round })`
- `supabase.rpc('write_score', args)`

`resolveWrite` in `tournament-sync-plan.ts` sends `contest_id`, `round_id`, `player_id`, `hole`, `action`, `strokes`, `expected_version`, `op_id`, and `request_hash`, which are the `write_score` argument names. Those three functions exist after the migration. The file contains no `.from(`, `.insert(`, `.upsert(`, `.delete(`, `contest_groups`, or `hole_scores`.

`public.hole_scores` does not exist after the migration. `scoresnap/src/db/schema.ts` still has a local SQLite `hole_scores` table. That file is unchanged in this commit and `tournament-sync.ts` does not write to it.

Jest at this SHA, from `scoresnap/` with `npx jest --ci`:

```text
Test Suites: 22 passed, 22 total
Tests:       361 passed, 361 total
```

Owner UI files have an empty diff from `92b6c9b` (main at review time) to `57a695a`. That includes `app/contest/[id]/scorecard.tsx`, `app/contest/[id]/_layout.tsx`, `src/ui/LiveShare.tsx`, `src/ui/ContestJoinCode.tsx`, `src/ui/gameSheetStyle.ts`, `app/(tabs)/index.tsx`, and `app/auth/sign-in.tsx`.

The rules still in that unchanged source:

- Big hole header: `HOLE` at `fontSize: 40` in `scoresnap/app/contest/[id]/scorecard.tsx`.
- Share and join UI: `LiveShare` and `ContestJoinCode` return `null` when `CROSS_DEVICE_SHARING_ENABLED` is false, and the home and sign-in join controls are rendered only inside that flag. A `null` return and a short-circuit render mount no view, so they take no space.
- Pinned contest header (`testID="contest-header"`): padding top 8, one control row about 36–38, margin 12, tab row about 36, padding bottom 12. That always-visible block is about 106 points, under 120. The optional team banner in the same view is also unchanged. This was measured from the style values, not from a booted Expo viewport.
- Game-mode sheets: `GAME_SHEET_STYLE` has a 1px top, left, and right border in `COLORS.sheetBorder` (`rgba(23, 92, 58, 0.30)`), upward shadow (`shadowOffset.height` -4, `shadowOpacity` 0.12, `shadowRadius` 12), and `elevation` 12. `tests/game-sheet-style.test.cjs` asserts that and passed inside the 361.

## 5. The +32,873 lines — PASS

`git diff --numstat 92b6c9b...57a695aac14cef7008c95bf42408e58185dad3de` is 32,873 additions and 175 deletions across 16 files.

| Lines | File |
| ---: | --- |
| 24,200 | `scoresnap/supabase/schema-snapshot/expected-m3.json` |
| 7,137 | `scoresnap/supabase/snapshots/live-schema.json` |
| 1,536 | the other 14 files |

The two catalogs are 31,337 lines, 95.33% of the additions. `live-schema.json` is a catalog taken `2026-10-27T00:45:19Z` (server 17.6): columns, constraints, indexes, policies, function source, grants, and the seven migration versions already on the live ledger. `expected-m3.json` is the same kind of catalog after M3 (336 columns, 36 functions, role names `anon` / `authenticated` / `authenticator` / `service_role`). Neither file contains row data.

Secret and personal-data scan of both catalogs plus the migration, down file, client, and new tests:

- no `eyJ` JWTs, `supabase.co` URLs, `postgres://` URLs, `AKIA` keys, Stripe keys, private keys, `sb_secret`, `password=`, or API-key assignments
- no email addresses and no phone numbers
- `INSERT INTO` strings inside the snapshot are SQL text stored in function definitions (8 of 22 functions), not loaded user rows
- grants and role memberships name only `anon`, `authenticated`, `authenticator`, `service_role`, and `postgres`

The other 1,536 additions are the migration (468), the down file (84), `reference-guard.py` (230), `m3-acl.sql` (253), `tournament-sync-plan.ts` (194), the `tournament-sync.ts` rewrite (138 added), `tournament-sync.test.cjs` (82), and the smaller drift-script edits.

## 6. CI — PASS

All four GitHub Actions runs for `57a695aac14cef7008c95bf42408e58185dad3de` completed with conclusion `success`:

- Schema drift: https://github.com/augsmog/QuickScore/actions/runs/40603648433
- Tournament E2E: https://github.com/augsmog/QuickScore/actions/runs/40603648416
- Web smoke: https://github.com/augsmog/QuickScore/actions/runs/40603648584
- iOS boot smoke: https://github.com/augsmog/QuickScore/actions/runs/40603648494

No failing check was recorded for that SHA.
