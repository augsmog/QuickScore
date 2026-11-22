import copy
import functools
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib

import paywall_evidence as v

BINDING = {"sourceSha": "1"*40, "sourceTree": "2"*40, "integrationHead": "3"*40, "apkSha256": "4"*64,
           "runId": "42", "runAttempt": "1", "artifactId": "91"}


def chunk(kind, body):
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(body, zlib.crc32(kind)))


@functools.lru_cache
def data_for(size):
    w, h = size
    return (chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(bytes(h * (w * 3+1)), 1)))


def fixture_png(tag, size=v.PIXELS):
    # Intentionally blank synthetic placeholder for tests. Passing input checks
    # on this file must never earn a painted-text or native pass.
    return b"\x89PNG\r\n\x1a\n" + data_for(size) + chunk(b"tEXt", b"test\0"+tag.encode()) + chunk(b"IEND", b"")


def witnesses(*sections):
    groups = {
        "Run the game. We do the math.": ([70, 300, 900, 400], [0,120,1080,2300]),
        "Close": ([60,150,165,240], [60,150,165,240]),
        "Restore Purchases": ([580,150,990,240], [580,150,990,240]),
        "Free": ([140,510,230,570], [60,460,1020,730]),
        "Current plan": ([250,510,425,570], [60,460,1020,730]),
        "Tournament Director": ([140,810,520,900], [60,765,1020,1250]),
        "$79.99/year": ([670,870,970,970], [60,765,1020,1250]),
        "Currently unavailable": ([150,1305,930,1380], [60,1270,1020,1440]),
        "Renews yearly. Cancel anytime.": ([150,1460,930,1525], [0,120,1080,2300]),
    }
    result = []
    for section in sections:
        for text in sorted(v.SECTIONS[section]):
            role, owner, enabled = v.WITNESSES[text]
            entry = dict(label=text, role=role, owner=owner, visible=True, package=v.PACKAGE,
                         labelSource="native-semantic", bounds=list(groups[text][0]), ownerBounds=list(groups[text][1]),
                         enabled=enabled)
            if owner in ("free-radio", "td-radio-selected"):
                entry.update(ownerRole="radio", ownerSelected=(owner=="td-radio-selected"))
            result.append(entry)
    return result


class Contract(unittest.TestCase):
    def setUp(self):
        self.expect = dict(schema="snapscore-android-td-expect/v1", repo=v.REPO, **BINDING)
        self.packet = dict(schema="snapscore-android-td-capture/v1", repo=v.REPO, **BINDING,
                           scope="ordinary-free-host-td-offline-fallback", profile="android-compact", lanes=[])
        self.files = {}
        self.add_lane("1.000", [("top","free"), ("td","disabled")])
        self.add_lane("1.300", [("top",), ("free","td"), ("disabled",)])

    def add_lane(self, scale, desc):
        route = dict(mode="ordinary-ui", fromScene="round-settings", fromObserved=True,
                     actionId="contest-start", actionLabel="Start", enabled=True, pressCount=1,
                     openedScope="td-paywall-modal", openedObserved=True, selectedTournament=True, sourceHasRealDraft=True,
                     directRouteOrSyntheticFallback=False, initiatedPurchaseOrRestore=False, actionNs=100, openedNs=110,
                     deviceSession=scale, modalSession="modal:"+scale, activityIdentitySha256="5"*64)
        frames = []
        for i, sections in enumerate(desc):
            frame_id, pos = scale+":"+str(i), 120 + 20*i
            path = f"{scale}/frame-{i}.png"
            self.files[path] = fixture_png(frame_id)
            frame = dict(frameId=frame_id, path=path, pngSha256=v.sha(self.files[path]),
                         kind="original-full-native-screenshot", syntheticFallback=False,
                         screenshotStartNs=pos+2, screenshotEndNs=pos+5)
            for name, tick in (("before", pos+1), ("after", pos+6)):
                frame[name] = dict(phase=name, frameId=frame_id, deviceSession=scale, modalSession=route["modalSession"],
                                   activityIdentitySha256=route["activityIdentitySha256"], package=v.PACKAGE,
                                   foregroundPackage=v.PACKAGE, scene="td-paywall-modal", observedNs=tick,
                                   singleCurrentModal=True, nativeHierarchy=True, visibleOtherSceneMarkers=[],
                                   settingsScale=scale, activityScale=scale, physicalSizePx=list(v.PIXELS), densityDpi=480,
                                   modalBounds=[0,120,1080,2300], proPlanVisible=False, witnesses=witnesses(*sections))
            frames.append(frame)
        self.packet["lanes"].append(dict(observedScale=scale, route=route, frames=frames))

    def take(self, path, _digest):
        return self.files[path]

    def get(self):
        return v.inspect(self.expect, self.packet, self.take)

    def assert_blocked(self, reason):
        with self.assertRaisesRegex(v.Blocked, "^"+reason+"$"):
            self.get()

    def both(self, lane, frame):
        return self.packet["lanes"][lane]["frames"][frame]

    def mutate_labels(self, frame, expected_label, **changes):
        for phase in ("before", "after"):
            hit = next(x for x in frame[phase]["witnesses"] if x["label"] == expected_label)
            hit.update(changes)

    def test_measured_exact_labels_and_frames_only_admit_review_never_glyphs(self):
        out = self.get()
        self.assertEqual("PAINTED_TEXT_REVIEW_REQUIRED", out["status"])
        self.assertTrue(out["semanticValidationOnly"])
        self.assertFalse(out["nativeAcceptance"])
        self.assertFalse(out["paintedTextProven"])
        self.assertEqual(len(out["visionInputs"]), 5)
        self.assertIn("$79.99/year", out["visionInputs"][1]["nativeLabelTextNotPixelProof"])

    def test_one_full_frame_may_cover_every_section_without_fake_duplicates(self):
        self.packet["lanes"].pop(0)
        self.add_lane("1.000", [("top", "free", "td", "disabled")])
        self.assertEqual(4, len(self.get()["visionInputs"]))

    def test_wrapper_cannot_offer_vision_on_one_missing_required_scale(self):
        self.packet["lanes"].pop()
        self.assert_blocked("BOTH_OBSERVED_SCALES_REQUIRED")

    def test_screenshot_duplicate_id_hash_or_path_blocks(self):
        for key in ("frameId","pngSha256","path"):
            saved = self.both(0,1)[key]
            self.both(0,1)[key] = self.both(0,0)[key]
            with self.subTest(key=key):
                self.assert_blocked("REUSED_FRAME_ID_PATH_OR_PNG")
            self.both(0,1)[key] = saved

    def test_changed_only_clock_or_png_bytes_with_same_semantic_coverage_do_not_count(self):
        a, b = self.both(0,0), self.both(0,1)
        for phase in ("before","after"):
            b[phase]["witnesses"] = copy.deepcopy(a[phase]["witnesses"])
        self.assert_blocked("NO_DISTINCT_SECTION_COVERAGE")

    def test_exact_hash_drift_not_same_product_by_name(self):
        for field in BINDING:
            saved = self.packet[field]
            self.packet[field] = "8"*len(saved)
            with self.subTest(field=field):
                self.assert_blocked("EXACT_SOURCE_BUILD_JOB_DRIFT")
            self.packet[field] = saved

    def test_ordinary_route_pins_start_not_direct_route_or_synthetic(self):
        r = self.packet["lanes"][0]["route"]
        for k,bad in (("directRouteOrSyntheticFallback",True),("actionId","paywall-close"),("pressCount",2),
                      ("enabled",False),("fromScene","games"),("sourceHasRealDraft",False),
                      ("openedObserved",False),("initiatedPurchaseOrRestore",True)):
            saved = r[k]
            r[k] = bad
            with self.subTest(k=k):
                self.assert_blocked("ORDINARY_START_ROUTE_UNPROVEN")
            r[k] = saved

    def test_session_activity_overlay_and_activity_scale_must_be_current_together(self):
        ob = self.both(1,0)["after"]
        for field, bad in (("settingsScale","1.000"),("activityScale","1.000"),
                           ("modalSession","stale"),("foregroundPackage","android.system"),
                           ("singleCurrentModal",False),("proPlanVisible",True),
                           ("activityIdentitySha256","6"*64),("physicalSizePx",[1080,2340])):
            old = ob[field]
            ob[field] = bad
            with self.subTest(field=field):
                self.assert_blocked("CURRENT_MODAL_DEVICE_OR_SCALE_UNPROVEN")
            ob[field] = old
        ob["visibleOtherSceneMarkers"] = ["contest-start"]
        self.assert_blocked("COMPETING_SCENE_OR_MODAL")

    def test_disabled_is_real_cta_state_not_label_or_unrelated_ancestor(self):
        self.mutate_labels(self.both(0,1), "Currently unavailable", enabled=True)
        self.assert_blocked("NATIVE_LABEL_ROLE_STATE_UNPROVEN")
        self.mutate_labels(self.both(0,1), "Currently unavailable", enabled=False, owner="modal")
        self.assert_blocked("NATIVE_LABEL_ROLE_STATE_UNPROVEN")

    def test_exact_price_no_prefix_ocr_or_pro(self):
        f = self.both(0,1)
        for literal in ("$79.99/", "$24.99/year", "$12.99/month"):
            with self.subTest(literal=literal):
                self.mutate_labels(f, "$79.99/year", label=literal)
                self.assert_blocked("UNKNOWN_OR_DUPLICATE_NATIVE_LABEL")
                self.mutate_labels(f, literal, label="$79.99/year")
        self.mutate_labels(f, "$79.99/year", labelSource="ocr")
        self.assert_blocked("NATIVE_LABEL_ROLE_STATE_UNPROVEN")

    def test_ambiguous_or_split_pair_and_wrong_td_selection_reject(self):
        f = self.both(0,1)
        self.mutate_labels(f, "$79.99/year", ownerSelected=False)
        self.assert_blocked("PLAN_SELECTION_UNPROVEN")
        self.mutate_labels(f, "$79.99/year", ownerSelected=True, ownerBounds=[620,765,1020,1250])
        self.assert_blocked("PLAN_CARD_OWNERSHIP_MISMATCH")
        self.mutate_labels(f, "$79.99/year", ownerBounds=[60,765,1020,1250])
        f["before"]["witnesses"].append(copy.deepcopy(f["before"]["witnesses"][0]))
        self.assert_blocked("UNKNOWN_OR_DUPLICATE_NATIVE_LABEL")

    def test_clipped_or_changed_native_bounds_do_not_show_scope(self):
        f = self.both(0,1)
        self.mutate_labels(f, "Currently unavailable", bounds=[150,2320,930,2500])
        self.assert_blocked("NATIVE_BOUNDS_OUTSIDE_FRAME")
        self.mutate_labels(f, "Currently unavailable", bounds=[150,1305,930,1380])
        f["after"]["witnesses"][0]["bounds"][0] += 1
        self.assert_blocked("CAPTURE_CHANGED_OR_STALE")

    def test_no_disabled_section_leaves_missing_even_if_semantics_elsewhere(self):
        for phase in ("before","after"):
            f = self.both(0,1)[phase]
            f["witnesses"] = [x for x in f["witnesses"] if x["label"] not in v.SECTIONS["disabled"]]
        self.assert_blocked("PAYWALL_SECTION_MISSING")

    def test_crop_legacy_wrong_viewport_tamper_and_traversal_fail(self):
        f = self.both(0,0)
        for viewport in ((1080,2340),(960,1430)):
            png = fixture_png("old-monitor", viewport)
            self.files[f["path"]] = png
            f["pngSha256"] = v.sha(png)
            self.assert_blocked("FULL_COMPACT_FRAME_REQUIRED")
        self.files[f["path"]] = fixture_png("edited")
        self.assert_blocked("PNG_DIGEST_DRIFT")
        f["path"] = "../out.png"
        self.assert_blocked("UNSAFE_PNG_PATH")

    def test_cli_pending_not_success_and_capture_manifest_external_pin(self):
        with tempfile.TemporaryDirectory() as folder:
            tmp = Path(folder)
            root = tmp / "capture"
            root.mkdir()
            for rel, data in self.files.items():
                path = root / rel
                path.parent.mkdir(exist_ok=True)
                path.write_bytes(data)
            raw = json.dumps(self.packet).encode()
            (root / "td-capture.json").write_bytes(raw)
            e = json.dumps(dict(self.expect, captureManifestSha256=v.sha(raw))).encode()
            (tmp / "expected.json").write_bytes(e)
            args = [sys.executable, "-B", str(Path(v.__file__)), "--artifact-root", str(root),
                    "--expect", str(tmp / "expected.json"), "--expect-sha256", v.sha(e)]
            command = subprocess.run(args, capture_output=True, check=False)
            self.assertEqual(command.returncode, 78)
            self.assertEqual(json.loads(command.stdout)["status"], "PAINTED_TEXT_REVIEW_REQUIRED")
            (root/"td-capture.json").write_text("{}")
            tamper = subprocess.run(args, capture_output=True, check=False)
            self.assertEqual(json.loads(tamper.stdout)["reason"], "INPUT_DIGEST_DRIFT")


if __name__ == "__main__":
    unittest.main()
