# Launch gate integration (AUG-1270)

Consumes AUG-1269's `snapscore-launch-ready-result/1` contract and frozen mapping.
The daily/main workflow is `Launch readiness`. PRs run only offline contracts and
the missing-command negative drill. Main pushes, schedule and manual runs also
collect readbacks, execute the gate and upload `collection.json`, `result.json`
and `report.md` even when the gate exits 1. A missing-command drill is accepted
only if exit 1 **and** the saved JSON names configuration errors; a crash is not
a passing drill. No `continue-on-error` turns a failed launch gate green.

```
python scoresnap/scripts/launch-ready/run_launch_gate.py \
  --rc-sha <40-character-source-SHA> --out-dir <run-directory> \
  --evidence <receipt-directory>/bundle.json
```

Evidence is optional; absence is twelve UNKNOWN rows, never readiness. Workflow
input, if present, is `scoresnap/docs/launch/evidence/launch-ready/bundle.json`.
Receipt paths/digests and observation/RC binding are validated by the checker.
Transport observations cannot fabricate signed/graded receipts or native proof.
Missing provider access invalidates its dependent receipts; mismatched builds,
new failed main workflows or an open P0 invalidate the corresponding retained
readiness claims. Nothing executes the manifest's command strings.

Read-only providers:

| Provider | Operation | Existing access required |
| --- | --- | --- |
| GitHub | Paginated `gh api --method GET` workflow runs at the given SHA | GH_TOKEN or GITHUB_TOKEN and gh |
| Linear | Tater helper query of AUG-496 children (partial lists rejected) | Box `/workspace/aos-state/scripts/linear_app_token.py` and its existing credentials |
| EAS | `eas build:view <id> --json`, source SHA checked | Existing eas CLI, EXPO_TOKEN, AOS_EAS_BUILD_ID |
| ASC | GET `/v1/builds/<id>` | Existing ASC_BEARER_TOKEN, AOS_ASC_BUILD_ID |

Missing tools/credentials/IDs are UNKNOWN, as are malformed responses and failed
reads. Hosted runners currently lack the box Tater helper; this is explicitly
UNKNOWN, never a clean Linear read. No credentials are installed or rotated by
these scripts. No EAS build, ASC mutation, signup POST, Supabase mutation, account
creation or customer communication is performed. Only selected non-personal
provider fields are saved; errors never include raw vendor bodies or stderr.

`--history <file>` accepts an array of prior result objects. Burn rate uses the
latest valid earlier observation of the same RC and frozen definition. Projection
uses actual elapsed days and the America/New_York date. No history, zero progress,
regression or a different RC yields an unavailable projection. The target stays
2026-11-24. Every report explicitly supersedes `Progress: 34/79`.

## Existing daily consumer boundary (AUG-1268)

AUG-1268 owns the existing `owner_checks.py` hook, once-daily publication and alarm
deduplication. It can run the command above on the box with existing credentials,
retain dated `result.json` history, or download the named CI artifact via GitHub
GET. Require exact source and timestamp binding when choosing an artifact. Pass
the result through `launch_report.render(result, history)` and publish **only**
to AUG-496 with the existing `linear_app_token.gql` Tater helper. A FAIL report is
still publishable; its gate stays failed. This change adds no routine or lane
scheduler changes and does not claim the AUG-1268 hook is installed.

The initial dated result is posted by the builder through the same helper and
linked on AUG-1270. No publication is attempted from a PR or from an arbitrary
user token. The frozen LR-11 row remains UNKNOWN until actual main/daily runs,
the Tater publication, and alarm drills have their separate validated receipts.
