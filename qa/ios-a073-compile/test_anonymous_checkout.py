"""Offline integration test of the exact workflow Bash using a local Git remote."""
import hashlib
import json
import os
from pathlib import Path
import shlex
import sys
import subprocess
from tempfile import TemporaryDirectory
import textwrap
import unittest


HERE = Path(__file__).resolve().parent
WORKFLOW = HERE.parents[1] / ".github/workflows/e2e-ios-sim.yml"
HTTPS = "https://github.com/augsmog/QuickScore.git"
BASE = "72558fff91b58b07ae4a8715c4768f34c24c06cd"
REVIEWED_PARENT = "d6d84c0979f66f2b5b24f9e9cb91d5e60277eec6"
REVIEWED_PARENT_TREE = "f30636418341c6a9f112f921ed797221d660e568"
SOURCE = "c828ebf5ef7372c19db9c73f8cb1adb04d157406"
SOURCE_TREE = "8d2b59b9c2f814fbc54684973fa8e9ddfd2badc3"
LINK = "august-industries-site"
MODULES = '[submodule "different"]\n\tpath = other/path\n\turl = https://example.invalid/unused.git\n'
SCRIPT = WORKFLOW.read_text().split("        run: |\n", 1)[1].split("\n# No checkout", 1)[0]
BODY = textwrap.dedent(SCRIPT)
COMPILE_STUB = '''
import json, os, pathlib, subprocess, sys
fetch_root, product = pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[4])
assert fetch_root.parent == product.parent
assert pathlib.Path(os.environ["RUNNER_TEMP"]) == product.parent.parent
assert os.environ.get("GH_TOKEN") is None and os.environ.get("GITHUB_TOKEN") is None
assert os.environ.get("GIT_CONFIG_COUNT") is None
assert pathlib.Path(os.environ["SIMULATOR_HOME"]) != pathlib.Path(os.environ["HOME"])
assert os.environ.get("GIT_CONFIG_GLOBAL") == "/dev/null"
assert os.environ.get("GIT_CONFIG_NOSYSTEM") == "1"
for repo in (fetch_root, product):
    g = lambda *args: subprocess.check_output(["/usr/bin/git", "-C", str(repo), *args], text=True).strip()
    assert not g("status", "--porcelain")
    assert g("ls-tree", "HEAD", "august-industries-site").startswith("160000 commit ")
    assert (repo / ".gitmodules").is_file() and "august-industries-site" not in (repo / ".gitmodules").read_text()
    assert not list((repo / "august-industries-site").iterdir())
    assert not (repo / ".git/modules").exists()
    assert not (repo / ".git/hooks").exists()
    config = (repo / ".git/config").read_text().casefold()
    assert not any(key in config for key in ("remote", "credential", "extraheader", "recurse"))
    assert not (repo / ".git/refs/heads").exists() or not list((repo / ".git/refs/heads").iterdir())
assert not (fetch_root / "product-marker").exists()
assert (product / "product-marker").read_text() == "synthetic exact product only"
trace = (pathlib.Path(os.environ["HOME"]) / "test-git-trace").read_text()
assert trace.count("checkout --quiet --detach --no-recurse-submodules") == 2
assert trace.count("fetch --quiet --no-tags") == 2
assert "submodule foreach" not in trace and "submodule--helper" not in trace
print(json.dumps({"mockCompileOnly": True, "orphanGitlinkPreserved": True, "redisclosedCredentials": False}))
'''


def git(repo, *args, fail=False):
    env = dict(os.environ, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL="/dev/null")
    result = subprocess.run(["/usr/bin/git", "--no-optional-locks", "-C", str(repo), *args], capture_output=True, text=True, env=env)
    if fail:
        return result
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


class ExactAnonymousCheckout(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.origin = self.root / "origin"
        self.runner = self.root / "runner"
        self.origin.mkdir()
        self.runner.mkdir()
        git(self.origin, "init", "-q", "--template=")
        git(self.origin, "config", "user.email", "qa@example.invalid")
        git(self.origin, "config", "user.name", "Synthetic Fixture")
        (self.origin / "seed").write_text("unchanged")
        git(self.origin, "add", ".")
        git(self.origin, "commit", "-qm", "root")
        self.parent = git(self.origin, "rev-parse", "HEAD")
        (self.origin / ".gitmodules").write_text(MODULES)
        git(self.origin, "add", ".gitmodules")
        git(self.origin, "update-index", "--add", "--cacheinfo", f"160000,{self.parent},{LINK}")
        (self.origin / LINK).mkdir()
        git(self.origin, "commit", "-qm", "exact product with unmapped gitlink")
        self.main = git(self.origin, "rev-parse", "HEAD")
        git(self.origin, "checkout", "-qb", "synthetic-product")
        (self.origin / "product-marker").write_text("synthetic exact product only")
        git(self.origin, "add", "product-marker")
        git(self.origin, "commit", "-qm", "separate synthetic exact product")
        self.product = git(self.origin, "rev-parse", "HEAD")
        self.product_tree = git(self.origin, "rev-parse", "HEAD^{tree}")
        git(self.origin, "checkout", "-q", "--detach", self.main)
        qa = self.origin / "qa/ios-a073-compile"
        qa.mkdir(parents=True)
        (qa / "offline_layout.py").write_text(COMPILE_STUB)
        git(self.origin, "add", "qa")
        git(self.origin, "commit", "-qm", "reviewed prior harness with unmapped gitlink")
        self.reviewed_parent = git(self.origin, "rev-parse", "HEAD")
        self.reviewed_tree = git(self.origin, "rev-parse", "HEAD^{tree}")
        (qa / "readback-only").write_text("synthetic QA successor only")
        git(self.origin, "add", "qa")
        git(self.origin, "commit", "-qm", "fast-forward diagnostic successor")
        self.head = git(self.origin, "rev-parse", "HEAD")
        self.tree = git(self.origin, "rev-parse", "HEAD^{tree}")
        self.remote = self.root / "public-synthetic.git"
        subprocess.run(["/usr/bin/git","clone","-q","--bare",str(self.origin),str(self.remote)], check=True)
        self.sentinel = self.root / "unrelated-do-not-touch"
        self.sentinel.write_text("untouched")
        self.bad_home = self.root / "ambient-home"
        self.bad_home.mkdir()
        (self.bad_home / ".gitconfig").write_text('[submodule]\n\trecurse=true\n[credential]\n\thelper=bad-should-never-run\n')
        # The exact bootstrap is retained; substitute only local transport and OIDs.
        self.body = BODY.replace(
            f"repo='{HTTPS}'", f"repo={shlex.quote(self.remote.as_uri())}", 1).replace(
            "GIT_ALLOW_PROTOCOL=https /usr/bin/git", 'GIT_ALLOW_PROTOCOL=file "GIT_TRACE=$git_home/test-git-trace" /usr/bin/git', 1
        ).replace(BASE, self.main).replace(REVIEWED_PARENT, self.reviewed_parent).replace(
            REVIEWED_PARENT_TREE, self.reviewed_tree
        ).replace(SOURCE, self.product).replace(SOURCE_TREE, self.product_tree)
        self.env = dict(os.environ, GITHUB_ACTIONS="true", GITHUB_REPOSITORY="augsmog/QuickScore",
                        GITHUB_EVENT_NAME="workflow_dispatch", GITHUB_REF="refs/heads/qa/snapscore-c828-hosted-arm64-layout",
                        RUNNER_ARCH="ARM64", RUNNER_OS="macOS", RUNNER_ENVIRONMENT="github-hosted",
                        EXPECTED_HARNESS_SHA=self.head, EXPECTED_HARNESS_TREE=self.tree, GITHUB_SHA=self.head,
                        RUNNER_TEMP=str(self.runner), DEVELOPER_DIR=("/Applications/Xcode.app/Contents/Developer" if sys.platform == "darwin" else "/unneeded-on-Linux/"),
                        HOME=str(self.bad_home), GH_TOKEN="SHOULD_NOT_LEAVE_CALLER", GITHUB_TOKEN="NEITHER_SHOULD_THIS",
                        GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="submodule.recurse", GIT_CONFIG_VALUE_0="true")

    def outside_fixture(self):
        return {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.root.rglob("*") if p.is_file() and self.runner not in p.parents}

    def execute(self, **override):
        before = self.outside_fixture()
        result = subprocess.run(
            ["/bin/bash", "--noprofile", "--norc", "-c", self.body], cwd=self.root,
            env={**self.env, **override}, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15
        )
        self.assertFalse(list(self.runner.iterdir()))
        self.assertEqual("untouched", self.sentinel.read_text())
        self.assertEqual(MODULES, (self.origin / ".gitmodules").read_text())
        self.assertEqual("", git(self.origin, "status", "--porcelain"))
        self.assertNotIn(self.env["GH_TOKEN"], result.stdout + result.stderr)
        self.assertNotIn(self.env["GITHUB_TOKEN"], result.stdout + result.stderr)
        self.assertEqual(before, self.outside_fixture())
        return result, [json.loads(line) for line in result.stdout.splitlines()]

    def test_real_git_preserves_orphan_index_and_skips_recursion(self):
        reproduce = git(self.origin, "submodule", "foreach", "--recursive", "true", fail=True)
        self.assertNotEqual(0, reproduce.returncode)
        self.assertIn(LINK, reproduce.stderr)
        result, receipt = self.execute()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual({"mockCompileOnly": True, "orphanGitlinkPreserved": True,
                          "redisclosedCredentials": False}, receipt[0])
        self.assertTrue(receipt[-1]["temporaryRootRemoved"])

    def test_wrong_tree_fails_before_product_or_compile(self):
        result, receipt = self.execute(EXPECTED_HARNESS_TREE="d"*40)
        self.assertEqual(78, result.returncode)
        self.assertEqual("HARNESS_READBACK", receipt[0]["reason"])
        self.assertTrue(receipt[-1]["temporaryRootRemoved"])

    def test_product_tree_mismatch_fails_before_compile(self):
        self.body = self.body.replace("product_tree='"+self.product_tree+"'", "product_tree='"+"e"*40+"'", 1)
        result, receipt = self.execute()
        self.assertEqual(78, result.returncode)
        self.assertEqual("PRODUCT_READBACK", receipt[0]["reason"])
        self.assertTrue(receipt[-1]["temporaryRootRemoved"])

    def test_sole_harness_parent_is_reviewed_predecessor_not_product(self):
        self.body = self.body.replace("expected_parent='"+self.reviewed_parent+"'", "expected_parent='"+self.product+"'", 1)
        result, receipt = self.execute()
        self.assertEqual(78, result.returncode)
        self.assertEqual("HARNESS_PARENT", receipt[0]["reason"])
        self.assertTrue(receipt[-1]["temporaryRootRemoved"])

    def test_parent_tree_and_main_ancestry_fail_with_no_compile(self):
        original = self.body
        for pin, actual, code in (
            ("expected_parent_tree", self.reviewed_tree, "HARNESS_PARENT_TREE"),
            ("expected_previous", self.main, "HARNESS_PREVIOUS_ANCESTRY"),
        ):
            with self.subTest(code=code):
                self.body = original.replace(pin+"='"+actual+"'", pin+"='"+"d"*40+"'", 1)
                result, receipts = self.execute()
                self.assertEqual(78, result.returncode)
                self.assertEqual(code, receipts[0]["reason"])
                self.assertTrue(receipts[-1]["temporaryRootRemoved"])

    def test_non_hex_oid_and_wrong_dispatch_do_not_create_worktrees(self):
        for overrides, reason in [
            ({"EXPECTED_HARNESS_SHA": "main"}, "REVIEWED_HARNESS_SHA_TREE_REQUIRED"),
            ({"GITHUB_REF": "refs/heads/main"}, "HOSTED_SCOPE_MISMATCH"),
        ]:
            result, receipt = self.execute(**overrides)
            self.assertEqual(78, result.returncode)
            self.assertEqual([{"status":"BLOCKED","phase":"anonymous-checkout","reason":reason}], receipt)

    def test_production_workflow_only_offers_fixed_anonymous_git_route(self):
        import build
        self.assertEqual((build.SHA, build.TREE), (SOURCE, SOURCE_TREE))
        self.assertRegex(WORKFLOW.read_text(), r"(?m)^permissions: \{\}$")
        self.assertNotIn("contents: read", WORKFLOW.read_text())
        self.assertIn("repo='"+HTTPS+"'", BODY)
        self.assertIn("product_sha='"+SOURCE+"'", BODY)
        self.assertIn("product_tree='"+SOURCE_TREE+"'", BODY)
        self.assertIn("expected_previous='"+BASE+"'", BODY)
        self.assertIn("expected_parent='"+REVIEWED_PARENT+"'", BODY)
        self.assertIn("expected_parent_tree='"+REVIEWED_PARENT_TREE+"'", BODY)
        self.assertIn(' "$EXPECTED_HARNESS_TREE" 3 HARNESS', BODY)
        self.assertIn("GIT_ALLOW_PROTOCOL=https /usr/bin/git", BODY)
        self.assertIn("credential.helper= -c http.extraHeader= -c http.followRedirects=false", BODY)
        self.assertIn("GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null", BODY)
        self.assertIn("--no-recurse-submodules", BODY)
        self.assertNotIn("actions/checkout", WORKFLOW.read_text())
        self.assertNotIn("submodule foreach", BODY)
        self.assertNotIn("secrets.", WORKFLOW.read_text())


if __name__ == "__main__":
    unittest.main()
