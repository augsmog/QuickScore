"""Pure file/policy and mocked compile-only tests; never starts npm, Pods, Xcode or a runtime."""
import json
import plistlib
from pathlib import Path
import types
import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

import build as b
import compile_only as c
import native_policy as p

ATS = p.ATS_KEY
BASELINE = {p.ARBITRARY: False, p.LOCAL: True}
OUTPUT = {p.ARBITRARY: False}
OTA = {"EXUpdatesEnabled": True, "EXUpdatesURL": "https://example.invalid/update",
       "EXUpdatesRequestHeaders": {"unexpected": "value"}, "EXUpdatesCodeSigningMetadata": {},
       "EXUpdatesCodeSigningCertificate": "never-retain", "unrelated": "keep"}


class GeneratedCompilePolicy(unittest.TestCase):
    def setUp(self):
        d = TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.root = Path(d.name)
        self.app = self.root / "app"
        self.info = self.app / "ios/SnapScore/Info.plist"
        self.expo = self.app / "ios/SnapScore/Supporting/Expo.plist"
        self.expo.parent.mkdir(parents=True)
        self.expo.write_bytes(plistlib.dumps(OTA))

    def test_compile_only_stock_baseline_removes_only_local_and_all_ota_transport(self):
        original = {ATS: BASELINE, "app-field": "retained"}
        self.info.write_bytes(plistlib.dumps(original))
        report = b.generated_policy(self.app, compile_only=True)
        self.assertEqual(plistlib.loads(self.info.read_bytes()), {ATS: OUTPUT, "app-field": "retained"})
        self.assertEqual(plistlib.loads(self.expo.read_bytes()), {"EXUpdatesEnabled": False, "unrelated": "keep"})
        self.assertEqual(report["ats"], "stock-local-networking-removed")
        self.assertNotEqual(report["before"]["info"], report["after"]["info"])
        self.assertEqual(original[ATS], BASELINE)
        self.assertNotIn("never-retain", json.dumps(report))

    def test_normal_builder_still_rejects_local_template_and_retains_old_strict_behavior(self):
        self.info.write_bytes(plistlib.dumps({ATS: BASELINE}))
        original = (self.info.read_bytes(), self.expo.read_bytes())
        with self.assertRaisesRegex(ValueError, "EXISTING_BROAD_OR_UNAUDITED_ATS_POLICY"):
            b.generated_policy(self.app)
        self.assertEqual((self.info.read_bytes(), self.expo.read_bytes()), original)
        self.info.write_bytes(plistlib.dumps({ATS: OUTPUT}))
        report = b.generated_policy(self.app)
        self.assertNotIn("ats", report)
        self.assertEqual(plistlib.loads(self.info.read_bytes()), {ATS: OUTPUT})

    def test_input_variants_are_rejected_without_policy_writes(self):
        bad_variants = [
            [], {}, "not-a-dict", {p.ARBITRARY: True, p.LOCAL: True},
            {p.ARBITRARY: 0, p.LOCAL: 1}, {p.ARBITRARY: False, p.LOCAL: False},
            {p.ARBITRARY: False}, {p.LOCAL: True},
            {**BASELINE, "NSExceptionDomains": {}}, {**BASELINE, "NSAllowsArbitraryLoadsInWebContent": False},
            {**BASELINE, "extra": False},
        ]
        for variant in bad_variants:
            with self.subTest(variant=variant):
                data = plistlib.dumps({ATS: variant})
                self.info.write_bytes(data)
                with self.assertRaisesRegex(b.Blocked, "GENERATED_ATS_POLICY_UNEXPECTED"):
                    b.generated_policy(self.app, True)
                self.assertEqual(self.info.read_bytes(), data)
                self.assertEqual(plistlib.loads(self.expo.read_bytes()), OTA)

    def test_missing_malformed_overlarge_untyped_and_symlink_report_fixed_codes(self):
        with self.assertRaisesRegex(b.Blocked, "GENERATED_PLISTS_MISSING"):
            b.generated_policy(self.app, True)
        for value in (b"not a plist", b'<?xml version="1.0"?><plist><dict>', plistlib.dumps([]),
                      b'x' * (1024**2+1)):
            with self.subTest(length=len(value)):
                self.info.write_bytes(value)
                with self.assertRaisesRegex(b.Blocked, "GENERATED_PLIST_INVALID"):
                    b.generated_policy(self.app, True)
        self.info.unlink()
        outside = self.root / "outside.plist"
        expected = plistlib.dumps({ATS: BASELINE})
        outside.write_bytes(expected)
        self.info.symlink_to(outside)
        with self.assertRaisesRegex(b.Blocked, "GENERATED_PLIST_PATH_UNSAFE"):
            b.generated_policy(self.app, True)
        self.assertEqual(outside.read_bytes(), expected)

    def test_generated_success_requires_real_write_readback(self):
        self.info.write_bytes(plistlib.dumps({ATS: BASELINE}))
        with patch.object(Path, "write_bytes", return_value=123):
            with self.assertRaisesRegex(b.Blocked, "GENERATED_PLIST_WRITE_UNVERIFIED"):
                b.generated_policy(self.app, True)

    def final_app(self, ats=OUTPUT, expo=None):
        app = self.root / "SnapScore.app"
        app.mkdir(exist_ok=True)
        (app/"Info.plist").write_bytes(plistlib.dumps({ATS: ats, "CFBundleIdentifier": "com.scoresnap.app",
                                                       "CFBundleSupportedPlatforms": ["iPhoneSimulator"]}))
        (app/"Expo.plist").write_bytes(plistlib.dumps({"EXUpdatesEnabled":False} if expo is None else expo))
        (app/"SnapScore").write_bytes(b"non-executable mock")
        return app

    def test_final_rejects_any_local_field_any_ats_variant_or_signing(self):
        for bad in (BASELINE, {p.ARBITRARY: False, p.LOCAL: False}, {p.ARBITRARY: 0}, {},
                    {**OUTPUT, "NSExceptionDomains": {}}):
            with self.subTest(bad=bad):
                with self.assertRaisesRegex(b.Blocked, "FINAL_ATS_POLICY_INVALID"):
                    b.artifact(self.final_app(bad), True)
        good = self.final_app()
        self.assertGreater(b.artifact(good, True)["bytes"], 0)
        (good/"_CodeSignature").mkdir()
        with self.assertRaisesRegex(b.Blocked, "SIGNED_ARTIFACT_REJECTED"):
            b.artifact(good, True)

    def test_final_rejects_ota_reintroduced_consent_artifact_or_malformed_plist(self):
        for updates in ({"EXUpdatesEnabled": True},
                        {"EXUpdatesEnabled": False, "EXUpdatesURL": "https://example.invalid"}):
            with self.subTest(updates=updates):
                with self.assertRaisesRegex(b.Blocked, "FINAL_OTA_POLICY_INVALID"):
                    b.artifact(self.final_app(expo=updates), True)
        app = self.final_app()
        (app/"Expo.plist").write_bytes(b"<?xml version='1.0'?><plist>")
        with self.assertRaisesRegex(b.Blocked, "FINAL_PLIST_INVALID"):
            b.artifact(app, True)

    def test_exact_policy_block_after_npm_prebuild_reports_distinct_phase_and_no_pod_or_runtime(self):
        source = self.root / "checkout"
        source.mkdir()
        key, fixture = c.fixture(self.root)
        out = self.root / "build"
        args = types.SimpleNamespace(repo=source, out=out, relay=b.COMPILE_URL, anon_file=key,
                        stack_receipt=fixture, developer_dir="/Xcode", minimum_free_bytes=c.FLOOR,
                        compile_only=True)
        calls = []
        def export(_repo, dest):
            src = dest/"scoresnap";src.mkdir(parents=True)
            (src/"package.json").write_bytes(b"app")
            (src/"package-lock.json").write_bytes(b"lock")
            return {}
        def phase(cmd, cwd, *_args):
            calls.append(cmd[0])
            if cmd[0] == "node":
                native = cwd/"ios/SnapScore/Supporting"
                native.mkdir(parents=True)
                (native/"Expo.plist").write_bytes(plistlib.dumps(OTA))
                (native.parent/"Info.plist").write_bytes(plistlib.dumps({ATS: {**BASELINE, "forbidden": True}}))
        def read(cmd,*_args):
            return {"node":"v22.23.5", "npm":"10.9.9", "pod":"1.17.0", "ruby":"3.4.12",
                    "xcodebuild":"Xcode 26.4.1\nBuild version 17E202", "xcrun":"26.4"}[cmd[0]]
        with patch.object(b,"host"), patch.object(b,"source",return_value=b.digest(b"lock")), \
             patch.object(b,"export",side_effect=export), patch.object(b,"phase",side_effect=phase), \
             patch.object(b,"read",side_effect=read), patch.object(b.shutil,"disk_usage",return_value=types.SimpleNamespace(free=c.FLOOR)):
            with self.assertRaisesRegex(b.Blocked, "GENERATED_ATS_POLICY_UNEXPECTED"):
                b.build(args)
        self.assertEqual(calls,["npm","node"])
        record=json.loads((out/"receipt.json").read_text())
        self.assertEqual(record["status"],"BLOCKED")
        self.assertFalse(record["nativeAcceptance"])
        self.assertEqual(record["lastPhase"],"generated-policy")
        self.assertEqual(set(record["phaseSeconds"]),{"npm","prebuild","generated-policy"})
        self.assertEqual(set(c.project_evidence(record, False)), {"lastPhase","phaseSeconds"})
        self.assertIn("GENERATED_ATS_POLICY_UNEXPECTED",c.REASONS)
        with self.assertRaisesRegex(b.Blocked,"BUILD_EVIDENCE_INVALID"):
            c.project_evidence(record|{"status":"UNSIGNED_SIMULATOR_RELEASE_BUILT"},True)


if __name__ == "__main__":
    unittest.main()
