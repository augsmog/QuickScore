"""Hosted one-simulator, unsigned/offline layout QA. Emits redacted evidence only."""
import argparse
import collections
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import pwd
import re
import shutil
import signal
import struct
import subprocess
import tempfile
import time
import uuid
import zipfile
from types import SimpleNamespace

import build
from compile_only import DEVELOPER_DIR, FLOOR, REASONS, assert_port_unused, fixture, project_evidence, select_node

REF = "refs/heads/qa/snapscore-c828-hosted-arm64-layout"
PARENT = "d6d84c0979f66f2b5b24f9e9cb91d5e60277eec6"
PARENT_TREE = "f30636418341c6a9f112f921ed797221d660e568"
PREVIOUS = "72558fff91b58b07ae4a8715c4768f34c24c06cd"
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-4"
DEVICE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"
BUNDLE = "com.scoresnap.app"
PROFILE = "iphone-16-pro"
CHECKPOINTS = (("new-contest", "00-empty-wizard", "empty wizard"), ("paywall", "00-tier-td", "tier td"))
OID = re.compile(r"[0-9a-f]{40}")
UUID = re.compile(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}")
MAESTRO_URL = "https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.12.1/maestro.zip"
MAESTRO_HASH = "54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7"
MAESTRO_BYTES_LIMIT = 512 * 1024**2
EVIDENCE_LIMIT = 8 * 1024**2
PATCH_PROJECTION = ("sourceSha", "buildHash", "fontScale", "profile")
ALLOWED_FAILURES = frozenset("""
    HARNESS_SCOPE INVALID_HOST_PATHS TOOLCHAIN_MISMATCH SDK_MISMATCH DEVICE_TYPE_MISSING RUNTIME_MISMATCH
    DEVICE_ADMISSION_UNVERIFIED UNOWNED_DEVICE_ACTIVE NONCE_COLLISION UUID_NOT_FRESH IDENTITY_DRIFT
    DEVICE_NOT_SHUTDOWN DEVICE_NOT_BOOTED CONTENT_SIZE_NOT_VERIFIED INSTALL_NOT_VERIFIED
    CLEANUP_UNVERIFIED CAPTURE_INVALID GEOMETRY_UNVERIFIED SOURCE_CHANGED DISK_FLOOR
    COMMAND_NONZERO COMMAND_TIMEOUT MAESTRO_PROVENANCE_INVALID MAESTRO_JAVA_UNAVAILABLE
    JOB_INTERRUPTED BUILD_EVIDENCE_INVALID FIXTURE_PORT_IN_USE OFFLINE_QA_BLOCKED SOURCE_PRIVACY_POLICY_UNVERIFIED
""".split())


def need(ok, code):
    if not ok:
        raise build.Blocked(code)


def run(argv, env, seconds, *, nonzero=False):
    # No child output is streamed to Actions; raw hierarchy, screenshots and logs stay in scratch.
    try:
        r = subprocess.run(argv, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=seconds, check=False)
    except subprocess.TimeoutExpired as exc:
        raise build.Blocked("COMMAND_TIMEOUT") from exc
    need(r.returncode == 0 or nonzero, "COMMAND_NONZERO")
    need(len(r.stdout) <= EVIDENCE_LIMIT, "CAPTURE_INVALID")
    return r


def output(argv, env, seconds):
    return run(argv, env, seconds).stdout.decode().strip()


def sim(env, *args, seconds=25):
    return output(["/usr/bin/xcrun", "simctl", *args], env, seconds)


def binding(harness, env):
    sha, tree = (env.get(x, "") for x in ("EXPECTED_HARNESS_SHA", "EXPECTED_HARNESS_TREE"))
    need(OID.fullmatch(sha) and OID.fullmatch(tree) and env.get("GITHUB_SHA") == sha
         and env.get("GITHUB_REF") == REF, "HARNESS_SCOPE")
    def git(*args): return build.read(["git", "--no-optional-locks", "-C", str(harness), *args])
    need(git("rev-parse", "HEAD") == sha and git("rev-parse", "HEAD^{tree}") == tree
         and git("rev-list", "--parents", "-n", "1", "HEAD") == f"{sha} {PARENT}"
         and git("rev-parse", f"{PARENT}^{{tree}}") == PARENT_TREE
         and git("rev-list", "--parents", "-n", "1", PARENT) == f"{PARENT} {PREVIOUS}"
         and not git("status", "--porcelain"), "HARNESS_SCOPE")
    return sha, tree


def records(env, category, seconds):
    value = json.loads(sim(env, "list", "-j", category, seconds=seconds))
    need(type(value) is dict and list(value) == [category], "DEVICE_ADMISSION_UNVERIFIED")
    return value[category]


def catalog(env):
    sdk = output(["/usr/bin/xcrun", "--sdk", "iphonesimulator", "--show-sdk-build-version"], env, 20)
    need(sdk == "23E252", "SDK_MISMATCH")
    runtimes = records(env, "runtimes", 65)
    need(type(runtimes) is list, "RUNTIME_MISMATCH")
    target = [r for r in runtimes if type(r) is dict and r.get("identifier") == RUNTIME]
    need(len(target) == 1 and target[0].get("version") == "26.4.1" and
         target[0].get("buildversion") == "23E254a" and target[0].get("isAvailable") is True,
         "RUNTIME_MISMATCH")
    kinds = records(env, "devicetypes", 30)
    supported = target[0].get("supportedDeviceTypes")
    for configured in (kinds, supported):
        need(type(configured) is list and
             sum(type(r) is dict and r.get("identifier") == DEVICE for r in configured) == 1,
             "DEVICE_TYPE_MISSING")


def all_devices(env):
    # A full read-only inventory supports initial uniqueness and exact target readbacks; no
    # global simulator mutation, disclosure or device use follows from any other runtime row.
    groups = records(env, "devices", 30)
    need(type(groups) is dict and RUNTIME in groups and len(groups) <= 64, "DEVICE_ADMISSION_UNVERIFIED")
    rows = {}
    for runtime, values in groups.items():
        need(type(values) is list and len(values) + len(rows) <= 256, "DEVICE_ADMISSION_UNVERIFIED")
        for row in values:
            need(type(row) is dict, "DEVICE_ADMISSION_UNVERIFIED")
            uid, name, state = (row.get(x) for x in ("udid", "name", "state"))
            need(type(uid) is str and UUID.fullmatch(uid) and uid not in rows and
                 type(name) is str and 0 < len(name) <= 512 and type(state) is str and bool(state),
                 "DEVICE_ADMISSION_UNVERIFIED")
            rows[uid] = (runtime, row)
    return rows


def owned(rows, uid, name, *, allow_absent=False):
    match = rows.get(uid)
    named = [id_ for id_, (_, row) in rows.items() if row["name"] == name]
    if match is None and allow_absent and not named:
        return None
    need(match is not None and named == [uid], "IDENTITY_DRIFT")
    runtime, row = match
    need(runtime == RUNTIME and row.get("deviceTypeIdentifier") == DEVICE, "IDENTITY_DRIFT")
    return row


def cleanup(env, uid, name, native_home):
    row = owned(all_devices(env), uid, name)
    if row["state"] != "Shutdown":
        sim(env, "shutdown", uid, seconds=30)
        for attempt in range(3):
            if owned(all_devices(env), uid, name)["state"] == "Shutdown":
                break
            if attempt < 2: time.sleep(1)
        else:
            raise build.Blocked("CLEANUP_UNVERIFIED")
    sim(env, "delete", uid, seconds=30)
    consecutive = 0
    path = native_home / "Library/Developer/CoreSimulator/Devices" / uid
    for attempt in range(4):
        hidden = owned(all_devices(env), uid, name, allow_absent=True) is None
        consecutive = consecutive + 1 if hidden and not os.path.lexists(path) else 0
        if consecutive == 2:
            return
        if attempt < 3: time.sleep(1)
    raise build.Blocked("CLEANUP_UNVERIFIED")


def standard_scale(raw):
    return re.fullmatch(
        r"(?:(?:current )?content size(?: category)?:\s*)?(?:large|UICTContentSizeCategoryL|UIContentSizeCategoryLarge)",
        raw.strip(), re.I) is not None


def install_maestro(root, env):
    # Official public release URL and asset digest, no transient installer script or auth headers.
    archive = root / "maestro.zip"
    proc = run(["/usr/bin/curl", "--disable", "--fail", "--silent", "--location",
                "--proto", "=https", "--proto-redir", "=https", "--max-time", "120",
                "--max-filesize", str(MAESTRO_BYTES_LIMIT), "--output", str(archive), MAESTRO_URL], env, 125)
    import hashlib
    need(proc.returncode == 0 and archive.stat().st_size <= MAESTRO_BYTES_LIMIT,
         "MAESTRO_PROVENANCE_INVALID")
    with archive.open("rb") as data:
        digest = hashlib.file_digest(data, "sha256").hexdigest()
    need(digest == MAESTRO_HASH, "MAESTRO_PROVENANCE_INVALID")
    folder = root / "maestro-dist"
    folder.mkdir(mode=0o700)
    with zipfile.ZipFile(archive) as z:
        names = z.infolist()
        need(len(names) <= 10000 and sum(x.file_size for x in names) <= MAESTRO_BYTES_LIMIT
             and len({x.filename for x in names}) == len(names), "MAESTRO_PROVENANCE_INVALID")
        for x in names:
            path = PurePosixPath(x.filename)
            mode = x.external_attr >> 16
            need(not path.is_absolute() and ".." not in path.parts and "\\" not in x.filename and
                 (mode & 0o170000) in (0, 0o040000, 0o100000), "MAESTRO_PROVENANCE_INVALID")
        z.extractall(folder)
    candidates = list(folder.glob("*/bin/maestro"))
    need(len(candidates) == 1 and candidates[0].is_file(), "MAESTRO_PROVENANCE_INVALID")
    tool = candidates[0]
    tool.chmod(0o700)
    need(output([str(tool), "--version"], env, 25).splitlines()[-1].strip() == "2.12.1",
         "MAESTRO_PROVENANCE_INVALID")
    return tool


def matching_install(env, uid, app, artifact):
    sim(env, "install", uid, str(app), seconds=70)
    installed = Path(sim(env, "get_app_container", uid, BUNDLE, "app", seconds=25))
    need(installed.is_absolute() and installed.name == "SnapScore.app" and
         uid in installed.parts and installed.is_dir(), "INSTALL_NOT_VERIFIED")
    need(build.digest((installed / "SnapScore").read_bytes()) == artifact["executableSha256"], "INSTALL_NOT_VERIFIED")
    target_js = app / "main.jsbundle"
    need(target_js.is_file() and (installed / target_js.name).is_file() and
         build.digest((installed / target_js.name).read_bytes()) == build.digest(target_js.read_bytes()),
         "INSTALL_NOT_VERIFIED")


def png(path):
    need(path.is_file() and not path.is_symlink() and 100 < path.stat().st_size <= EVIDENCE_LIMIT, "CAPTURE_INVALID")
    data = path.read_bytes()
    need(data.startswith(bytes.fromhex("89504e470d0a1a0a")) and data[12:16] == b"IHDR" and
         struct.unpack(">II", data[16:24]) == (1206, 2622), "CAPTURE_INVALID")
    return build.digest(data)


def capture(product, root, uid, env, tool, app_hash, receipt):
    cap = root / "layout"
    cap.mkdir(mode=0o700)
    code = product / "scoresnap/e2e/device-layout"
    flows = product / ".maestro/flows/device-layout"
    shot_hashes = {}
    for i, (flow, sub, slug) in enumerate(CHECKPOINTS):
        receipt["stage"] = "checkpoint-" + sub
        base = cap / f"{i:02}-{flow}-{sub}"
        run([str(tool), "--device", uid, "test", "--test-output-dir", str(root / f"maestro-{i}"),
             "--debug-output", str(root / f"debug-{i}"), str(flows / flow / (sub + ".yaml"))], env, 120)
        need(standard_scale(sim(env, "ui", uid, "content_size")), "CONTENT_SIZE_NOT_VERIFIED")
        raw = run([str(tool), "--device", uid, "hierarchy"], env, 35).stdout
        need(raw and isinstance(json.loads(raw), dict), "CAPTURE_INVALID")
        hierarchy = base.with_suffix(".hierarchy.json")
        hierarchy.write_bytes(raw)
        run(["node", str(code / "scripts/assert-capture-device.mjs"), str(hierarchy), "--profile", PROFILE], env, 25)
        screenshot = base.with_suffix(".png")
        sim(env, "io", uid, "screenshot", str(screenshot), seconds=30)
        shot_hashes[f"{flow}/{slug}"] = png(screenshot)
        (base.with_suffix(".ctx.json")).write_text(json.dumps({"flow":flow, "checkpoint":slug, "screen":flow, "fontScale":1.0}))
    receipt["stage"] = "geometry"
    manifest_flags = ["--profile", PROFILE, "--platform", "ios", "--source-sha", build.SHA,
                      "--font-scale", "1.0", "--build-hash", app_hash]
    run(["node", str(code / "scripts/make-capture-manifest.mjs"), str(cap), *manifest_flags], env, 25)
    bundle = cap / "qa-bundle.json"
    run(["node", str(code / "scripts/bundle-from-maestro.mjs"), str(cap), "--profile", PROFILE,
         "--platform", "ios", "--source-sha", build.SHA, "--out", str(bundle)], env, 25)
    result = cap / "geometry.json"
    measured = run(["node", str(code / "run-geometry.mjs"), str(bundle), "--expect-sha", build.SHA,
                    "--expect-build", app_hash, "--profile", PROFILE, "--cadence", "none",
                    "--out", str(result)], env, 25, nonzero=True)
    return summarize_evidence(json.loads(bundle.read_text()), json.loads(result.read_text()),
                              shot_hashes, app_hash, measured.returncode)


def summarize_evidence(b, g, shot_hashes, app_hash, geometry_exit):
    need(tuple(b[k] for k in PATCH_PROJECTION) == (build.SHA, app_hash, 1.0, PROFILE) and
         {(r["flow"] + "/" + r["checkpoint"]):r["screenshotSha256"] for r in b["checkpoints"]} == shot_hashes
         and len(b["checkpoints"]) == len(CHECKPOINTS)
         and all(r["context"]["fontScale"] == 1.0 for r in b["checkpoints"]), "GEOMETRY_UNVERIFIED")
    verdicts = g.get("results", [])
    need(geometry_exit in (0,1) and g.get("ok") is (geometry_exit == 0)
         and len(verdicts) == len(CHECKPOINTS) and not g.get("error")
         and {(r["flow"] + "/" + r["checkpoint"]) for r in verdicts} == set(shot_hashes), "GEOMETRY_UNVERIFIED")
    rules = collections.Counter(f["rule"] for r in verdicts for f in r["kept"])
    need(all(type(rule) is int and 1 <= rule <= 8 for rule in rules), "GEOMETRY_UNVERIFIED")
    return {"captureSha256":shot_hashes, "checkpointCount":len(shot_hashes),
            "geometryPass":g["ok"], "keptByRule":dict(rules), "inAppFontScaleProven":False}


def diagnostic(harness, product, env):
    record = {"status":"BLOCKED", "stage":"admission", "scope":"one-iphone-16-pro-no-auth-layout-1p0",
              "source":build.SHA, "tree":build.TREE, "buildSucceeded":False, "booted":False,
              "installed":False, "installedExecutableAndJsMatch":False, "defaultContentSizeVerified":False, "cleanupVerified":False,
              "temporaryRootRemoved":False, "releaseVerdict":False, "nativeAcceptance":False,
              "visionReviewed":False, "screenshotsUploaded":False, "backendStarted":False,
              "joinVisibleProof":False, "exportedBinary":False}
    root = uid = name = None
    attempted_create = False
    try:
        build.host(env)
        sha, tree = binding(harness, env)
        record.update(harnessSha=sha,harnessTree=tree)
        product_lock = build.source(product)
        base = Path(env["RUNNER_TEMP"]).resolve(strict=True)
        native_home = Path(env["SIMULATOR_HOME"]).resolve(strict=True)
        need(base.is_dir() and not base.is_relative_to(harness) and not base.is_relative_to(product) and
             native_home == Path(pwd.getpwuid(os.getuid()).pw_dir).resolve(strict=True) and
             env.get("DEVELOPER_DIR") == DEVELOPER_DIR, "INVALID_HOST_PATHS")
        record["freeBytesBefore"] = shutil.disk_usage(base).free
        need(record["freeBytesBefore"] >= FLOOR, "DISK_FLOOR")
        os.environ["PATH"] = select_node(env)
        native_env = {"PATH":os.environ["PATH"], "HOME":str(native_home), "DEVELOPER_DIR":DEVELOPER_DIR,
                      "LC_ALL":"C", "MAESTRO_CLI_NO_ANALYTICS":"1", "CI":"1", "GIT_TERMINAL_PROMPT":"0"}
        record["stage"] = "catalog"
        need(output(["/usr/bin/xcrun", "xcodebuild", "-version"], native_env, 18)
             == "Xcode 26.4.1\nBuild version 17E202", "TOOLCHAIN_MISMATCH")
        catalog(native_env)
        need(all(row["state"] == "Shutdown" for _, row in all_devices(native_env).values()), "UNOWNED_DEVICE_ACTIVE")
        record["stage"] = "maestro-provenance"
        java = output(["/usr/libexec/java_home", "-F", "-v", "17", "-a", "arm64"], native_env, 20)
        need(Path(java).is_absolute() and (Path(java) / "bin/java").is_file(), "MAESTRO_JAVA_UNAVAILABLE")
        native_env["JAVA_HOME"] = java
        native_env["PATH"] = java + "/bin:" + native_env["PATH"]
        assert_port_unused()
        with tempfile.TemporaryDirectory(prefix="snapscore-arm64-layout-", dir=base) as folder:
            root = Path(folder)
            need(root.stat().st_mode & 0o777 == 0o700, "INVALID_HOST_PATHS")
            tool = install_maestro(root, native_env)
            record["stage"] = "compile"
            key, fixture_receipt = fixture(root)
            out = root / "build"
            args = SimpleNamespace(repo=str(product), out=str(out), relay=build.COMPILE_URL,
                                   anon_file=str(key), stack_receipt=str(fixture_receipt),
                                   developer_dir=DEVELOPER_DIR, minimum_free_bytes=FLOOR,
                                   compile_only=True, offline_layout=True)
            try:
                full = build.build(args)
                public = project_evidence(full, True)
                need(full["packageLockSha256"] == product_lock, "SOURCE_CHANGED")
                required = {"offlineModeBuildFlag":True,"crossDeviceUiBuildFlag":True,"realAuthSourceGuard":False,
                            "sentryEnabledSourceGuard":False,"posthogConfigured":False,"revenueCatConfigured":False,
                            "backendEndpoint":"synthetic-loopback-only","osEgressRestricted":False}
                need(full.get("layoutPolicy") == required, "SOURCE_PRIVACY_POLICY_UNVERIFIED")
                record["layoutPolicy"] = required
            except Exception:
                summary = out / "receipt.json"
                if summary.is_file() and summary.stat().st_size <= EVIDENCE_LIMIT:
                    record.update(project_evidence(json.loads(summary.read_text()), False))
                raise
            record.update(public, buildSucceeded=True)
            need(full["appRelativePath"] == "DerivedData/Build/Products/Release-iphonesimulator/SnapScore.app",
                 "BUILD_EVIDENCE_INVALID")
            app = out / full["appRelativePath"]
            need(app.is_dir() and not app.is_symlink() and
                 build.artifact(app, True)["sha256"] == full["artifact"]["sha256"], "BUILD_EVIDENCE_INVALID")
            record["stage"] = "device-create"
            old = all_devices(native_env)
            need(all(row["state"] == "Shutdown" for _, row in old.values()), "UNOWNED_DEVICE_ACTIVE")
            name = "snapscore-offline-layout-" + uuid.uuid4().hex
            need(not any(row["name"] == name for _, row in old.values()), "NONCE_COLLISION")
            attempted_create = True
            try:
                fresh = sim(native_env, "create", name, DEVICE, RUNTIME, seconds=40)
                need(UUID.fullmatch(fresh) and fresh not in old, "UUID_NOT_FRESH")
                uid = fresh
                need(owned(all_devices(native_env), uid, name)["state"] == "Shutdown", "DEVICE_NOT_SHUTDOWN")
                record["stage"] = "boot"
                sim(native_env, "bootstatus", uid, "-b", seconds=220)
                rows = all_devices(native_env)
                need(owned(rows, uid, name)["state"] == "Booted", "DEVICE_NOT_BOOTED")
                need(all(x == uid or row["state"] == "Shutdown" for x, (_, row) in rows.items()), "UNOWNED_DEVICE_ACTIVE")
                record["booted"] = True
                record["stage"] = "content-size"
                sim(native_env, "ui", uid, "content_size", "large")
                need(standard_scale(sim(native_env, "ui", uid, "content_size")), "CONTENT_SIZE_NOT_VERIFIED")
                record["defaultContentSizeVerified"] = True
                record["stage"] = "install"
                matching_install(native_env, uid, app, full["artifact"])
                record["installed"] = True
                record["installedExecutableAndJsMatch"] = True
                record.update(capture(product, root, uid, native_env, tool, full["artifact"]["sha256"], record))
            finally:
                # Never guess at a returned UUID lost on create, nor roll somebody else's simulator back.
                if uid is not None:
                    try:
                        cleanup(native_env, uid, name, native_home)
                        record["cleanupVerified"] = True
                    except Exception as exc:
                        raise build.Blocked("CLEANUP_UNVERIFIED") from exc
            need(record["cleanupVerified"], "CLEANUP_UNVERIFIED")
        need(not root.exists(), "CLEANUP_UNVERIFIED")
        assert_port_unused()
        binding(harness, env)
        need(build.source(product) == product_lock, "SOURCE_CHANGED")
        record["status"] = "OFFLINE_LAYOUT_QA_COMPLETE" if record["geometryPass"] else "OFFLINE_LAYOUT_QA_FINDINGS"
        record["stage"] = "complete"
    except Exception as exc:
        code = str(exc) if isinstance(exc, build.Blocked) else ""
        record["reason"] = code if code in ALLOWED_FAILURES | REASONS else "OFFLINE_QA_BLOCKED"
    record["temporaryRootRemoved"] = root is None or not root.exists()
    if not record["temporaryRootRemoved"]:
        record.update(status="BLOCKED", reason="CLEANUP_UNVERIFIED")
    if attempted_create and not record["cleanupVerified"] and uid is None:
        record["ownedCreateUnverified"] = True
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--harness", type=Path, required=True)
    parser.add_argument("--product", type=Path, required=True)
    args = parser.parse_args()

    def stopped(*_):
        raise build.Blocked("JOB_INTERRUPTED")

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, stopped)
    record = diagnostic(args.harness.resolve(), args.product.resolve(), dict(os.environ))
    print(json.dumps(record, sort_keys=True), flush=True)
    return {"OFFLINE_LAYOUT_QA_COMPLETE":0, "OFFLINE_LAYOUT_QA_FINDINGS":1}.get(record["status"], 78)


if __name__ == "__main__":
    raise SystemExit(main())
