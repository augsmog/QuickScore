import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import submit_runbook as rb

APP = "6761034352"
VERSION = "version-1"
PRODUCT_IDS = set(rb.PRODUCT_IDS)


def response(path):
    if "/appStoreVersions?" in path:
        return {"data": [{"id": VERSION, "attributes": {"versionString": "1.0", "appStoreState": "PREPARE_FOR_SUBMISSION"}, "relationships": {"build": {"data": {"id": "build-29"}}, "appStoreReviewDetail": {"data": {"id": "review-detail"}}}}]}
    if path == f"/v1/appStoreVersions/{VERSION}/build":
        return {"data": {"id": "build-29"}}
    if path == f"/v1/appStoreVersions/{VERSION}/appStoreReviewDetail":
        return {"data": {"id": "review-detail"}}
    if path == "/v1/builds/build-29":
        return {"data": {"id": "build-29", "attributes": {"version": "29", "processingState": "VALID"}}}
    if path == "/v1/appStoreReviewDetails/review-detail":
        return {"data": {"attributes": {"contactFirstName": "Ada", "contactLastName": "Lovelace", "contactPhone": "555-0100", "contactEmail": "ada@example.invalid", "notes": "Review instructions"}}}
    if "/subscriptionGroups?" in path:
        return {"data": [{"id": "group-1", "attributes": {"referenceName": "SnapScore"}}]}
    if path == "/v1/subscriptionGroups/group-1/subscriptions?limit=200":
        return {"data": [{"id": f"sub-{i}", "attributes": {"productId": pid, "state": "READY_TO_SUBMIT"}} for i, pid in enumerate(sorted(PRODUCT_IDS))]}
    if path.startswith("/v1/subscriptions/") and path.endswith("/versions?limit=200"):
        sid = path.split("/")[3]
        return {"data": [{"id": f"{sid}-version", "attributes": {"state": "PREPARE_FOR_SUBMISSION"}}]}
    if "/reviewSubmissions?" in path:
        return {"data": []}
    return {}


class SubmitRunbookTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        def fake_call(method, path, body=None):
            self.calls.append((method, path, body))
            if method != "GET":
                raise AssertionError(f"network write attempted: {method} {path}")
            return 200, response(path)
        self.call = fake_call

    def test_preflight_is_get_only_and_captures_exact_current_four_product_set(self):
        data = rb.collect_preflight(self.call, APP)
        self.assertTrue(all(method == "GET" for method, _, _ in self.calls))
        self.assertEqual({row["productId"] for row in data["subscriptions"]}, PRODUCT_IDS)
        self.assertTrue(all(row["state"] == "READY_TO_SUBMIT" for row in data["subscriptions"]))
        self.assertTrue(all(row["submissionVersionId"].endswith("-version") for row in data["subscriptions"]))
        self.assertEqual(data["version"], {"id": VERSION, "version": "1.0", "state": "PREPARE_FOR_SUBMISSION", "build": {"id": "build-29", "number": "29", "processingState": "VALID"}})
        self.assertEqual((data["reviewContactPresent"], data["reviewNotesPresent"]), (True, True))

    def test_intents_have_stable_create_attach_submit_order_and_exact_ids(self):
        data = rb.collect_preflight(self.call, APP)
        intents = rb.write_intents(data, APP)
        self.assertEqual([(i["method"], i["path"]) for i in intents], [
            ("POST", "/v1/reviewSubmissions"),
            ("POST", "/v1/reviewSubmissionItems"),
            ("PATCH", "/v1/reviewSubmissions/<REVIEW_SUBMISSION_ID_FROM_STEP_1>"),
        ])
        self.assertEqual(len(intents[1]["bodies"]), 5)  # version 1.0 plus four subscriptions
        attached = [b["data"]["relationships"]["subscriptionVersion"]["data"]["id"] for b in intents[1]["bodies"][1:]]
        expected = [row["submissionVersionId"] for row in data["subscriptions"]]
        self.assertEqual(attached, expected)
        version_item = intents[1]["bodies"][0]["data"]["relationships"]["appStoreVersion"]["data"]
        self.assertEqual(version_item, {"type": "appStoreVersions", "id": VERSION})

    def test_default_dry_run_writes_only_local_json_and_never_posts(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "preflight.json"
            with patch.object(rb, "OUT", target):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    status = rb.main([], call=self.call, app_id=APP)
            self.assertEqual(status, 0)
            self.assertTrue(target.is_file())
            data = json.loads(target.read_text())
            self.assertEqual(set(row["productId"] for row in data["subscriptions"]), PRODUCT_IDS)
            self.assertTrue(all(method == "GET" for method, _, _ in self.calls))
            self.assertIn('"writeIntents"', out.getvalue())
            self.assertNotIn("555-0100", out.getvalue())
            self.assertNotIn("ada@example.invalid", out.getvalue())
            self.assertNotIn("Review instructions", out.getvalue())

    def test_live_refusal_makes_zero_asc_calls_even_with_valid_record(self):
        with patch.dict(os.environ, {"SUBMIT_APPROVAL_ID": "existing"}), patch.object(rb, "DECISIONS", Path(tempfile.mkdtemp())) as decisions:
            (decisions / "existing.md").write_text("approval record")
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                status = rb.main(["--live"], call=self.call, app_id=APP)
        self.assertEqual(status, 2)
        self.assertEqual(self.calls, [])
        self.assertIn("refusal-only", stderr.getvalue())

    def test_missing_records_stay_explicit_unknown_and_intents_do_not_substitute_ids(self):
        def incomplete(method, path, body=None):
            self.calls.append((method, path, body))
            if method != "GET": raise AssertionError("write attempted")
            return 200, {"data": []}
        data = rb.collect_preflight(incomplete, APP)
        self.assertEqual(data["version"]["state"], "UNKNOWN")
        self.assertTrue(all(row["state"] == "UNKNOWN" and row["id"] == "UNKNOWN" for row in data["subscriptions"]))
        intents = rb.write_intents(data, APP)
        ids = [body["data"]["relationships"]["subscriptionVersion"]["data"]["id"] for body in intents[1]["bodies"][1:]]
        self.assertEqual(ids, [f"<SUBSCRIPTION_ID:{pid}>" for pid in rb.PRODUCT_IDS])

    def test_missing_build_link_and_null_attributes_stay_unknown(self):
        def missing_build_link(method, path, body=None):
            self.calls.append((method, path, body))
            if method != "GET": raise AssertionError(f"network write attempted: {method} {path}")
            data = response(path)
            if "/appStoreVersions?" in path:
                data["data"][0]["relationships"]["build"]["data"] = None
            if path.endswith("/build"):
                return 200, {"data": None}
            return 200, data
        data = rb.collect_preflight(missing_build_link, APP)
        self.assertEqual(data["version"]["build"], {"id": "UNKNOWN", "number": "UNKNOWN", "processingState": "UNKNOWN"})

        def null_build_fields(method, path, body=None):
            self.calls.append((method, path, body))
            if method != "GET": raise AssertionError(f"network write attempted: {method} {path}")
            payload = response(path)
            if path == "/v1/builds/build-29": payload["data"]["attributes"] = {"version": None, "processingState": None}
            return 200, payload
        data = rb.collect_preflight(null_build_fields, APP)
        self.assertEqual(data["version"]["build"]["number"], "UNKNOWN")
        self.assertEqual(data["version"]["build"]["processingState"], "UNKNOWN")

    def test_review_submission_count_unknown_when_missing_or_paginated(self):
        def incomplete(method, path, body=None):
            self.calls.append((method, path, body))
            if method != "GET": raise AssertionError(f"network write attempted: {method} {path}")
            if "/reviewSubmissions?" in path: return 200, {}
            return 200, response(path)
        data = rb.collect_preflight(incomplete, APP)
        self.assertEqual(data["reviewSubmissionCount"], "UNKNOWN")
        self.assertFalse(data["reviewSubmissionCountKnown"])

        def paginated(method, path, body=None):
            self.calls.append((method, path, body))
            if method != "GET": raise AssertionError(f"network write attempted: {method} {path}")
            if "/reviewSubmissions?" in path: return 200, {"data": [{"id": "submission-1"}], "links": {"next": "https://example.invalid/next"}}
            return 200, response(path)
        data = rb.collect_preflight(paginated, APP)
        self.assertEqual(data["reviewSubmissionCount"], "UNKNOWN")
        self.assertFalse(data["reviewSubmissionCountKnown"])


if __name__ == "__main__":
    unittest.main()
