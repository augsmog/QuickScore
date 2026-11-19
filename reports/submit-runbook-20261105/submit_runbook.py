#!/usr/bin/env python3
"""Read-only App Store submission preflight and inert submission-intent preview."""
from __future__ import annotations
import argparse, json, os, re, sys
from pathlib import Path
from typing import Any, Callable
ASC_SCRIPTS = "/workspace/aos-state/scripts"
PRODUCT_IDS = ("snapscore.td.annual", "snapscore.td.monthly")
PRO_PRODUCT_PREFIXES = ("snapscore.pro.", "snapscore_pro_")
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
def _relationship_id(row: dict[str, Any], key: str) -> str | None:
    try: return row["relationships"][key]["data"]["id"]
    except (KeyError, TypeError): return None
def _known(value: Any) -> Any:
    return value if value is not None else "UNKNOWN"
def assert_no_pro_product_ids(product_ids: Any) -> None:
    for product_id in product_ids:
        if isinstance(product_id, str) and product_id.startswith(PRO_PRODUCT_PREFIXES):
            raise RuntimeError(f"Pro product ID is forbidden by the TD-only submission runbook: {product_id}")
def collect_preflight(call: Callable[..., Any], app_id: str) -> dict[str, Any]:
    assert_no_pro_product_ids(PRODUCT_IDS)
    path = f"/v1/apps/{app_id}/appStoreVersions?filter[versionString]=1.0&filter[platform]=IOS&include=build,appStoreReviewDetail&limit=200"
    versions = _rows(get_only(call, path))
    version = next((r for r in versions if (r.get("attributes") or {}).get("versionString") == "1.0"), None)
    if version is None and len(versions) == 1:
        # A filtered GET may still return a malformed/null record; preserve the
        # observation as UNKNOWN instead of manufacturing the requested value.
        version = versions[0]
    if version is None:
        vs = {"id": "UNKNOWN", "version": "UNKNOWN", "state": "UNKNOWN", "build": {"id": "UNKNOWN", "number": "UNKNOWN", "processingState": "UNKNOWN"}}
        presence = {"contactPresent": None, "notesPresent": None}
    else:
        attrs = version.get("attributes") or {}
        build_id = _relationship_id(version, "build")
        if not build_id:
            version_id = version.get("id")
            linked = get_only(call, f"/v1/appStoreVersions/{version_id}/build").get("data") or {} if version_id else {}
            build_id = linked.get("id") if isinstance(linked, dict) else None
        build = {"id": build_id or "UNKNOWN", "number": "UNKNOWN", "processingState": "UNKNOWN"}
        if build_id:
            b = get_only(call, f"/v1/builds/{build_id}").get("data") or {}
            if not isinstance(b, dict): b = {}
            ba = b.get("attributes") or {}
            build = {"id": _known(b.get("id", build_id)), "number": _known(ba.get("version")), "processingState": _known(ba.get("processingState"))}
        review_id = _relationship_id(version, "appStoreReviewDetail")
        if not review_id:
            version_id = version.get("id")
            linked = get_only(call, f"/v1/appStoreVersions/{version_id}/appStoreReviewDetail").get("data") if version_id else None
            review_id = linked.get("id") if isinstance(linked, dict) else None
        if review_id:
            detail_data = get_only(call, f"/v1/appStoreReviewDetails/{review_id}").get("data") or {}
            detail = detail_data.get("attributes") or {} if isinstance(detail_data, dict) else {}
            presence = {"contactPresent": all(bool(detail.get(k)) for k in ("contactFirstName", "contactLastName", "contactPhone", "contactEmail")), "notesPresent": bool(detail.get("notes"))}
        else: presence = {"contactPresent": False, "notesPresent": False}
        vs = {"id": _known(version.get("id")), "version": _known(attrs.get("versionString")), "state": _known(attrs.get("appStoreState")), "build": build}
    groups = _rows(get_only(call, f"/v1/apps/{app_id}/subscriptionGroups?limit=200"))
    group = next((g for g in groups if (g.get("attributes") or {}).get("referenceName") == "SnapScore"), None)
    if group and group.get("id"):
        rows = _rows(get_only(call, f"/v1/subscriptionGroups/{group['id']}/subscriptions?limit=200"))
        assert_no_pro_product_ids((p.get("attributes") or {}).get("productId") for p in rows)
        by_product = {(p.get("attributes") or {}).get("productId"): p for p in rows}
        products = []
        for pid in PRODUCT_IDS:
            product = by_product.get(pid)
            product_id = product.get("id") if product else None
            state = _known((product.get("attributes") or {}).get("state")) if product else "UNKNOWN"
            version_id = "UNKNOWN"
            if product_id:
                versions = _rows(get_only(call, f"/v1/subscriptions/{product_id}/versions?limit=200"))
                candidate = next((v for v in versions if (v.get("attributes") or {}).get("state") in ("PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW")), None)
                if candidate: version_id = _known(candidate.get("id"))
            products.append({"productId": pid, "id": product_id or "UNKNOWN", "state": state, "submissionVersionId": version_id})
    else: products = [{"productId": pid, "id": "UNKNOWN", "state": "UNKNOWN", "submissionVersionId": "UNKNOWN"} for pid in PRODUCT_IDS]
    review_response = get_only(call, f"/v1/apps/{app_id}/reviewSubmissions?limit=200")
    reviews_known = isinstance(review_response, dict) and isinstance(review_response.get("data"), list)
    reviews = _rows(review_response)
    return {"appId": app_id, "version": vs, "subscriptions": products, "reviewSubmissionCount": len(reviews) if reviews_known else "UNKNOWN", "reviewSubmissionCountKnown": reviews_known, "reviewContactPresent": bool(presence["contactPresent"]), "reviewNotesPresent": bool(presence["notesPresent"])}
def write_intents(preflight: dict[str, Any], app_id: str) -> list[dict[str, Any]]:
    assert_no_pro_product_ids(PRODUCT_IDS)
    version_id = (preflight.get("version") or {}).get("id") or "UNKNOWN"
    if version_id == "UNKNOWN": version_id = "<VERSION_1_0_ID_FROM_PREFLIGHT>"
    products = preflight.get("subscriptions") or []
    assert_no_pro_product_ids(p.get("productId") for p in products if isinstance(p, dict))
    if {p.get("productId") for p in products} != set(PRODUCT_IDS) or any(not p.get("submissionVersionId") or p.get("submissionVersionId") == "UNKNOWN" for p in products):
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
