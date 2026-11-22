"""Manual standard-host compile diagnostic; no device, backend, or exported binary."""
import argparse
import base64
import json
import os
import pathlib
import re
import shutil
import signal
import subprocess
import tempfile
import types

import build

MAIN = "5190f43261a42f108d54627c793d5be64046c840"
REF = "refs/heads/qa/snapscore-a073-hosted-compile-main"
FLOOR = 12 * 1024**3
DEVELOPER_DIR = "/Applications/Xcode_26.4.1.app/Contents/Developer"
PHASES = ("toolchain", "export", "npm", "prebuild", "pods", "release", "artifact")
REASONS = frozenset("""
    HARNESS_SHA_TREE_REQUIRED HARNESS_SCOPE HARNESS_CHANGED HARNESS_PARENT_CHANGED
    EXACT_CLEAN_SOURCE_REQUIRED TRUSTED_HOSTED_CONTEXT_REQUIRED HOSTED_ARM64_MAC_REQUIRED
    EXACT_HOSTED_NODE_REQUIRED TOOLCHAIN_MISMATCH SIMULATOR_SDK_MISMATCH
    READBACK_FAILED FIXTURE_PORT_INSPECTION_FAILED FIXTURE_PORT_IN_USE
    PHASE_FAILED PHASE_TIMEOUT DISK_FLOOR SOURCE_CHANGED INVALID_HOST_PATHS
    PRODUCT_LOCK_CHANGED PODS_LOCK_MISMATCH BUILD_EVIDENCE_INVALID
    CLEANUP_UNVERIFIED BINARY_UUID_UNVERIFIED BINARY_NOT_ARM64_ONLY JOB_INTERRUPTED
    SIGNED_ARTIFACT_REJECTED RELEASE_APP_MISSING NOT_TARGET_SIMULATOR_APP
    TRACKED_ENV_NOT_ALLOWED TEMPLATE_BLOB_MISMATCH TEMPLATE_ARCHIVE_SIZE_MISMATCH
    ARCHIVE_GIT_INVENTORY_MISMATCH ARCHIVE_GIT_BLOB_MISMATCH
""".split())


def require(ok, reason):
    if not ok:
        raise build.Blocked(reason)


def read(argv, env=None):
    return build.read(argv, env)


def harness_binding(repo, env):
    sha, tree = (env.get(k, "") for k in ("EXPECTED_HARNESS_SHA", "EXPECTED_HARNESS_TREE"))
    require(all(re.fullmatch("[a-f0-9]{40}", s) for s in (sha, tree)), "HARNESS_SHA_TREE_REQUIRED")
    require(env.get("GITHUB_REF") == REF and env.get("GITHUB_SHA") == sha, "HARNESS_SCOPE")
    git = lambda *a: read(["git", "--no-optional-locks", "-C", str(repo), *a])
    require(git("rev-parse", "HEAD") == sha and git("rev-parse", "HEAD^{tree}") == tree
            and not git("status", "--porcelain"), "HARNESS_CHANGED")
    require(git("rev-list", "--parents", "-n", "1", "HEAD") == f"{sha} {MAIN}", "HARNESS_PARENT_CHANGED")
    return sha, tree


def private_write(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as out:
        out.write(value)


def fixture(root):
    enc = lambda data: base64.urlsafe_b64encode(data).rstrip(b"=").decode()
    key = ".".join(map(enc, (b'{"alg":"HS256","typ":"JWT"}',
                             b'{"role":"anon","iss":"supabase-demo"}', bytes(32))))
    path, receipt = root / "compile-sentinel.private", root / "compile-input.private.json"
    private_write(path, key)
    private_write(receipt, json.dumps({"kind": build.COMPILE_KIND, "relay_url": build.COMPILE_URL,
                                      "anon_sha256": build.digest(key.encode()), "backend_started": False}))
    return path, receipt


def assert_port_unused(run=subprocess.run):
    result = run(["/usr/sbin/lsof", "-nP", "-a", "-iTCP:55439", "-sTCP:LISTEN", "-Fpn"],
                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
    require(result.returncode in (0, 1) and not result.stderr and len(result.stdout) < 65536,
            "FIXTURE_PORT_INSPECTION_FAILED")
    require(result.returncode == 1 and not result.stdout, "FIXTURE_PORT_IN_USE")


def select_node(env):
    path = pathlib.Path(env.get("RUNNER_TOOL_CACHE", "/opt/hostedtoolcache"))
    for arch_dir in ("arm64", "x64"):
        candidate = path / "node/22.23.5" / arch_dir / "bin"
        if not all((candidate / f).is_file() for f in ("node", "npm")):
            continue
        # The directory name is not architecture evidence; do not select a binary
        # that cannot be read or whose process reports Rosetta/x64.
        try:
            paired = read([str(candidate / "node"), "--version"]) == "v22.23.5" and \
                read([str(candidate / "node"), "-p", "process.arch"]) == "arm64"
        except (OSError, subprocess.TimeoutExpired, build.Blocked):
            paired = False
        if paired:
            return str(candidate) + os.pathsep + env["PATH"]
    raise build.Blocked("EXACT_HOSTED_NODE_REQUIRED")


def project_evidence(receipt, success):
    value = {}
    if receipt.get("lastPhase") in PHASES:
        value["lastPhase"] = receipt["lastPhase"]
    phases = receipt.get("phaseSeconds", {})
    value["phaseSeconds"] = {p: phases[p] for p in PHASES if p in phases and
                            type(phases[p]) in (int, float) and 0 <= phases[p] <= 1205}
    if success:
        require(receipt.get("status") == "UNSIGNED_SIMULATOR_RELEASE_BUILT", "BUILD_EVIDENCE_INVALID")
        for field, v in (("packageLockSha256", receipt.get("packageLockSha256")),
                         ("resolvedPodsSha256", receipt.get("resolvedPodsSha256")),
                         ("appSha256", receipt.get("artifact", {}).get("sha256")),
                         ("executableSha256", receipt.get("artifact", {}).get("executableSha256"))):
            require(isinstance(v, str) and re.fullmatch("[0-9a-f]{64}", v), "BUILD_EVIDENCE_INVALID")
            value[field] = v
        for field, v in (("appBytes", receipt.get("artifact", {}).get("bytes")),
                         ("freeBytesAfter", receipt.get("freeBytesAfter"))):
            require(type(v) is int and v > 0, "BUILD_EVIDENCE_INVALID")
            value[field] = v
        value["architecture"] = "arm64"
    return value


def diagnostic(harness, product, env):
    record = {"status": "BLOCKED", "scope": "unsigned-ios-simulator-compile-only", "source": build.SHA,
              "tree": build.TREE, "nativeAcceptance": False, "installed": False,
              "simulatorsBooted": False, "backendStarted": False, "exportedBinary": False}
    root = None
    success = False
    try:
        build.host(env)
        sha, tree = harness_binding(harness, env)
        record.update(harnessSha=sha, harnessTree=tree)
        product_lock = build.source(product)
        base = pathlib.Path(env["RUNNER_TEMP"]).resolve(strict=True)
        require(base.is_dir() and not base.is_relative_to(harness) and not base.is_relative_to(product)
                and env["DEVELOPER_DIR"] == DEVELOPER_DIR, "INVALID_HOST_PATHS")
        record["freeBytesBefore"] = shutil.disk_usage(base).free
        record["physicalMemoryBytes"] = int(read(["/usr/sbin/sysctl", "-n", "hw.memsize"]))
        require(record["physicalMemoryBytes"] > 0, "READBACK_FAILED")
        require(record["freeBytesBefore"] >= FLOOR, "DISK_FLOOR")
        assert_port_unused()
        os.environ["PATH"] = select_node(env)
        with tempfile.TemporaryDirectory(prefix="snapscore-compile-only-", dir=base) as folder:
            root = pathlib.Path(folder)
            require(root.stat().st_mode & 0o777 == 0o700, "INVALID_HOST_PATHS")
            key, receipt = fixture(root)
            out = root / "build"
            args = types.SimpleNamespace(repo=str(product), out=str(out), relay=build.COMPILE_URL,
                                         anon_file=str(key), stack_receipt=str(receipt),
                                         developer_dir=DEVELOPER_DIR, minimum_free_bytes=FLOOR, compile_only=True)
            try:
                full = build.build(args)
                public = project_evidence(full, True)
                require(full["packageLockSha256"] == product_lock, "SOURCE_CHANGED")
            except Exception:
                summary = out / "receipt.json"
                if summary.is_file() and summary.stat().st_size <= 4 * 1024**2:
                    record.update(project_evidence(json.loads(summary.read_text()), False))
                raise
        require(not root.exists(), "CLEANUP_UNVERIFIED")
        assert_port_unused()
        harness_binding(harness, env)
        require(build.source(product) == product_lock, "SOURCE_CHANGED")
        record.update(public)
        record["status"] = "UNSIGNED_ARM64_RELEASE_COMPILED"
        success = True
    except Exception as exc:
        code = str(exc) if isinstance(exc, build.Blocked) else ""
        record["reason"] = code if code in REASONS else "COMPILE_DIAGNOSTIC_BLOCKED"
    record["temporaryRootRemoved"] = root is None or not root.exists()
    if not record["temporaryRootRemoved"]:
        record.update(status="BLOCKED", reason="CLEANUP_UNVERIFIED")
        success = False
    return record, success


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--harness", type=pathlib.Path, required=True)
    p.add_argument("--product", type=pathlib.Path, required=True)
    args = p.parse_args()

    def stopped(*_):
        raise build.Blocked("JOB_INTERRUPTED")

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, stopped)
    record, success = diagnostic(args.harness.resolve(), args.product.resolve(), dict(os.environ))
    print(json.dumps(record, sort_keys=True), flush=True)
    return 0 if success else 78


if __name__ == "__main__":
    raise SystemExit(main())
