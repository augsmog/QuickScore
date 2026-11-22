"""Offline evidence-intake only for ordinary Android TD fallback paywall."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct
import sys
import zlib

REPO = "augsmog/QuickScore"
PACKAGE = "com.scoresnap.app"
PIXELS = (1080, 2400)
SCALES = {"1.000", "1.300"}
BIND = ("sourceSha", "sourceTree", "integrationHead", "apkSha256", "runId", "runAttempt", "artifactId")
# Expected literal strings from exact paywall-copy/plans. Close is an icon with a
# native accessibility label; a PNG will not say "Close".
WITNESSES = {
    "Run the game. We do the math.": ("text", "modal", None),
    "Close": ("button", "modal", True),
    "Restore Purchases": ("button", "modal", True),
    "Free": ("text", "free-radio", None),
    "Current plan": ("text", "free-radio", None),
    "Tournament Director": ("text", "td-radio-selected", None),
    "$79.99/year": ("text", "td-radio-selected", None),
    "Currently unavailable": ("button", "td-cta", False),
    "Renews yearly. Cancel anytime.": ("text", "modal", None),
}
SECTIONS = {
    "top": {"Run the game. We do the math.", "Close", "Restore Purchases"},
    "free": {"Free", "Current plan"},
    "td": {"Tournament Director", "$79.99/year"},
    "disabled": {"Currently unavailable", "Renews yearly. Cancel anytime."},
}
WRONG = {"home-new-contest", "new-contest-back", "contest-start", "contest-continue",
         "contest-footer", "join-dismiss", "paywall-dialog-overlay"}
MAX_BYTES = 16 * 1024 * 1024


class Blocked(ValueError):
    pass


def require(value, reason):
    if not value:
        raise Blocked(reason)


def obj(x):
    require(isinstance(x, dict), "INVALID_RECORD")
    return x


def arr(x, length=30):
    require(isinstance(x, list) and len(x) <= length, "INVALID_RECORD_LIST")
    return x


def token(x, pat=r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}"):
    return isinstance(x, str) and re.fullmatch(pat, x) is not None


def hexid(x, size):
    return token(x, f"[0-9a-f]{{{size}}}")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(data):
    def pairs(items):
        result = {}
        for k, v in items:
            require(k not in result, "DUPLICATE_JSON_KEY")
            result[k] = v
        return result
    try:
        return json.loads(data, object_pairs_hook=pairs)
    except Blocked:
        raise
    except (ValueError, RecursionError):
        raise Blocked("INVALID_JSON") from None


def timestamp(value):
    return type(value) is int and 0 < value < 2**63


def pinned(file, digest):
    require(hexid(digest, 64), "EXTERNAL_DIGEST_REQUIRED")
    require(file.is_file() and not file.is_symlink() and file.stat().st_size <= MAX_BYTES, "INPUT_UNAVAILABLE")
    b = file.read_bytes()
    require(len(b) <= MAX_BYTES and sha(b) == digest, "INPUT_DIGEST_DRIFT")
    return b


def check_path(value):
    require(isinstance(value, str) and 0 < len(value) < 220 and
            all(p not in (".", "..") and token(p, r"[A-Za-z0-9_.-]{1,100}")
                for p in value.split("/")) and value.endswith(".png"), "UNSAFE_PNG_PATH")


def path_in(root, value):
    check_path(value)
    path = root
    for part in PurePosixPath(value).parts:
        path = path / part
        require(not path.is_symlink(), "UNSAFE_PNG_PATH")
    return path


def raw_png_shape(data):
    # Structure/CRC only. Encoded content, actual provenance and full glyphs are
    # never inferred from this structural check.
    require(data.startswith(b"\x89PNG\r\n\x1a\n"), "PNG_FORMAT")
    p, total, saw_data = 8, 0, False
    while p + 12 <= len(data):
        n = struct.unpack_from(">I", data, p)[0]
        e = p + n + 12
        require(e <= len(data) and total <= 4096, "PNG_STRUCTURE")
        kind, body = data[p+4:p+8], data[p+8:e-4]
        require(zlib.crc32(body, zlib.crc32(kind)) == struct.unpack_from(">I", data, e-4)[0], "PNG_CRC")
        if total == 0:
            require(kind == b"IHDR" and n == 13 and struct.unpack_from(">II", body) == PIXELS, "FULL_COMPACT_FRAME_REQUIRED")
        else:
            require(kind != b"IHDR", "PNG_STRUCTURE")
        if kind == b"IDAT" and n:
            saw_data = True
        if kind == b"IEND":
            require(n == 0 and e == len(data) and saw_data, "PNG_STRUCTURE")
            return
        p, total = e, total + 1
    raise Blocked("PNG_STRUCTURE")


def box(value, viewport=PIXELS):
    require(isinstance(value, list) and len(value) == 4 and all(type(x) is int for x in value), "NATIVE_BOUNDS_INVALID")
    l, t, r, b = value
    require(0 <= l < r <= viewport[0] and 0 <= t < b <= viewport[1], "NATIVE_BOUNDS_OUTSIDE_FRAME")
    return tuple(value)


def fits(inner, outer):
    return outer[0] <= inner[0] < inner[2] <= outer[2] and outer[1] <= inner[1] < inner[3] <= outer[3]


def verify_route(route):
    r = obj(route)
    require(r.get("mode") == "ordinary-ui" and r.get("fromScene") == "round-settings" and
            r.get("fromObserved") is True and r.get("actionId") == "contest-start" and
            r.get("actionLabel") == "Start" and r.get("enabled") is True and
            type(r.get("pressCount")) is int and r["pressCount"] == 1 and
            r.get("openedScope") == "td-paywall-modal" and r.get("openedObserved") is True and
            r.get("selectedTournament") is True and r.get("sourceHasRealDraft") is True and
            r.get("directRouteOrSyntheticFallback") is False and
            r.get("initiatedPurchaseOrRestore") is False and
            timestamp(r.get("actionNs")) and timestamp(r.get("openedNs")) and r["actionNs"] < r["openedNs"] and
            token(r.get("deviceSession")) and token(r.get("modalSession")) and
            hexid(r.get("activityIdentitySha256"), 64), "ORDINARY_START_ROUTE_UNPROVEN")
    return r


def observation(data, phase, frame, route, scale):
    x = obj(data)
    require(x.get("phase") == phase and x.get("frameId") == frame["frameId"] and
            x.get("package") == PACKAGE and x.get("foregroundPackage") == PACKAGE and
            x.get("deviceSession") == route["deviceSession"] and x.get("modalSession") == route["modalSession"] and
            x.get("activityIdentitySha256") == route["activityIdentitySha256"] and
            x.get("scene") == "td-paywall-modal" and x.get("singleCurrentModal") is True and
            x.get("proPlanVisible") is False and x.get("nativeHierarchy") is True and
            x.get("physicalSizePx") == list(PIXELS) and type(x.get("densityDpi")) is int and
            x["densityDpi"] == 480 and x.get("settingsScale") == scale and x.get("activityScale") == scale,
            "CURRENT_MODAL_DEVICE_OR_SCALE_UNPROVEN")
    markers = arr(x.get("visibleOtherSceneMarkers"))
    require(all(token(k) for k in markers) and not WRONG.intersection(markers) and not markers,
            "COMPETING_SCENE_OR_MODAL")
    t = x.get("observedNs")
    require(timestamp(t) and route["openedNs"] <= t and
            (0 < frame["screenshotStartNs"] - t <= 10**10 if phase == "before" else
             0 < t - frame["screenshotEndNs"] <= 10**10), "STALE_OR_UNBOUND_CAPTURE")
    modal = box(x.get("modalBounds"))
    hits = {}
    for item in arr(x.get("witnesses")):
        n = obj(item)
        label = n.get("label")
        require(isinstance(label, str) and label in WITNESSES and label not in hits, "UNKNOWN_OR_DUPLICATE_NATIVE_LABEL")
        expected_role, expected_parent, enabled = WITNESSES[label]
        require(n.get("role") == expected_role and n.get("owner") == expected_parent and
                n.get("package") == PACKAGE and n.get("visible") is True and
                n.get("labelSource") == "native-semantic" and
                (enabled is None or n.get("enabled") is enabled), "NATIVE_LABEL_ROLE_STATE_UNPROVEN")
        if expected_parent in ("free-radio", "td-radio-selected"):
            require(n.get("ownerRole") == "radio" and n.get("ownerSelected") is (expected_parent == "td-radio-selected"),
                    "PLAN_SELECTION_UNPROVEN")
        b, owner = box(n.get("bounds")), box(n.get("ownerBounds"))
        require(fits(b, owner) and fits(owner, modal), "NATIVE_LABEL_OWNERSHIP_UNPROVEN")
        hits[label] = (b, owner, expected_parent)
    for names in (SECTIONS["free"], SECTIONS["td"]):
        if names <= hits.keys():
            require(len({hits[k][1] for k in names}) == 1, "PLAN_CARD_OWNERSHIP_MISMATCH")
    if (SECTIONS["free"] | SECTIONS["td"]) <= hits.keys():
        free, td = hits["Free"][1], hits["Tournament Director"][1]
        require(free[3] <= td[1], "PLAN_CARD_OWNERSHIP_MISMATCH")
    return hits


def inspect(expected, packet, png_bytes):
    """Content binding only. png_bytes(path, externally_pinned_sha) returns immutable original bytes."""
    x, p = obj(expected), obj(packet)
    require(x.get("schema") == "snapscore-android-td-expect/v1" and x.get("repo") == REPO and
            all(hexid(x.get(k), 40) for k in BIND[:3]) and hexid(x.get("apkSha256"), 64) and
            all(token(x.get(k), r"[1-9][0-9]{0,19}") for k in ("runId", "runAttempt", "artifactId")),
            "INDEPENDENT_EXPECTATION_REQUIRED")
    require(p.get("schema") == "snapscore-android-td-capture/v1" and p.get("repo") == REPO and
            all(p.get(k) == x[k] for k in BIND), "EXACT_SOURCE_BUILD_JOB_DRIFT")
    require(p.get("scope") == "ordinary-free-host-td-offline-fallback" and
            p.get("profile") == "android-compact", "WRONG_DEVICE_OR_PAYWALL_SCOPE")
    seen_scales, seen_png, seen_ids, seen_paths, review = set(), set(), set(), set(), []
    for lane in arr(p.get("lanes"), 2):
        l = obj(lane)
        scale = l.get("observedScale")
        require(isinstance(scale, str) and scale in SCALES and scale not in seen_scales, "UNAPPROVED_OR_DUPLICATE_SCALE")
        seen_scales.add(scale)
        route = verify_route(l.get("route"))
        covered, prior = set(), route["openedNs"]
        frames = arr(l.get("frames"), 7)
        require(bool(frames), "NO_PAYWALL_FRAMES")
        for index, frame in enumerate(frames):
            f = obj(frame)
            ident, path, digest = f.get("frameId"), f.get("path"), f.get("pngSha256")
            require(token(ident) and isinstance(path, str) and hexid(digest, 64) and
                    ident not in seen_ids and path not in seen_paths and digest not in seen_png,
                    "REUSED_FRAME_ID_PATH_OR_PNG")
            check_path(path)
            seen_ids.add(ident)
            seen_paths.add(path)
            seen_png.add(digest)
            require(f.get("kind") == "original-full-native-screenshot" and f.get("syntheticFallback") is False and
                    timestamp(f.get("screenshotStartNs")) and timestamp(f.get("screenshotEndNs")) and
                    prior < f["screenshotStartNs"] <= f["screenshotEndNs"], "UNBOUND_OR_REPROCESSED_FRAME")
            before = observation(f.get("before"), "before", f, route, scale)
            after = observation(f.get("after"), "after", f, route, scale)
            require(f["before"]["observedNs"] >= prior and before == after, "CAPTURE_CHANGED_OR_STALE")
            prior = f["after"]["observedNs"]
            section = {k for k, needs in SECTIONS.items() if needs <= before.keys()}
            require(section and (index != 0 or "top" in section), "TOP_ANCHOR_OR_SECTION_NOT_OBSERVED")
            # Net new coverage per raw frame. One honest full frame may cover multiple
            # sections; separate identical logical rows/redundant viewport frames cannot.
            require(bool(section - covered), "NO_DISTINCT_SECTION_COVERAGE")
            covered |= section
            image = png_bytes(path, digest)
            require(isinstance(image, bytes) and len(image) <= MAX_BYTES and sha(image) == digest, "PNG_DIGEST_DRIFT")
            raw_png_shape(image)
            review.append({"observedScale": scale, "frameId": ident, "path": path, "pngSha256": digest,
                           "sections": sorted(section), "nativeLabelTextNotPixelProof": sorted(before)})
        require(covered == set(SECTIONS), "PAYWALL_SECTION_MISSING")
    require(seen_scales == SCALES, "BOTH_OBSERVED_SCALES_REQUIRED")
    return {"status": "PAINTED_TEXT_REVIEW_REQUIRED", "source": {k: x[k] for k in BIND},
            "visionInputs": review, "semanticValidationOnly": True, "paintedTextProven": False,
            "nativeAcceptance": False, "checkoutOrStoreVerified": False}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--expect", type=Path, required=True)
    ap.add_argument("--expect-sha256", required=True)
    ap.add_argument("--artifact-root", type=Path, required=True)
    a = ap.parse_args()
    try:
        e = obj(strict_json(pinned(a.expect, a.expect_sha256)))
        root = a.artifact_root
        require(root.is_dir() and not root.is_symlink(), "UNSAFE_ARTIFACT_ROOT")
        p = strict_json(pinned(root / "td-capture.json", e.get("captureManifestSha256")))
        out = inspect(e, p, lambda path, digest: pinned(path_in(root, path), digest))
    except (Blocked, OSError, RecursionError) as exc:
        out = {"status": "BLOCKED", "reason": str(exc) if isinstance(exc, Blocked) else "INPUT_READ_FAILED",
               "paintedTextProven": False, "nativeAcceptance": False}
    print(json.dumps(out, sort_keys=True))
    # There is deliberately no successful pixel adjudication or gate exit in this companion.
    return 78


if __name__ == "__main__":
    sys.exit(main())
