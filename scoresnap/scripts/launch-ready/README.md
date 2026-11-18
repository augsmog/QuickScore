# Frozen launch gate core

Refs AUG-1269, AUG-1264. Definition: SS-LAUNCH-READY-FROZEN-20261118,
owner decision t1504s9384, target November 24, 2026.

This first slice validates retained normalized readbacks. It performs **no network
requests, subprocess calls, writes, signup probes or arbitrary manifest commands**.
AUG-1270 owns trusted read-only collectors, CI/main/daily wiring and the Tater result
on AUG-496. AUG-1268 owns alarm routing. Until those receipts exist LR-11 is UNKNOWN.
Running this core is not evidence that the operational gate is installed.

Run from the repository root:

```sh
python3 scoresnap/scripts/launch-ready/launch_ready_check.py --rc-sha <40-character-SHA> --evidence /path/to/bundle.json
python3 -m pytest -q scoresnap/scripts/launch-ready/test_launch_ready_check.py --basetemp /path/to/scratch
```

Omit evidence to obtain twelve named UNKNOWN results and exit 1. Every row must
PASS for exit 0. `--row LR-1` runs that manifest check independently (supply the
same RC/evidence arguments). `--manifest` supports a seeded missing-command drill;
any deviation from the hash-pinned frozen manifest fails closed. The manifest's
`command` field names the internal CLI check; commands are never shell-executed.

## Evidence contract for collectors

The bundle is JSON with `rows` keyed by LR-1 through LR-12. Each entry has a
`path` relative to the bundle's directory and the receipt file's `sha256`. Paths
must resolve inside that directory. JSON duplicate keys fail validation.
A receipt contains:

```json
{
  "rc_sha": "0123456789012345678901234567890123456789",
  "observed_at": "2026-11-18T19:00:00+00:00",
  "source": "https://github.com/augsmog/QuickScore/actions/runs/123",
  "facts": {}
}
```

`facts` must contain every field specified by that row's `requires` mapping,
with exactly the required value and JSON type. Missing facts are UNKNOWN;
explicit negative observations FAIL. A caller-supplied row `PASS` is ignored.
Collectors must derive these facts from actual readbacks, preserving their raw
source artifacts. This validator checks receipt integrity and required assertions;
it cannot authenticate an invented receipt or replace trusted provider collection.
Use only query-free HTTPS provenance URLs, never credentials or raw secret data.
All observations must bind to the full RC SHA and have timezone-aware timestamps.
The RC build collector must compare EAS gitCommitHash and ASC build identity with
that SHA, not merely report a successful unrelated build. The main-health collector
must confirm each named workflow's exact RC head and green main ancestry.

Rows marked `graded` also require `artifact_sha256`, a `grade` object with
`verdict: PASS` and that digest, and a `verifier` object with the same digest,
`verdict: PASS`, `company` and `builder_company` from different companies.
These reference the retained E2E evidence artifact, not this normalized receipt.
The collector must read and bind actual grader/verifier receipts; invented or
unavailable proof is UNKNOWN. Historical immutable proof may retain its original
timestamp when it proves this exact RC; live observations expire at 24 hours.
Future/invalid timestamps are UNKNOWN. This freshness policy is deliberately
conservative and does not add a new product acceptance criterion.

The bundle's `board` contains a fresh `observed_at` and `issues`: the complete,
paginated readback of AUG-496 children. Each issue needs `id`, integer Linear
`priority` (1=P0), `state`, boolean `blocked`; blocked issues additionally need
`blocker: {id, state}`, `owner`, and `wake`. Any live P0 child fails LR-12 even if
a receipt claims zero. Missing/stale/malformed board data leaves LR-11/LR-12
UNKNOWN. An empty list means the collector confirmed no children, not that a
request failed. The trusted collector must not substitute an empty list on error.

JSON output is `snapscore-launch-ready-result/1`, with `rc_sha`, `as_of`, frozen
`target`, twelve row statuses/reasons, `remaining`, `ready`, `board_status`,
`configuration_errors`, and `alarms`. Stale live receipts produce `stale_row`;
a blocked issue missing live blocker/owner/wake produces `dead_blocker`. The
consumer owns episode deduplication and 24-hour unchanged-state tracking, burn
rate, projection, SKIP streaks, owner asks and status freshness (AUG-1268).
No missing board readback is represented as a clean scan.

The seeded pytest fixtures are synthetic positive/negative drills, never release
proof. Never run the frozen signup POST from this checker: it creates an anonymous
user. Use a separately authorized retained public-key probe receipt or UNKNOWN.
Apple actions, metadata, App Store submission and production writes are excluded.
