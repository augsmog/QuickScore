import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import types
import unittest
from unittest.mock import patch

import build
import compile_only as c


class CompileOnly(unittest.TestCase):
    def test_fixture_is_exact_nonservice_token_private_and_not_backend_proof(self):
        with TemporaryDirectory() as temp:
            key_file, receipt_file = c.fixture(Path(temp))
            key = key_file.read_text()
            receipt = json.loads(receipt_file.read_text())
            self.assertEqual(0o600, key_file.stat().st_mode & 0o777)
            self.assertEqual(0o600, receipt_file.stat().st_mode & 0o777)
            build.endpoint(build.COMPILE_URL, key, receipt, True)
            for url, jwt, r, m in [
                (build.COMPILE_URL, key, receipt, False),
                ("http://localhost:55438", key, receipt, True),
                (build.COMPILE_URL, key[:-1] + "B", receipt, True),
                (build.COMPILE_URL, key, {**receipt, "backend_started": True}, True),
                (build.COMPILE_URL, key, {**receipt, "no_live_sessions": True}, True),
            ]:
                with self.assertRaises(build.Blocked):
                    build.endpoint(url, jwt, r, m)
            with self.assertRaises(FileExistsError):
                c.fixture(Path(temp))

    def test_port_scope_fails_closed_without_retaining_inventory(self):
        def completed(code, out=b"", err=b""):
            return lambda *a, **kw: types.SimpleNamespace(returncode=code, stdout=out, stderr=err)
        c.assert_port_unused(completed(1))
        with self.assertRaisesRegex(build.Blocked, "FIXTURE_PORT_IN_USE"):
            c.assert_port_unused(completed(0, b"unpublished"))
        with self.assertRaisesRegex(build.Blocked, "INSPECTION_FAILED"):
            c.assert_port_unused(completed(1, err=b"unpublished"))

    def test_build_is_generic_simulator_release_with_single_arch_unsigned(self):
        commands = build.commands(Path("/app"), Path("/dd"), True)
        self.assertEqual(["npm", "prebuild", "pods", "release"], [x[0] for x in commands])
        self.assertEqual(1980, sum(x[3] for x in commands))
        release = commands[-1][1]
        self.assertIn("generic/platform=iOS Simulator", release)
        self.assertIn("Release", release)
        self.assertIn("CODE_SIGNING_ALLOWED=NO", release)
        self.assertIn("ARCHS=arm64", release)
        self.assertNotIn("simctl", " ".join(release))

    def test_redaction_projection_never_exports_internal_fields(self):
        doc = {"status": "UNSIGNED_SIMULATOR_RELEASE_BUILT", "lastPhase": "artifact",
               "phaseSeconds": {"npm": 12.34, "generated-policy": 0.23, "secret": 23, "release": "secrets"},
               "generatedPolicy": {"ats": "stock-local-networking-removed", "raw": "private-value"},
               "artifact": {"sha256": "a"*64, "executableSha256": "b"*64, "bytes": 12,
                            "files": ["raw-path-not-exported"]},
               "packageLockSha256": "c"*64, "resolvedPodsSha256": "d"*64,
               "freeBytesAfter": 12924335104, "appRelativePath": "raw-app-not-exported",
               "binaryUUID": "internal", "secret": "not-exported"}
        pub = c.project_evidence(doc, True)
        self.assertEqual(pub["phaseSeconds"], {"npm": 12.34, "generated-policy": 0.23})
        self.assertNotIn("generatedPolicy", pub)
        self.assertNotIn("private-value", json.dumps(pub))
        self.assertEqual(pub["architecture"], "arm64")
        self.assertNotIn("raw-path", json.dumps(pub))
        self.assertNotIn("raw-app", json.dumps(pub))
        self.assertNotIn("secret", json.dumps(pub))
        self.assertNotIn("binaryUUID", pub)

    def test_branch_and_parent_fail_before_side_effects(self):
        sha, tree = "a"*40, "b"*40
        env = {"EXPECTED_HARNESS_SHA": sha, "EXPECTED_HARNESS_TREE": tree,
               "GITHUB_SHA": sha, "GITHUB_REF": c.REF}
        with patch.object(c, "read", side_effect=[sha, tree, "", f"{sha} {c.REVIEWED_PARENT}", c.REVIEWED_PARENT_TREE, f"{c.REVIEWED_PARENT} {c.MAIN}"]):
            self.assertEqual(c.harness_binding(Path("/harness"), env), (sha, tree))
        with patch.object(c, "read", side_effect=[sha, tree, "", sha + " " + "f"*40]):
            with self.assertRaisesRegex(build.Blocked, "HARNESS_PARENT_CHANGED"):
                c.harness_binding(Path("/harness"), env)
        with patch.object(c, "read") as read:
            with self.assertRaisesRegex(build.Blocked, "HARNESS_SCOPE"):
                c.harness_binding(Path("/harness"), {**env, "GITHUB_REF": "refs/heads/main"})
            read.assert_not_called()

    def test_reviewed_parent_tree_and_ancestry_independently_fail_closed(self):
        sha, tree = "a"*40, "b"*40
        env = {"EXPECTED_HARNESS_SHA": sha, "EXPECTED_HARNESS_TREE": tree,
               "GITHUB_SHA": sha, "GITHUB_REF": c.REF}
        head = [sha, tree, "", f"{sha} {c.REVIEWED_PARENT}"]
        for readbacks, reason in [
            (head+["e"*40], "HARNESS_PARENT_TREE_CHANGED"),
            (head+[c.REVIEWED_PARENT_TREE, f"{c.REVIEWED_PARENT} {'f'*40}"], "HARNESS_MAIN_ANCESTRY_CHANGED"),
        ]:
            with self.subTest(reason=reason), patch.object(c, "read", side_effect=readbacks):
                with self.assertRaisesRegex(build.Blocked, reason):
                    c.harness_binding(Path("/harness"), env)

    def test_mock_composed_failure_preserves_phase_and_cleans(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            env = {"RUNNER_TEMP": temp, "DEVELOPER_DIR": c.DEVELOPER_DIR}
            calls = []

            def blocked(args):
                target = Path(args.out)
                calls.append(target.parent)
                self.assertTrue(args.compile_only)
                target.mkdir()
                (target / "receipt.json").write_text(json.dumps({"lastPhase": "pods",
                    "phaseSeconds": {"npm": 23.44, "pods": 300.01}, "raw": "secret"}))
                raise build.Blocked("PHASE_TIMEOUT")

            with patch.object(build, "host"), patch.object(c, "harness_binding", return_value=("a"*40,"b"*40)), \
                 patch.object(build, "source", return_value="c"*64), patch.object(c, "read", return_value="7000000000"), \
                 patch.object(c, "assert_port_unused"), patch.object(c, "select_node", return_value=os.environ["PATH"]), \
                 patch.object(c.shutil, "disk_usage", return_value=types.SimpleNamespace(free=14*1024**3)), \
                 patch.object(build, "build", side_effect=blocked):
                result, ok = c.diagnostic(root / "harness", root / "product", env)
            self.assertFalse(ok)
            self.assertEqual(result["reason"], "PHASE_TIMEOUT")
            self.assertEqual(result["lastPhase"], "pods")
            self.assertEqual(result["phaseSeconds"]["pods"], 300.01)
            self.assertTrue(result["temporaryRootRemoved"])
            self.assertFalse(calls[0].exists())
            self.assertNotIn("secret", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
