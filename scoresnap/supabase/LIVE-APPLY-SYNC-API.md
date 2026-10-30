# Live sync_api candidate — box runbook

This build performs no live writes. Owner approval: SNAPSCORE-XDEVICE-LIVE-20261030, Augie, Oct 30 2026 1:27 PM PT: “Yes, deploy live cross-device sync for SnapScore”. Box applies only after independent verification and green exact-head CI. Project: `pltgbizexllikiwryozm`.

## Preflight

Use the postgres capture `/workspace/aos-state/backups/snapscore-syncapi-apply-20261030T133145/live-catalog-before-v2.json`; disregard v1. It has 629 table grants and 131 routine grants. The live ledger has exactly 12 rows ending `20261028223000 account_purge`. Counts at capture: contests, protocol-1 contests, score_events and memberships all zero; profiles two. Refresh these immediately before applying.

From the reviewed candidate checkout:

```sh
bash scoresnap/supabase/schema-drift/preapply-check.sh /path/to/fresh-postgres-catalog.json
python3 scoresnap/supabase/schema-drift/syncapi-request.py apply > /tmp/syncapi-request.json
```

Require `Guard passed.` Capture with `catalog-query.sql` as postgres inside `BEGIN; SET TRANSACTION READ ONLY; ... COMMIT;`, as for prior live.json captures. Management API read_only cannot see information_schema grants and is unsuitable for exact catalog comparison. Review the generated request: it contains one transaction, migration SQL followed by the ledger INSERT, including `version`, `name`, and `statements` (the original migration as a text-array element), then schema-cache reload. No nested COMMIT is retained. Do not reapply account_purge.

## Apply (box only)

Use the existing Management API credential in `SUPABASE_ACCESS_TOKEN`; never echo it or enable shell tracing. POST the generated body:

```sh
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/syncapi-request.json \
  https://api.supabase.com/v1/projects/pltgbizexllikiwryozm/database/query
```

The single transaction is atomic; a duplicate ledger version fails and rolls back. On an ambiguous HTTP result, inspect catalog and ledger before retrying. Retain a reviewed backup and the response privately.

## Verify before client deploy

Fresh postgres read-only catalog capture, then:

```sh
python3 scoresnap/supabase/schema-drift/drift.py compare scoresnap/supabase/schema-snapshot/expected-after-syncapi.json /path/to/after.json
python3 scoresnap/supabase/schema-drift/drift.py ledger /path/to/after.json --mode pending
```

Both must pass; ledger must have exactly 13 rows, with sync_api last. `expected-after-syncapi.json` is generated from the local 13-row PG17 chain with the same normalization and explicit platform-extension injection as prior fixtures. The complete migration-chain catalog and rollback comparisons include all purge definitions and ACLs, plus the host stamp in sync_round_bundle. sync_api never replaces those functions. Spot-check via a read-only SQL query (Management API is sufficient for pg_catalog ACLs):

```sql
SELECT r, sig, has_function_privilege(r,sig,'EXECUTE') AS allowed
FROM (VALUES ('anon'),('authenticated')) roles(r)
CROSS JOIN (VALUES ('public.fetch_snapshot(uuid,bigint)'),
 ('public.enroll_contest(uuid,bigint)'),('public.purge_account(uuid)'),
 ('public.sync_round_bundle(uuid,jsonb)')) funcs(sig);
```

Expected: anon false for all; authenticated true for fetch_snapshot, enroll_contest and sync_round_bundle, false for purge_account. All six purge helpers stay service_role/postgres only. Require a signed-in unrelated identity to get SQLSTATE 42501 / FORBIDDEN on fetch_snapshot and no private realtime payload; local m4b-api/m5-security and hosted four-identities exercise this. Run the two-context browser test before declaring client acceptance.

## Rollback

Before any enrollment, build `syncapi-request.py down` and POST using the same endpoint. It runs down.sql and deletes only the sync_api ledger row in one transaction. The down file refuses unsafe rollback after enrollment/accepted data; never bypass this guard. Capture again: catalog must match live.json and ledger must return to the exact 12-row live chain. account_purge remains applied.

After enrollment, build `syncapi-request.py pause` and POST. It retains the 13-row ledger, accepted data, authorized reads, purge functions and host attribution; it disables protocol-1 writes, joining, enrollment and revision broadcasts. Do not delete the ledger row. Retain client drafts and fix forward; re-enabling needs a separately reviewed recovery change.

## Client flow and live Auth

Build with `EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=true`, real live Supabase URL/public anon key, and offline mode false. Keep live anonymous sign-ins OFF and captcha OFF. Signed-in host: New Contest → enter host plus second player → Next → choose a free game → Next → Start Contest → Enable online sharing. New contests use UUIDs accepted by PostgreSQL. Older local IDs receive explicit new-round/import-review guidance. This explicit action creates an empty protocol-0 remote contest, calls enroll_contest with the server revision, then sync_round_bundle for each round, and restores the host snapshot. Existing nonzero scores fail visibly with import-review guidance. Failures leave the local round available and offer retry; no enrollment success is displayed until the server snapshot is restored.

The header shows the six-character join code and Copy / share invite after enrollment. Web links use `/join/<code>`; native shares `snapscore://join/<code>`. A second user signs in with email/password or Apple, opens the link (or Home → Join with code), enters display name, and taps Find contest. The request reveals no roster. Host opens Online sync → Retry sync → Approve as <player> and confirms the transfer. B's join screen discovers the approved round and assigned scorecard; no separate claim is required after approval. Host enters hole 1 on the scorecard. Versioned write_score queues/replays the edit; private Realtime sends a revision hint, followed by authorized fetch_snapshot. Foreground polling fallback is 30 seconds, so the <=20-second browser criterion needs working Realtime. Reconnect and foreground also trigger discovery/replay.

When anonymous Auth is disabled, missing-session join attempts show “Guest sign-in unavailable. Sign in with email or Apple, then reopen your invite.” The join screen has an explicit sign-in link. No silent local-only fallback occurs. The client does not change Auth configuration. Email confirmation/provider configuration remains the box's existing setup.

## Browser proof

Existing Playwright dependency; no installation required:

```sh
BASE_URL=http://127.0.0.1:8089 OUT_DIR=/tmp/xdev-browser \
  node scoresnap/e2e/xdevice-two-context.mjs
```

Provide XDEV_A_EMAIL, XDEV_A_PASSWORD, XDEV_B_EMAIL, XDEV_B_PASSWORD securely in the environment. Use two dedicated test users and an empty test account B; never log credentials. Screenshots precede credential entry. `XDEV_SIGNIN_ONLY=1` explicitly permits a sign-in-only smoke when credentials are absent; that result is not full browser acceptance. Local native SQL/Auth/Realtime stubs are not real socket proof. Local full Supabase is unavailable on this worker (no Docker/CLI); hosted xdevice-four-identities supplies the real disposable stack gate.

## SQL SHA256

The privacy-branch migration is byte-identical to the content embedded in the live wrapper, not to the whole wrapper. The wrapper adds its transaction and ledger INSERT. Main PR #33 is merged, including account deletion and edge functions. Its paired down file is byte-identical to the candidate and is retained for historical migration-chain CI to peel account_purge before testing M3/M2.

- `migrations/20261028223000_account_purge.sql`: `b3a686f382f73495767137393921c8be822835f85f7d76c7958001e0a8c75f70`
- `migrations/20261029180000_sync_api.sql`: `674b4fff7b65a1baeee47343d665f56dacc2705ed1aa53280257379f7a1f2c94`
- `rollback/20261028223000_account_purge.down.sql`: `85c81e585e13bc3b746bb0063bbdfc2854c806ef1220e0471ebdb7630960f41f`
- `rollback/20261029180000_sync_api.down.sql`: `596986319da7c3dfa25149f30812430d836c1a720fedbbab546a61b5ea4996fc`
- `rollback/20261029180000_sync_api.pause.sql`: `a3f2cf6f2aabc8e747f3c8286f933bce9177d6f3c965ea6a118559cf672f20d4`
- `schema-drift/catalog-query.sql`: `24562a0f4149820de795631c2c43e9f1fddd2d5c07c1c2ad6298e1334cfdbbb5`
- Exact live account_purge wrapper: `b8d5238c1118bfee2e2db9cfeac8c4883982f476d32aee61c707dfc9525a6400`
