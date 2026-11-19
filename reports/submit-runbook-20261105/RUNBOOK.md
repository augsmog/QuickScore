# SnapScore 1.0 review submission dry-run runbook

This packet is a read-only preflight plus a display of proposed requests. Running it never sends a POST, PATCH, or other write. It does not attach subscriptions, create a review submission, or submit to App Review. Do not run `--live`; this tool is refusal-only.

## Run

From `/workspace/aos-work/lanes/ss-release/aug678`:

```sh
python3 aos-state/snapscore/submit-runbook-20261105/submit_runbook.py --dry-run
```

`--dry-run` is the default, including when no flag is provided. The tool writes sanitized, identifier-only/boolean evidence to `preflight.json` and prints the read-back plus inert request bodies. It omits review-contact values, demo-account values, review-note text, and credentials. Missing reads are stored as `UNKNOWN`, never inferred. `--live` exits nonzero without ASC calls even when an approval id is present; the write path is intentionally not implemented.

## Preflight field sources

| Field in `preflight.json` | Read-only source |
| --- | --- |
| `appId` | `APP` from `/workspace/aos-state/config/asc.json`, imported through `/workspace/aos-state/scripts/asc_api.py` |
| `version.id`, `version.version`, `version.state` | `GET /v1/apps/{appId}/appStoreVersions?filter[versionString]=1.0&filter[platform]=IOS&include=build,appStoreReviewDetail&limit=200`; version state comes from `attributes.appStoreState` |
| `version.build.id` | `GET /v1/appStoreVersions/{versionId}/build` |
| `version.build.number`, `version.build.processingState` | `GET /v1/builds/{buildId}` (`attributes.version`, `attributes.processingState`) |
| `subscriptions[].productId`, `.id`, `.state` | `GET /v1/apps/{appId}/subscriptionGroups?limit=200`, then `GET /v1/subscriptionGroups/{snapScoreGroupId}/subscriptions?limit=200`; select exactly the two Tournament Director product IDs below. If any Pro product ID is returned, fail closed with a named error. |
| `subscriptions[].submissionVersionId` | For each matching subscription: `GET /v1/subscriptions/{subscriptionId}/versions?limit=200`; use the current `PREPARE_FOR_SUBMISSION` or `READY_FOR_REVIEW` version, else `UNKNOWN` |
| `reviewContactPresent`, `reviewNotesPresent` | `GET /v1/appStoreVersions/{versionId}/appStoreReviewDetail` to resolve the detail resource, then `GET /v1/appStoreReviewDetails/{reviewDetailId}` to inspect attributes; only booleans are stored (false if the detail cannot be read) |
| `reviewSubmissionCount`, `reviewSubmissionCountKnown` | `GET /v1/apps/{appId}/reviewSubmissions?limit=200`; absent/malformed `data` records `UNKNOWN` and `false`, never an inferred zero |

For all observed version, build and product fields, a missing or null value is written as `UNKNOWN`. A missing build relationship is retried through its relationship endpoint; if still absent, build fields remain `UNKNOWN`.

Expected submission subscription product IDs (TD only): `snapscore.td.annual`, `snapscore.td.monthly`. Pro products were removed from App Store Connect under AUG-816/AUG-817 after the owner direction recorded in t1238u; the only IAPs in this submission are Tournament Director. The dry-run refuses any `snapscore.pro.*` or `snapscore_pro_*` product ID found in its configuration or returned by ASC; it does not substitute legacy or differently named products.

## Inert write-intent order

The current App Store Connect Review Submission API requires a submission resource before its items can be attached. Therefore the valid request order shown by the tool is:

1. `POST /v1/reviewSubmissions` to create a draft submission for this app.
2. `POST /v1/reviewSubmissionItems` for version 1.0 and each of the two `subscriptionVersion` resources (three items total).
3. `PATCH /v1/reviewSubmissions/{id}` with `attributes.submitted: true` to submit the completed group.

The tool only prints these three intents; it does not call those endpoints. Apple documents this create submission → add item → mark submitted flow in [Migrating in-app purchase metadata to v2](https://developer.apple.com/documentation/appstoreconnectapi/migrating-in-app-purchase-metadata-to-v2) and the [Review Submissions](https://developer.apple.com/documentation/appstoreconnectapi/review-submissions) API overview. The final action uses `PATCH`, not `POST`, per Apple's modify-review-submission request shape.

## Remaining human gates

These booleans say whether this packet verifies clearance. `false` means this read-only preflight does not clear the gate; it is not permission to act.

| Ticket | Cleared by this packet | Meaning |
| --- | --- | --- |
| AUG-76 account transfer / Paid Apps, tax and banking | `false` | Account/agreements are outside this preflight. |
| AUG-50 App Review contact phone | `false` | Current read-back says the required contact fields are absent. |
| AUG-64 privacy | `false` | This packet does not validate the privacy questionnaire or listing entry. |
| AUG-79 content rights | `false` | This packet does not validate or edit the content-rights declaration. |
| AUG-65 screenshots | `false` | This packet does not validate screenshot source or device-size acceptance. |
| AUG-67 review notes and demo login | `false` | Current read-back says review notes are empty; demo-account presence/value is not exposed here. |

No ASC write was made and no review submission was created or submitted. The recorded snapshot is in `preflight.json`; rerun the GET-only command to refresh it before any later independently authorized action.
