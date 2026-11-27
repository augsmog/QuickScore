# Quick Settle completion RPC: already in production (recorded 27 Nov 2026)

`migrations/20261127033047_quick_settle_completion_rpc.sql` records a migration that production
(project `pltgbizexllikiwryozm`) already holds as version `20261127033047`,
name `quick_settle_completion_rpc`. It was applied under AUG-1585 before the file was in this
directory, so the repository and production disagreed until this commit.

## Where the file comes from

It is the file `supabase/proposed/20261127031500_quick_settle_completion_rpc.sql` from commit
`1f0fdcd` (branch `claude/aug-1585-quick-settle-rpc`), byte for byte, renamed to the version
production recorded. Its header still reads "Proposal only": the bytes were kept unchanged so
they can be compared with production. Checked read-only against production on 27 Nov 2026:

- the statement text production stored for version `20261127033047` is 4270 characters,
  MD5 `67a885fda65ac3b966b6b3bc9e002ef0`; this file is 4270 characters with the same MD5;
- `md5(prosrc)` of `public.record_quick_settle_completion` in production is
  `6d95a036ab0725c583b4ca2a2722654e`, the same as the function body in this file.

## What it is and is not

Two tables (`first_round_finishes`, `quick_settle_completion_operations`) and one function
(`record_quick_settle_completion`). It is the RPC-only part of
`proposed/20261103170000_first_round_finished.sql`. That proposal's `record_first_round_finish`,
its two triggers and the `activation_daily` view are NOT in production and not in this file.

Do not apply this file to production again; the version is already recorded there.
Rollback: `rollbacks/20261127033047_quick_settle_completion_rpc.sql`. Running it is a production
write and needs Augie's own yes.
