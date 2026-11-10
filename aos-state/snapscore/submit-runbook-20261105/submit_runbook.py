#!/usr/bin/env python3
"""Read-only App Store submission preflight and inert submission-intent preview."""
from __future__ import annotations
import argparse, json, os, re, sys
from pathlib import Path
from typing import Any, Callable
ASC_SCRIPTS = "/workspace/aos-state/scripts"
PRODUCT_IDS = ("snapscore.pro.annual", "snapscore.pro.monthly", "snapscore.td.annual", "snapscore.td.monthly")
DECISIONS = Path("/workspace/aos-state/decisions")
OUT = Path(__file__).resolve().parent / "preflight.json"
def _asc_call():
    sys.path.insert(0, ASC_SCRIPTS)
    from asc_api import APP, call
    return call, str(APP)
def get_only(call: Callable[..., Any], path: str) -> Any:
    status, body = call("GET", path)
    if status < 200 or status >= 300: raise RuntimeError(f"GET failed ({status}) for {path}")
    return body or {}
def _rows(payload: Any) -> list[dict[str, Any]]:
    rows = payload.get("data") if isinstance(payload, dict) else None
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
def _data(payload: Any) -> dict[str, Any]:
    data = payload.get("data") if isinstance(payload, dict) else None
    return data if isinstance(data, dict) else {}
def _relationship_id(row: dict[str, Any], key: str) -> str | None:
    try: return row["relationships"][key]["data"]["id"]
    except (KeyError, TypeError): return None
def collect_preflight(call: Callable[..., Any], app_id: str) -> dict[str, Any]:
    path = f"/v1/apps/{app_id}/appStoreVersions?filter[versionString]=1.0&filter[platform]=IOS&include=build,appStoreReviewDetail&limit=200"
    versions = _rows(get_only(call, path))
    version = next((r for r in versions if (r.get("attributes") or {}).get("versionString") == "1.0"), None)
    if version is None:
        vs = {"id": "UNKNOWN", "version": "1.0", "state": "UNKNOWN", "build": {"id": "UNKNOWN", "number": "UNKNOWN", "processingState": "UNKNOWN"}}
        presence = {"contactPresent": None, "notesPresent": None}
    else:
        attrs = version.get("attributes") or {}
        build_id = _relationship_id(version, "build")
        if not build_id:
            linked = _data(get_only(call, f"/v1/appStoreVersions/{version['id']}/build"))
            build_id = linked.get("id")
        build = {"id": build_id or "UNKNOWN", "number": "UNKNOWN", "processingState": "UNKNOWN"}
        if build_id:
            b = _data(get_only(call, f"/v1/builds/{build_id}"))
            ba = b.get("attributes") or {}
            build = {"id": b.get("id") or build_id, "number": ba.get("version") or "UNKNOWN", "processingState": ba.get("processingState") or "UNKNOWN"}
        review_id = _relationship_id(version, "appStoreReviewDetail")
        if not review_id:
            linked = _data(get_only(call, f"/v1/appStoreVersions/{version['id']}/appStoreReviewDetail"))
            review_id = linked.get("id")
        if review_id:
            detail_payload = get_only(call, f"/v1/appStoreReviewDetails/{review_id}")
            detail_data = _data(detail_payload)
            detail = detail_data.get("attributes")
            if isinstance(detail, dict):
                presence = {"contactPresent": all(bool(detail.get(k)) for k in ("contactFirstName", "contactLastName", "contactPhone", "contactEmail")), "notesPresent": bool(detail.get("notes"))}
            else: presence = {"contactPresent": None, "notesPresent": None}
        else: presence = {"contactPresent": None, "notesPresent": None}
        vs = {"id": version.get("id") or "UNKNOWN", "version": attrs.get("versionString") or "UNKNOWN", "state": attrs.get("appStoreState") or "UNKNOWN", "build": build}
    groups = _rows(get_only(call, f"/v1/apps/{app_id}/subscriptionGroups?limit=200"))
    group = next((g for g in groups if (g.get("attributes") or {}).get("referenceName") == "SnapScore"), None)
    if group and group.get("id"):
        rows = _rows(get_only(call, f"/v1/subscriptionGroups/{group['id']}/subscriptions?limit=200"))
        by_product = {(p.get("attributes") or {}).get("productId"): p for p in rows}
        products = []
        for pid in PRODUCT_IDS:
            product = by_product.get(pid)
            product_id = product.get("id") if product else None
            state = ((product.get("attributes") or {}).get("state") or "UNKNOWN") if product else "UNKNOWN"
            version_id = "UNKNOWN"
            if product_id:
                versions = _rows(get_only(call, f"/v1/subscriptions/{product_id}/versions?limit=200"))
                candidate = next((v for v in versions if (v.get("attributes") or {}).get("state") in ("PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW")), None)
                if candidate: version_id = candidate.get("id", "UNKNOWN")
            products.append({"productId": pid, "id": product_id or "UNKNOWN", "state": state, "submissionVersionId": version_id})
    else: products = [{"productId": pid, "id": "UNKNOWN", "state": "UNKNOWN", "submissionVersionId": "UNKNOWN"} for pid in PRODUCT_IDS]
    review_payload = get_only(call, f"/v1/apps/{app_id}/reviewSubmissions?limit=200")
    complete_review_list = isinstance(review_payload, dict) and isinstance(review_payload.get("data"), list) and not (review_payload.get("links") or {}).get("next")
    reviews = _rows(review_payload)
    review_count: int | str = len(reviews) if complete_review_list else "UNKNOWN"
    return {"appId": app_id, "version": vs, "subscriptions": products, "reviewSubmissionCount": review_count, "reviewSubmissionCountKnown": complete_review_list, "reviewContactPresent": presence["contactPresent"], "reviewNotesPresent": presence["notesPresent"]}
def write_intents(preflight: dict[str, Any], app_id: str) -> list[dict[str, Any]]:
    version_id = (preflight.get("version") or {}).get("id") or "UNKNOWN"
    if version_id == "UNKNOWN": version_id = "<VERSION_1_0_ID_FROM_PREFLIGHT>"
    products = preflight.get("subscriptions") or []
    if {p.get("productId") for p in products} != set(PRODUCT_IDS) or any(p.get("submissionVersionId") == "UNKNOWN" for p in products):
        product_ids = [f"<SUBSCRIPTION_ID:{pid}>" for pid in PRODUCT_IDS]
    else: product_ids = [str(next(p["submissionVersionId"] for p in products if p["productId"] == pid)) for pid in PRODUCT_IDS]
    create = {"method": "POST", "path": "/v1/reviewSubmissions", "body": {"data": {"type": "reviewSubmissions", "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}}}
    items = []
    relations = [("appStoreVersion", "appStoreVersions", version_id)] + [("subscriptionVersion", "subscriptionVersions", pid) for pid in product_ids]
    for relation, typ, rid in relations:
        items.append({"data": {"type": "reviewSubmissionItems", "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": "<REVIEW_SUBMISSION_ID_FROM_STEP_1>"}}, relation: {"data": {"type": typ, "id": rid}}}}})
    attach = {"method": "POST", "path": "/v1/reviewSubmissionItems", "bodies": items}
    submit = {"method": "PATCH", "path": "/v1/reviewSubmissions/<REVIEW_SUBMISSION_ID_FROM_STEP_1>", "body": {"data": {"type": "reviewSubmissions", "id": "<REVIEW_SUBMISSION_ID_FROM_STEP_1>", "attributes": {"submitted": True}}}}
    return [create, attach, submit]
def has_approval_record(value: str | None) -> bool:
    return bool(value and re.fullmatch(r"[A-Za-z0-9._-]+", value) and (DECISIONS / f"{value}.md").is_file())
def main(argv: list[str] | None = None, *, call: Callable[..., Any] | None = None, app_id: str | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="default: emit inert intents after GET-only preflight")
    parser.add_argument("--live", action="store_true", help="refusal-only; this tool never sends writes")
    args = parser.parse_args(argv)
    if args.live:
        if not has_approval_record(os.environ.get("SUBMIT_APPROVAL_ID")):
            print("REFUSED: SUBMIT_APPROVAL_ID must name an existing decision record; no ASC calls made", file=sys.stderr)
        else: print("REFUSED: this ticket's runbook is refusal-only; no ASC calls made", file=sys.stderr)
        return 2
    if call is None or app_id is None: call, app_id = _asc_call()
    preflight = collect_preflight(call, app_id)
    OUT.write_text(json.dumps(preflight, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"preflight": preflight, "writeIntents": write_intents(preflight, app_id)}, indent=2, sort_keys=True))
    print(f"GET-only preflight saved: {OUT}")
    return 0
if __name__ == "__main__": raise SystemExit(main())
