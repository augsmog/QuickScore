# M2 port offline verification receipt

Verified in the isolated clone against final-candidate M1 9023862, using
`/usr/lib/postgresql/17/bin` (PG17). No network, live DB, Docker, hosted Auth
change, remote push or source-ref update was performed. Edits are restricted to
scoresnap/ and .github/workflows/.

Historical M2-only commands and results (before M2b and adopted-live preflight):

- `python3 scoresnap/supabase/schema-drift/verify-foundation.py --record`:
  passed; explicitly regenerated expected-after.json with the new catalog query,
  hosted role attributes/memberships, platform default ACLs and offline extension
  inventory emulation. Baseline prefix, down and reapply matched exactly.
- `bash scoresnap/supabase/schema-drift/verify-offline.sh`: passed, including
  every M1 JSON/SQL mutation and preapply rejection, role/member mutations, ledger,
  and all M2 SQL suites. Final output is below.
- `python3 scoresnap/supabase/schema-drift/verify-foundation.py`: passed again
  after adding pending-without-membership, replica identity/publication and
  sequence/global-function default assertions.
- `node --test scoresnap/e2e/usability-gate.test.mjs`: 1 passed, 0 failed.
- `bash -n scoresnap/supabase/schema-drift/verify-foundation-ci.sh scoresnap/supabase/schema-drift/rehearse-ledger-adoption.sh scoresnap/supabase/schema-drift/verify-offline.sh`: passed.
- `python3 -m py_compile scoresnap/supabase/schema-drift/*.py`: passed.
- `python3 scoresnap/supabase/schema-drift/check-active-sql.py --record`:
  explicitly refreshed hashes for the new M1 baseline and corrected M2 migration.
- `python3 scoresnap/supabase/schema-drift/check-active-sql.py`: passed names,
  SHA256 and Git tracking (nine migrations at that historical M2-only revision;
  the current manifest requires all ten, including M2b).
- `git diff --check`: passed.
- `npm --prefix scoresnap test -- --runInBand`: unavailable, `jest: not found`;
  no dependency download attempted.

The expected baseline-default failure and M2_DOWN_UNSAFE failure are intentional
red gates, not test failures. The delta inventory in M2-FOUNDATION.md covers all
changed normalized catalog sections. app_roles/app_role_memberships, publication
membership/attributes and existing numeric typmods are unchanged. live.json,
catalog-query.sql, drift.py and all M1 migration SQL remain untouched.

Current CI ordering (`.github/workflows/schema-drift.yml` and
`schema-drift/verify-foundation-ci.sh`): full start/reset; hosted platform
emulation; active SQL manifest check; M2b down and ledger removal; specific
M2B_UNGUARDED guest-contest expected red; unsafe rollback race expected red;
restore/reapply M2 and run the real rollback race green; unused M2 down and
ledger removal; baseline/live comparison and eight-entry baseline ledger;
expected-red default fixture; M1 selftest and SQL fixtures with --url/--admin-url;
migration up reapplies M2 and M2b; M2b policy/ACL catalog gate;
expected-after.json comparison and ten-entry local ledger (seven historical
markers + `20261027000000 live_baseline` + `20261027120000 sync_foundation` +
`20261027130000 guest_write_guard`); future-default, role/join/CAS, legacy
compatibility, guest-write and guest-guard mutation gates; ledger-adoption
rehearsal. The rehearsal asserts exactly baseline, M2 and M2b pending before
repair, and exactly M2 and M2b afterward, in migration order. It repairs only
baseline and rechecks unchanged physical schema and the eight-entry baseline
ledger, retaining hosted extensions and platform emulation.

Supabase CLI and Docker are absent. Full pinned-stack workflow and adoption
rehearsal remain unexecuted locally. Single-user mode cannot enforce raw RLS row
filtering or fire event triggers; these remain mandatory CI checks. Hosted
extension inventory is emulated only offline; actual extension installation,
Auth-issued sessions, PostgREST, realtime payload delivery, unchanged old binary,
browser/native and final M4b two-session races remain unverified offline.
Anonymous Auth remains disabled; decision 2 is open and host approval is the
implemented default.

## Local commit outcome

Attempted:

```sh
git add .github/workflows/schema-drift.yml scoresnap/supabase
git commit -m "Port M2 sync foundation onto final M1 drift coverage"
```

Both failed: `Unable to create .../.git/index.lock: Read-only file system`.
No commit was created. The complete reviewed changes remain in the working tree
for the box to commit; no source or remote refs changed.

## Historical M2-only verify-offline output

This is the original receipt, not output from the current scripts. Its
nine-entry local / seven-entry live line predates M2b and baseline adoption.
Current `verify-foundation.py` applies M2 then M2b, seeds and checks ten local
ledger rows, prints `PASS: ten-entry local ledger (live expectation is adopted eight)`,
and compares the full chain to expected-after.json. It also checks M2b down
against the saved M2 catalog, M2 down against live.json, and M2 + M2b reapply
against expected-after.json. The original output below is retained verbatim.

```text
offline: emulated platform extensions supabase_vault, pg_graphql, pg_stat_statements
Schema matches
Ledger matches: baseline
PASS identity
PASS detected: added column
PASS detected: removed column
PASS detected: column default
PASS detected: removed policy
PASS detected: policy qual
PASS detected: extra anon EXECUTE ACL
PASS detected: extra routine grant
PASS detected: function search_path
PASS detected: SECURITY DEFINER
PASS detected: removed publication member
PASS detected: changed auth trigger
PASS detected: removed auth trigger
PASS detected: RLS disabled
PASS detected: extra default ACL
PASS detected: sequence ACL
PASS detected: view owner
PASS detected: unexpected extension
PASS detected: PostgreSQL major
PASS detected: archived 001–008 shape
PASS ledger identity and rejection (live/local)
PASS detected: generated column
PASS detected: identity removed
PASS detected: sequence dependency
PASS detected: sequence dependency removed
PASS detected: sequence type
PASS detected: sequence start
PASS detected: sequence min
PASS detected: sequence max
PASS detected: sequence inc
PASS detected: sequence cycle
PASS detected: sequence cache
PASS detected: schema owner
PASS detected: event trigger event
PASS detected: event trigger fn_schema
PASS detected: event trigger fn
PASS detected: event trigger owner
PASS detected: event trigger enabled
PASS detected: event trigger tags
All JSON drift fixtures and preapply rejections passed
SKIP behavior probe: PostgreSQL single-user mode does not fire event triggers; required in pinned-stack CI
PASS SQL semantic compare + preapply rejection: publication all tables
PASS SQL semantic compare + preapply rejection: publication root
PASS SQL semantic compare + preapply rejection: application schema boundary
PASS SQL semantic compare + preapply rejection: domain nullability
PASS SQL semantic compare + preapply rejection: range subtype
PASS SQL semantic compare + preapply rejection: column statistics
PASS SQL semantic compare + preapply rejection: function rows
PASS SQL semantic compare + preapply rejection: function strict
PASS SQL semantic compare + preapply rejection: function language
PASS SQL semantic compare + preapply rejection: internal FK trigger
PASS SQL semantic compare + preapply rejection: aggregate transition
PASS SQL semantic compare + preapply rejection: numeric typmod
PASS SQL semantic compare + preapply rejection: collation
PASS SQL semantic compare + preapply rejection: generated expression
PASS SQL semantic compare + preapply rejection: publish insert
PASS SQL semantic compare + preapply rejection: publication row filter
PASS SQL semantic compare + preapply rejection: publication column list
PASS SQL semantic compare + preapply rejection: unlogged
PASS SQL semantic compare + preapply rejection: replica nothing
PASS SQL semantic compare + preapply rejection: replica full
PASS SQL semantic compare + preapply rejection: replica index
PASS SQL semantic compare + preapply rejection: managed global default
PASS SQL semantic compare + preapply rejection: enum order
PASS SQL semantic compare + preapply rejection: extension schema
PASS SQL semantic compare + preapply rejection: function volatility
PASS SQL semantic compare + preapply rejection: function leakproof
PASS SQL semantic compare + preapply rejection: function parallel
PASS SQL semantic compare + preapply rejection: function cost
PASS SQL semantic compare + preapply rejection: function defaults
PASS SQL semantic compare + preapply rejection: force RLS
PASS SQL semantic compare + preapply rejection: inheritance
PASS SQL semantic compare + preapply rejection: partition bound
PASS SQL semantic compare + preapply rejection: rule enabled
PASS SQL semantic compare + preapply rejection: check validation
PASS SQL semantic compare + preapply rejection: FK actions
PASS SQL semantic compare + preapply rejection: index predicate
PASS SQL semantic compare + preapply rejection: domain constraint
PASS SQL semantic compare + preapply rejection: statistics target
PASS SQL semantic compare + preapply rejection: publication schema
PASS SQL semantic compare + preapply rejection: policy roles
PASS SQL semantic compare + preapply rejection: policy restrictive
PASS SQL compare + preapply rejection: event removed
PASS SQL compare + preapply rejection: event disabled
PASS SQL compare + preapply rejection: identity mode
PASS SQL compare + preapply rejection: sequence cache
PASS SQL compare + preapply rejection: sequence ownership
PASS SQL compare + preapply rejection: view reloptions
PASS SQL compare + preapply rejection: schema grant
PASS SQL compare + preapply rejection: column ACL
PASS SQL compare + preapply rejection: role bypassrls
PASS SQL compare + preapply rejection: role login
PASS SQL compare + preapply rejection: role membership
PASS SQL compare + preapply rejection: authenticator inherit
PASS SQL compare + preapply rejection: trigger disabled
PASS SQL compare + preapply rejection: trigger replica
PASS SQL compare + preapply rejection: global table default
PASS SQL compare + preapply rejection: global function default
PASS SQL compare + preapply rejection: global function revoke
PASS SQL compare + preapply rejection: public default revoke
PASS SQL compare + preapply rejection: managed default revoke
PASS: PostgreSQL single-user apply + catalog parity + ledger + fixtures (no running server)
PASS: auth stubs and hosted platform emulation
PASS: baseline
PASS: extract catalog
PASS: baseline prefix equals PRE-APPLY live.json
backend> 2026-10-26 22:05:41.968 MST [596] ERROR:  DEFAULT_TABLE_PRIVILEGE: anon SELECT
EXPECTED RED: baseline default privilege fixture
PASS: foundation apply
PASS: full local ledger seed
PASS: extract catalog
PASS: nine-entry local ledger (live expectation remains seven)
PASS: extract catalog
PASS: full chain equals expected-after.json
PASS: future defaults closed
PASS: foundation role/join/CAS fixtures
SKIP: raw RLS row filtering and event-trigger firing in single-user mode; mandatory in CI
PASS: legacy publish/watch/chat flags-off gate
backend> 2026-10-26 22:05:43.208 MST [604] ERROR:  M2_DOWN_UNSAFE
EXPECTED RED: rollback refuses enrolled data
PASS: rollback
PASS: extract catalog
PASS: rollback exact baseline catalog
PASS: reapply
PASS: extract catalog
PASS: reapply exact expected catalog
```

## Verifier 2 rollback-race correction (2026-10-26)

Replaced sleep-based scheduling with a FIFO-held writer and observer-proven
rollback lock wait (`pg_stat_activity` plus `pg_blocking_pids`) before COMMIT.
Success additionally requires `M2_DOWN_UNSAFE`, retained M2 objects and the
committed writer row. The exact a5c154a unsafe fixture must instead fail after
its later DDL wait and erroneous success; both CI and the local harness reject
infrastructure errors as red evidence. The fixture is transaction-wrapped for
recoverability, and M2 is restored before green and the existing CI gates.
The offline bootstrap SQL was extracted unchanged for reuse by both harnesses.
Migration SQL, the real down SQL, expected-after.json and active SQL hashes are
unchanged.

This round's checks:

- `bash scoresnap/supabase/schema-drift/verify-offline.sh`: PASS, including M1
  catalog/ledger/mutation checks and M2 foundation, defaults, compatibility,
  guarded rollback, exact baseline rollback and exact reapply comparisons.
- `python3 scoresnap/supabase/schema-drift/selftest.py`: PASS.
- `python3 -m py_compile scoresnap/supabase/schema-drift/*.py`: PASS.
- `python3 scoresnap/supabase/schema-drift/check-active-sql.py`: PASS.
- `bash -n scoresnap/supabase/schema-drift/*.sh`: PASS.
- Fixture byte comparison with `git show a5c154a:...` and bootstrap byte
  comparison with the original offline heredoc: PASS.
- URL rejection checks (remote host, query override, keyword connection): PASS;
  no connection attempted and supplied credentials were not printed.
- `git diff --check`: PASS.
- `bash scoresnap/supabase/schema-drift/rollback-race-local.sh`: BLOCKED at
  PG17 startup: `could not create IPv4 socket ... Operation not permitted`.
  No two-session red/green evidence was produced here; **box to run** the local
  harness and full pinned Supabase CI. Single-user RLS/event-trigger limitations
  remain as documented above. No network, live URL, push or remote update used.

This round also attempted `git add` and
`git commit -m "Synchronize M2 rollback race regression with observed lock blocking"`.
Both failed because `.git` is mounted read-only (`.git/index.lock: Read-only file
system`). No commit hash exists for this round; the box must stage these changes
and create the single local commit. No permission escalation or push was attempted.
