"""Local fixture tests only; no command touches a simulator."""
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import offline_layout as qa

A = "10000000-0000-4000-8000-000000000001"
B = "20000000-0000-4000-8000-000000000002"
NAME = "snapscore-offline-layout-" + "a" * 32
HASH = "0" * 64


def row(id_, name, state="Shutdown"):
    return dict(udid=id_, name=name, state=state, deviceTypeIdentifier=qa.DEVICE)


class Layout(unittest.TestCase):
    def test_readback_scale_is_fail_closed_not_substring_matched(self):
        for v in ("large", "UICTContentSizeCategoryL", "Content size category: Large", "Current content size: large"):
            self.assertTrue(qa.standard_scale(v))
        for v in ("", "unknown", "extra-large", "accessibility-large", "large\nerror"):
            self.assertFalse(qa.standard_scale(v))

    def test_global_duplicate_or_absent_target_is_not_admitted(self):
        for groups in ({"other":[row(A, NAME)]}, {qa.RUNTIME:[row(A,NAME)], "other":[row(A,"existing")]}):
            with patch.object(qa, "records", return_value=groups):
                with self.assertRaisesRegex(qa.build.Blocked, "DEVICE_ADMISSION_UNVERIFIED"):
                    qa.all_devices({})

    def test_target_ownership_requires_id_name_runtime_type(self):
        good = {A:(qa.RUNTIME,row(A,NAME))}
        self.assertEqual(qa.owned(good,A,NAME)["name"], NAME)
        for bad in ({B:(qa.RUNTIME,row(B,NAME))}, {A:("other",row(A,NAME))},
                    {A:(qa.RUNTIME,{**row(A,NAME),"deviceTypeIdentifier":"other"})},
                    {**good,B:(qa.RUNTIME,row(B,NAME))}):
            with self.assertRaisesRegex(qa.build.Blocked, "IDENTITY_DRIFT"):
                qa.owned(bad,A,NAME,allow_absent=True)

    def test_cleanup_targets_only_verified_uuid_and_detects_leftover_directory(self):
        calls = []
        snapshots = [{A:(qa.RUNTIME,row(A,NAME,"Booted")),B:("other",row(B,"existing"))},
                     {A:(qa.RUNTIME,row(A,NAME)),B:("other",row(B,"existing"))},
                     *[{B:("other",row(B,"existing"))}]*4]
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for exists in (False,True):
                if exists: (root / "Library/Developer/CoreSimulator/Devices" / A).mkdir(parents=True)
                with patch.object(qa,"all_devices",side_effect=snapshots), patch.object(
                        qa,"sim",side_effect=lambda _env,*cmd,**_:calls.append(cmd)), patch.object(qa.time,"sleep"):
                    if exists:
                        with self.assertRaisesRegex(qa.build.Blocked,"CLEANUP_UNVERIFIED"):
                            qa.cleanup({},A,NAME,root)
                    else:
                        qa.cleanup({},A,NAME,root)
        self.assertEqual(calls,[("shutdown",A),("delete",A)]*2)

    def test_install_binds_exact_executable_and_embedded_bundle(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            app = root / "release" / "SnapScore.app"
            installed = root / A / "SnapScore.app"
            for f in (app,installed):
                f.mkdir(parents=True)
                (f/"SnapScore").write_bytes(b"bin")
                (f/"main.jsbundle").write_bytes(b"js")
            with patch.object(qa,"sim",side_effect=["",str(installed),"",str(installed)]):
                qa.matching_install({},A,app,{"executableSha256":qa.build.digest(b"bin")})
                (installed/"main.jsbundle").write_bytes(b"stale")
                with self.assertRaisesRegex(qa.build.Blocked,"INSTALL_NOT_VERIFIED"):
                    qa.matching_install({},A,app,{"executableSha256":qa.build.digest(b"bin")})

    def test_geometry_projection_preserves_real_findings_and_does_not_emit_raw_fields(self):
        keys = [flow+"/"+slug for flow,_,slug in qa.CHECKPOINTS]
        shots = dict(zip(keys, ["a"*64,"b"*64]))
        b = dict(sourceSha=qa.build.SHA,buildHash=HASH,fontScale=1.0,profile=qa.PROFILE,
                 checkpoints=[dict(flow=flow,checkpoint=slug,screenshotSha256=shots[flow+"/"+slug],
                                   context=dict(fontScale=1.0)) for flow,_,slug in qa.CHECKPOINTS])
        g = dict(ok=False,results=[dict(flow=flow,checkpoint=slug,kept=[dict(rule=4,reason="fixture raw")])
                                   for flow,_,slug in qa.CHECKPOINTS])
        result = qa.summarize_evidence(b,g,shots,HASH,1)
        self.assertEqual(result["keptByRule"],{4:2})
        self.assertFalse(result["geometryPass"])
        self.assertFalse(result["inAppFontScaleProven"])
        self.assertNotIn("raw",str(result))
        for key in ("sourceSha","buildHash","fontScale","profile"):
            bad=copy.deepcopy(b)
            bad[key]="mismatch"
            with self.assertRaisesRegex(qa.build.Blocked,"GEOMETRY_UNVERIFIED"):
                qa.summarize_evidence(bad,g,shots,HASH,1)
        with self.assertRaisesRegex(qa.build.Blocked,"GEOMETRY_UNVERIFIED"):
            qa.summarize_evidence(b,g,shots,HASH,0)
        with self.assertRaisesRegex(qa.build.Blocked,"GEOMETRY_UNVERIFIED"):
            qa.summarize_evidence(b,g,{keys[0]:"c"*64,keys[1]:shots[keys[1]]},HASH,1)

    def test_release_flags_prove_exact_static_auth_telemetry_guards_not_ip_isolation(self):
        with tempfile.TemporaryDirectory() as d:
            top = Path(d)
            refs = {
                'src/config/offline.ts': 'process.env.EXPO_PUBLIC_OFFLINE_MODE === "true"',
                'src/config/auth.ts': 'REAL_AUTH_CONFIGURED = !OFFLINE_MODE &&',
                'src/config/features.ts': 'process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING === "true"',
                'app/_layout.tsx': 'enabled: !isPublicShare && !CROSS_DEVICE_SHARING_ENABLED',
                'src/config/posthog.tsx': 'Boolean(projectToken && host)',
                'src/services/purchases.ts': 'if (!apiKey)',
            }
            for path, guard in refs.items():
                file = top/'scoresnap'/path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(guard)
            env = qa.build.environment(top/'home','/bin',qa.build.COMPILE_URL,'fake',qa.DEVELOPER_DIR)
            env.update(EXPO_PUBLIC_OFFLINE_MODE='true',EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING='true',
                       EXPO_PUBLIC_E2E_COURSE_FIXTURE='true')
            evidence = qa.build.offline_layout_policy(top,env)
            self.assertTrue(evidence["offlineModeBuildFlag"])
            self.assertFalse(evidence["sentryEnabledSourceGuard"])
            self.assertFalse(evidence["realAuthSourceGuard"])
            self.assertFalse(evidence["osEgressRestricted"])
            for delta in (dict(EXPO_PUBLIC_OFFLINE_MODE='false'),
                          dict(EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING='false'),
                          dict(EXPO_PUBLIC_SUPABASE_URL='https://unexpected.example.invalid'),
                          dict(EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN='unexpected'),
                          dict(EXPO_PUBLIC_REVENUECAT_APPLE_KEY='unexpected')):
                with self.assertRaisesRegex(qa.build.Blocked,'SOURCE_PRIVACY_POLICY_UNVERIFIED'):
                    qa.build.offline_layout_policy(top,env|delta)
            (top/'scoresnap/app/_layout.tsx').write_text('enabled: true')
            with self.assertRaisesRegex(qa.build.Blocked,'SOURCE_PRIVACY_POLICY_UNVERIFIED'):
                qa.build.offline_layout_policy(top,env)

    def test_wrong_host_never_falls_through_to_boot(self):
        with patch.object(qa.build,"host",side_effect=qa.build.Blocked("HOSTED_ARM64_MAC_REQUIRED")), \
             patch.object(qa,"sim") as command:
            receipt=qa.diagnostic(Path("."),Path("."),{})
        command.assert_not_called()
        self.assertFalse(receipt["buildSucceeded"] or receipt["booted"] or receipt["installed"] or
                         receipt["backendStarted"] or receipt["screenshotsUploaded"] or receipt["releaseVerdict"])


if __name__ == '__main__':
    unittest.main()
