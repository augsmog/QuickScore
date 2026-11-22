#!/usr/bin/env python3
"""Owned two-device capacity preflight; no app, backend, downloads, or global changes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import pwd
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from xml.parsers.expat import ExpatError

HOST_LABEL = "macos-26-intel"
HOST_ARCH = "x86_64"
XCODE = "/Applications/Xcode_26.4.1.app/Contents/Developer"
XCODE_ID = ("Xcode 26.4.1", "Build version 17E202")
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-4"
RUNTIME_VERSION = "26.4.1"
RUNTIME_BUILD = "23E254a"
DEVICE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"
PREFIX = "snapscore-pair-"
RECEIPT = "ownership.json"
GIB = 1 << 30
UUID_RE = re.compile(r"[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}")
TOKEN_RE = re.compile(r"[0-9a-f]{32}")
ROLES = ("host", "guest")
CATALOG_SECONDS = 45
CATALOG_KIND_SECONDS = 22
CATALOG_DEVICE_SECONDS = 15
DEVICE_SCOPE_LIMIT = 256
PLIST_LIMIT = 65536
ROLE_CLEANUP_SECONDS = 35
SETTLE_SECONDS = 8
POLL_SECONDS = 0.5
BOOT_SHARED_SECONDS = 195
BOOT_ROLE_SECONDS = 105
HOST_STABILITY_RESERVE = 10
HOST_STABILITY_GAP = 0.5
STABILITY_READ_SECONDS = 4
JOINT_READ_SECONDS = 10
PRIMARY_STAGES = frozenset(("host-context", "transport-admission", "memory-readback", "sdk-readback", "disk-before",
    "catalog-xcode", "catalog-runtime", "catalog-device-type", "catalog-runtime-devices", "catalog-ownership-scope",
    "catalog-validation", "journal", "create", "create-readback",
    "preboot-readback", "host-boot-command", "host-stability-first", "host-stability-confirm",
    "guest-boot-command", "joint-booted-snapshot", "disk-both-booted", "completion", "disk-after-cleanup"))
CLEANUP_STAGES = frozenset(("cleanup-identify", "cleanup-shutdown", "cleanup-shutdown-readback",
    "cleanup-delete", "cleanup-delete-readback", "cleanup-journal"))
CODES = frozenset(("HOST_SCOPE", "HOST_CONTEXT", "TRANSPORT_BUDGET_INVALID", "TRANSPORT_BUDGET_EXHAUSTED",
    "CATALOG_DEADLINE", "MEMORY_READBACK_INVALID", "INTEL_CAPACITY_PROFILE_MISMATCH", "SDK_READBACK_INVALID", "SDK_MISMATCH",
    "DISK_FLOOR", "XCODE_MISMATCH", "RUNTIME_MISMATCH", "DEVICE_TYPE_MISSING",
    "RUNTIME_DEVICE_UNSUPPORTED", "INVENTORY_INVALID", "NONCE_COLLISION", "FRESH_UUID_REQUIRED",
    "DEVICE_SCOPE_UNVERIFIED", "UNKNOWN_DEVICE_IN_SCOPE", "UNOWNED_DEVICE_ACTIVE",
    "IDENTITY_DRIFT", "CREATED_NOT_SHUTDOWN", "PREBOOT_NOT_SHUTDOWN",
    "BOOT_DEADLINE", "HOST_NOT_STABLY_BOOTED", "GUEST_NOT_SHUTDOWN_BEFORE_BOOT", "POSTBOOT_NOT_BOOTED", "COMMAND_TIMEOUT", "COMMAND_NONZERO",
    "COMMAND_START_FAILED", "SHUTDOWN_NOT_VERIFIED", "DELETE_NOT_VERIFIED",
    "INTERRUPTED_CREATE_UNOBSERVED", "CLEANUP_DEADLINE", "CLEANUP_FAILED",
    "COMPLETION_UNVERIFIED", "INTERRUPTED", "LOCAL_IO", "UNKNOWN"))


class GateError(RuntimeError):
    def __init__(self, message, code="UNKNOWN"):
        super().__init__(message)  # Private only; never emitted by the hosted wrapper.
        self.code = code


class CleanupError(GateError):
    pass


def reason(error, stage, role=None):
    """Return structured allowlisted labels only, never raw exception or tool fields."""
    if stage not in PRIMARY_STAGES | CLEANUP_STAGES:
        stage = "completion"
    code = getattr(error, "code", "LOCAL_IO" if isinstance(error, OSError) else "UNKNOWN")
    return {"stage": stage, "code": code if isinstance(code, str) and code in CODES else "UNKNOWN",
            **({"role": role} if role in ROLES else {})}


class Diagnostic:
    def __init__(self):
        self.stage = "host-context"
        self.role = None
        self.primary = None
        self.catalog_verified = False
        self.host_boot_command_completed = False
        self.host_stable_before_guest = False
        self.guest_boot_requested = False
        self.guest_boot_command_completed = False
        self.dual_boot_verified = False
        self.cleanup_attempted = False
        self.cleanup_verified = False
        self.cleanup_failures = []

    def at(self, stage, role=None):
        self.stage, self.role = stage, role

    def record_primary(self, error):
        if self.primary is not None or isinstance(error, CleanupError):
            return
        self.primary = reason(error, self.stage, self.role)

    def fields(self):
        return {"primaryFailure": self.primary, "simultaneousBootVerified": self.dual_boot_verified,
                "bootStrategy": "staged-host-then-guest", "catalogVerified": self.catalog_verified,
                "bootReadbacks": {"hostBootCommandCompleted": self.host_boot_command_completed,
                                  "hostStableBeforeGuest": self.host_stable_before_guest,
                                  "guestBootRequested": self.guest_boot_requested,
                                  "guestBootCommandCompleted": self.guest_boot_command_completed},
                "cleanupAttempted": self.cleanup_attempted,
                "cleanupVerified": self.cleanup_verified, "cleanupFailures": self.cleanup_failures[:3]}



def job_context():
    expected = {"GITHUB_ACTIONS": "true", "RUNNER_OS": "macOS",
                "RUNNER_ARCH": "X64", "RUNNER_ENVIRONMENT": "github-hosted"}
    if (platform.system() != "Darwin" or platform.machine() != HOST_ARCH
            or any(os.environ.get(k) != v for k, v in expected.items())):
        raise GateError("expected a standard GitHub-hosted macOS Intel job; no simulator commands ran", "HOST_CONTEXT")
    fields = [os.environ.get(k, "") for k in ("GITHUB_REPOSITORY", "GITHUB_RUN_ID",
              "GITHUB_RUN_ATTEMPT", "GITHUB_JOB", "RUNNER_NAME", "RUNNER_TEMP")]
    if not all(fields) or not Path(fields[-1]).is_absolute():
        raise GateError("missing same-job runner identity or absolute RUNNER_TEMP", "HOST_CONTEXT")
    tmp = Path(fields[-1]).resolve(strict=True)
    if not tmp.is_dir():
        raise GateError("RUNNER_TEMP is not a directory", "HOST_CONTEXT")
    marker = hashlib.sha256(json.dumps([*fields, str(tmp)]).encode()).hexdigest()
    return tmp, marker


def command(*args, timeout=15):
    # Process-local tool selection, no xcode-select or other settings changes.
    # Do not forward ambient Xcode/CoreSimulator overrides, tokens, or credentials.
    inherited = ("USER", "LOGNAME", "TMPDIR", "__CF_USER_TEXT_ENCODING")
    env = {key: os.environ[key] for key in inherited if key in os.environ}
    env.update({"HOME": str(device_home().parents[3]), "DEVELOPER_DIR": XCODE, "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                "LC_ALL": "C"})
    label = " ".join(args[:2])
    try:
        result = subprocess.run(
            ["/usr/bin/xcrun", *args], env=env, timeout=timeout, stdin=subprocess.DEVNULL,
            capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    except subprocess.TimeoutExpired as exc:
        raise GateError(f"{label} exceeded its deadline", "COMMAND_TIMEOUT") from exc
    except OSError as exc:
        raise GateError(f"{label} could not start ({type(exc).__name__})", "COMMAND_START_FAILED") from exc
    if result.returncode:
        # Suppress raw CoreSimulator output: it can contain unrelated host paths and IDs.
        raise GateError(f"{label} exited {result.returncode}", "COMMAND_NONZERO")
    return result.stdout.strip()


def json_category(category, timeout, *selector):
    try:
        raw = command("simctl", "list", "-j", category, *selector, timeout=timeout)
        if len(raw) > 1_000_000:
            raise ValueError("oversized simctl response")
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError("duplicate JSON object key")
                result[key] = value
            return result
        doc = json.loads(raw, object_pairs_hook=unique)
        if not isinstance(doc, dict) or set(doc) != {category}:
            raise ValueError("simctl selector returned a non-category response")
        return doc
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise GateError("unsupported simctl JSON category", "INVENTORY_INVALID") from exc


def inventory(timeout=15):
    # Never enumerate pairs or other runtime device groups. Reject an ignored selector.
    doc = json_category("devices", timeout, RUNTIME)
    grouped = doc["devices"]
    if not isinstance(grouped, dict) or set(grouped) != {RUNTIME}:
        raise GateError("exact single runtime device inventory unverified", "INVENTORY_INVALID")
    devices = grouped[RUNTIME]
    if not isinstance(devices, list) or len(devices) > DEVICE_SCOPE_LIMIT:
        raise GateError("malformed runtime device inventory", "INVENTORY_INVALID")
    ids = set()
    for row in devices:
        if not isinstance(row, dict):
            raise GateError("malformed device row", "INVENTORY_INVALID")
        uid, name, state = (row.get(key) for key in ("udid", "name", "state"))
        if not isinstance(uid, str) or not UUID_RE.fullmatch(uid) or uid in ids or not all(
                isinstance(v, str) and 0 < len(v) <= 512 for v in (name, state)):
            raise GateError("unknown, duplicate, or malformed runtime device identity", "INVENTORY_INVALID")
        ids.add(uid)
    return doc, [(RUNTIME, row) for row in devices]


def catalog_records(category, budget):
    doc = json_category(category, budget)
    records = doc[category]
    if not isinstance(records, list) or len(records) > 512 or any(not isinstance(r, dict) for r in records):
        raise GateError("malformed simctl catalogue", "INVENTORY_INVALID")
    return records


def validate_catalog(diagnostic=None):
    d = diagnostic or Diagnostic()
    deadline = time.monotonic() + CATALOG_SECONDS

    def budget(cap=CATALOG_SECONDS):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise GateError("read-only catalog deadline exhausted", "CATALOG_DEADLINE")
        return min(cap, remaining)

    d.at("catalog-xcode")
    if tuple(command("xcodebuild", "-version", timeout=budget(12)).splitlines()) != XCODE_ID:
        raise GateError("expected Xcode 26.4.1 (17E202)", "XCODE_MISMATCH")
    d.at("catalog-runtime")
    runtimes = [r for r in catalog_records("runtimes", budget(CATALOG_KIND_SECONDS)) if r.get("identifier") == RUNTIME]
    budget()
    if (len(runtimes) != 1 or runtimes[0].get("isAvailable") is not True
            or runtimes[0].get("version") != RUNTIME_VERSION
            or runtimes[0].get("buildversion") != RUNTIME_BUILD):
        raise GateError("expected installed, available iOS 26.4 runtime version 26.4.1 (23E254a)", "RUNTIME_MISMATCH")
    d.at("catalog-device-type")
    types = catalog_records("devicetypes", budget(12))
    budget()
    if sum(t.get("identifier") == DEVICE for t in types) != 1:
        raise GateError("exact iPhone 16 Pro device type unavailable", "DEVICE_TYPE_MISSING")
    d.at("catalog-validation")
    supported = runtimes[0].get("supportedDeviceTypes")
    if (not isinstance(supported, list) or
            sum(isinstance(item, dict) and item.get("identifier") == DEVICE for item in supported) != 1):
        raise GateError("installed runtime does not advertise exact support for iPhone 16 Pro", "RUNTIME_DEVICE_UNSUPPORTED")
    d.at("catalog-runtime-devices")
    _, rows = inventory(timeout=budget(CATALOG_DEVICE_SECONDS))
    d.at("catalog-ownership-scope")
    global_ids = device_set_baseline(lambda: budget())
    budget()
    baseline = {}
    for _, row in rows:
        uid, name = row["udid"], row["name"]
        if global_ids.get(uid) != name:
            raise GateError("runtime row lacks exact local device identity", "DEVICE_SCOPE_UNVERIFIED")
        if row["state"] != "Shutdown":
            raise GateError("pre-existing device is not Shutdown", "UNOWNED_DEVICE_ACTIVE")
        baseline[uid] = name
    d.catalog_verified = True
    return baseline, global_ids


def device_set_baseline(remaining):
    """Read only default device-set identity metadata; no filesystem fallback mutations."""
    root = device_home()
    ids = {}
    try:
        root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            if os.fstat(root_fd).st_uid != os.getuid():
                raise ValueError("unverified default device-set owner")
            with os.scandir(root_fd) as entries:
                for i, entry in enumerate(entries):
                    remaining()
                    if i >= DEVICE_SCOPE_LIMIT:
                        raise ValueError("default device-set entry cap")
                    uid = entry.name
                    if not UUID_RE.fullmatch(uid):
                        if UUID_RE.fullmatch(uid.upper()):
                            raise ValueError("noncanonical UUID")
                        continue
                    child = os.open(uid, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
                    try:
                        if os.fstat(child).st_uid != os.getuid():
                            raise ValueError("unverified device directory owner")
                        flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
                        with os.fdopen(os.open("device.plist", flags, dir_fd=child), "rb") as fd:
                            st = os.fstat(fd.fileno())
                            if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_size > PLIST_LIMIT:
                                raise ValueError("unverified device metadata")
                            data = plistlib.loads(fd.read(PLIST_LIMIT + 1))
                    finally:
                        os.close(child)
                    if (not isinstance(data, dict) or data.get("UDID") != uid or
                            not isinstance(data.get("name"), str) or not 0 < len(data["name"]) <= 512):
                        raise ValueError("unverified metadata identity")
                    ids[uid] = data["name"]
        finally:
            os.close(root_fd)
    except (OSError, ValueError, TypeError, OverflowError, ExpatError, plistlib.InvalidFileException) as exc:
        raise GateError("default device-set UUID/name scope not independently proven", "DEVICE_SCOPE_UNVERIFIED") from exc
    return ids


def scope_check(rows, previous, records):
    for _, row in rows:
        uid = row["udid"]
        if uid in previous:
            if row["name"] != previous[uid] or row["state"] != "Shutdown":
                raise GateError("pre-existing runtime device changed while probing", "UNOWNED_DEVICE_ACTIVE")
        elif uid not in records.values():
            raise GateError("unplanned runtime device present", "UNKNOWN_DEVICE_IN_SCOPE")


def device_home():
    # Default device set by design, so subsequent explicit-UDID tools can find our pair.
    return Path(pwd.getpwuid(os.getuid()).pw_dir) / "Library/Developer/CoreSimulator/Devices"


def free_space(tmp, minimum, phase):
    root = device_home()
    while not root.exists():
        root = root.parent
    temp_free, sim_free = (shutil.disk_usage(p).free for p in (tmp, root))
    if min(temp_free, sim_free) < minimum:
        raise GateError(f"{phase} disk floor not met: runner_temp={temp_free}, "
                        f"simulator_volume={sim_free}, required_each={minimum} bytes", "DISK_FLOOR")
    return {"runner_temp_free_bytes": temp_free, "simulator_volume_free_bytes": sim_free}


def name_for(token, role):
    return f"{PREFIX}{token}-{role}"


def write_receipt(path, record):
    fd, spool = tempfile.mkstemp(prefix=".writing-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(record, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(spool, path)
    finally:
        if os.path.exists(spool):
            os.unlink(spool)


def read_receipt(path, tmp, marker):
    if (path.name != RECEIPT or path.is_symlink() or path.parent.is_symlink()
            or path.parent.resolve().parent != tmp):
        raise GateError("receipt must be in its private directory directly under this RUNNER_TEMP")
    if (path.parent.stat().st_mode & 0o777) != 0o700 or path.parent.stat().st_uid != os.getuid():
        raise GateError("invalid receipt directory owner or mode")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK),
                   encoding="utf-8") as stream:
        metadata = os.fstat(stream.fileno())
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid()
                or metadata.st_mode & 0o777 != 0o600 or metadata.st_size > 4096):
            raise GateError("invalid ownership receipt file")
        data = json.load(stream)
    if not isinstance(data, dict):
        raise GateError("invalid ownership receipt JSON")
    token, records = data.get("token"), data.get("records")
    if (data.get("schema") != 1 or data.get("job_marker") != marker
            or not isinstance(token, str) or not TOKEN_RE.fullmatch(token)
            or path.parent.name != PREFIX + token or not isinstance(records, dict)
            or not set(records) <= set(ROLES) or any(
                i is not None and (not isinstance(i, str) or not UUID_RE.fullmatch(i))
                for i in records.values())):
        raise GateError("ownership receipt doesn't match this job or has invalid records")
    known = [i for i in records.values() if i is not None]
    if len(known) != len(set(known)):
        raise GateError("duplicate UUID in ownership receipt")
    return data


def lookup(rows, token, role, uid):
    """Reject identity drift before invoking any mutating command."""
    name = name_for(token, role)
    candidates = [(rt, row) for rt, row in rows
                  if row.get("name") == name or (uid is not None and row.get("udid") == uid)]
    if not candidates:
        return None
    if len(candidates) == 1:
        rt, row = candidates[0]
        actual = row.get("udid")
        if (rt == RUNTIME and row.get("deviceTypeIdentifier") == DEVICE
                and row.get("name") == name and isinstance(actual, str)
                and UUID_RE.fullmatch(actual) and (uid is None or actual == uid)):
            return row
    raise GateError(f"{role} simulator ownership/identity drift; no mutation for this role", "IDENTITY_DRIFT")


def remaining_until(deadline, limit):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise GateError("owned cleanup deadline exhausted", "CLEANUP_DEADLINE")
    return min(remaining, limit)


def fresh_owned(token, role, uid, deadline):
    _, rows = inventory(timeout=remaining_until(deadline, 6))
    row = lookup(rows, token, role, uid)
    if row is None and uid is not None:
        try:
            # Filtered absence is not evidence if the whole device set disappeared.
            root = os.open(device_home(), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                if os.fstat(root).st_uid != os.getuid():
                    raise ValueError("unexpected device-set owner")
                try:
                    os.stat(uid, dir_fd=root, follow_symlinks=False)
                except FileNotFoundError:
                    pass
                else:
                    raise GateError("UUID still exists outside proven scoped inventory", "IDENTITY_DRIFT")
            finally:
                os.close(root)
        except (OSError, ValueError) as exc:
            raise GateError("cannot independently check missing UUID", "DEVICE_SCOPE_UNVERIFIED") from exc
    return row


def settle_owned(token, role, uid, deadline, ready, code, command_error=None):
    """Only reread; do not repeat a state-changing request or weaken identity checks."""
    limit = min(deadline, time.monotonic() + SETTLE_SECONDS)
    consecutive = 0
    while time.monotonic() < limit:
        row = fresh_owned(token, role, uid, limit)
        if ready(row):
            consecutive += 1
            if consecutive >= (2 if row is None else 1):
                return row
        else:
            consecutive = 0
            time.sleep(min(POLL_SECONDS, max(0, limit - time.monotonic())))
    if command_error:
        raise command_error
    raise GateError(f"{role} {code.lower().replace('_', ' ')}", code)


def cleanup(path, data, diagnostic=None):
    """Offer bounded readbacks per exact owned role; never use a broad selector."""
    d = diagnostic or Diagnostic()
    d.cleanup_attempted = True
    token = data["token"]
    failures = []
    for role, uid in list(data["records"].items()):
        deadline = time.monotonic() + ROLE_CLEANUP_SECONDS
        stage = "cleanup-identify"
        cmd_error = None
        try:
            row = fresh_owned(token, role, uid, deadline)
            if row:
                confirmed = row["udid"]
                if uid is None:
                    stage = "cleanup-journal"
                    data["records"][role] = confirmed
                    write_receipt(path, data)
                cmd_error = None
                if row.get("state") != "Shutdown":
                    stage = "cleanup-shutdown"
                    if row.get("state") != "Shutting Down":
                        try:
                            command("simctl", "shutdown", confirmed, timeout=remaining_until(deadline, 12))
                        except GateError as exc:
                            if exc.code == "INTERRUPTED":
                                raise
                            cmd_error = exc
                stage = "cleanup-shutdown-readback"
                row = settle_owned(token, role, confirmed, deadline,
                                   lambda r: r is None or r.get("state") == "Shutdown",
                                   "SHUTDOWN_NOT_VERIFIED", cmd_error)
                if row:
                    stage = "cleanup-delete"
                    cmd_error = None
                    try:
                        command("simctl", "delete", confirmed, timeout=remaining_until(deadline, 12))
                    except GateError as exc:
                        if exc.code == "INTERRUPTED":
                            raise
                        cmd_error = exc
                    stage = "cleanup-delete-readback"
                    settle_owned(token, role, confirmed, deadline, lambda r: r is None,
                                 "DELETE_NOT_VERIFIED", cmd_error)
            elif uid is None:
                # Late create may still materialize; preserve journal and fail closed.
                raise GateError(f"{role} interrupted create is not yet observable; ownership receipt retained",
                                "INTERRUPTED_CREATE_UNOBSERVED")
            else:
                stage = "cleanup-delete-readback"
                settle_owned(token, role, uid, deadline, lambda r: r is None,
                             "DELETE_NOT_VERIFIED")
            stage = "cleanup-journal"
            del data["records"][role]
            write_receipt(path, data)
        except (GateError, OSError) as exc:
            issue = reason(exc, stage, role)
            if cmd_error is not None:
                command_stage = ("cleanup-shutdown" if stage.startswith("cleanup-shutdown") else "cleanup-delete")
                issue["commandFailure"] = reason(cmd_error, command_stage)["code"]
            d.cleanup_failures.append(issue)
            failures.append(str(exc))
    if failures:
        raise CleanupError("; ".join(failures), "CLEANUP_FAILED")
    try:
        path.unlink()
        path.parent.rmdir()  # Never recursively delete.
    except OSError as exc:
        d.cleanup_failures.append(reason(exc, "cleanup-journal"))
        raise CleanupError(str(exc), "CLEANUP_FAILED") from exc
    d.cleanup_verified = True


def boot_remaining(deadline, operation_cap):
    seconds = deadline - time.monotonic()
    if seconds <= 0:
        raise GateError("boot/readback deadline exhausted", "BOOT_DEADLINE")
    return min(seconds, operation_cap)


def run_boot_command(uid, deadline, diagnostic, role):
    started = time.monotonic()
    timeout = boot_remaining(deadline, BOOT_ROLE_SECONDS)
    if role == "guest":
        diagnostic.guest_boot_requested = True
    try:
        # Exact owned UUID only; -b requests one boot and blocks for readiness.
        command("simctl", "bootstatus", uid, "-b", timeout=timeout)
    except GateError as exc:
        raise GateError(f"{role}: {exc}", exc.code) from exc
    boot_remaining(deadline, BOOT_ROLE_SECONDS)  # zero exit after the limit is not evidence
    return round(time.monotonic() - started, 3)


def require_state(rows, token, uid, role, expected, code):
    row = lookup(rows, token, role, uid)
    if not row or row.get("state") != expected or row.get("isAvailable") is not True:
        raise GateError(f"{role} not available and {expected} in required inventory snapshot", code)


def boot_pair(records, token, budget, d, baseline):
    """A/B diagnostic: boot host alone; prove simultaneous state after guest starts."""
    started = time.monotonic()
    deadline = started + budget
    host, guest = (records[role] for role in ROLES)
    host_phase_deadline = min(deadline - JOINT_READ_SECONDS, started + BOOT_ROLE_SECONDS)
    d.at("host-boot-command", "host")
    host_seconds = run_boot_command(host, host_phase_deadline - HOST_STABILITY_RESERVE, d, "host")
    d.host_boot_command_completed = True

    def read_host_stability(stage):
        d.at(stage, "host")
        _, rows = inventory(timeout=boot_remaining(host_phase_deadline, STABILITY_READ_SECONDS))
        boot_remaining(host_phase_deadline, STABILITY_READ_SECONDS)
        scope_check(rows, baseline, records)
        require_state(rows, token, host, "host", "Booted", "HOST_NOT_STABLY_BOOTED")
        d.at(stage, "guest")
        require_state(rows, token, guest, "guest", "Shutdown", "GUEST_NOT_SHUTDOWN_BEFORE_BOOT")

    read_host_stability("host-stability-first")
    d.at("host-stability-confirm", "host")
    if boot_remaining(host_phase_deadline, HOST_STABILITY_GAP * 2) <= HOST_STABILITY_GAP:
        raise GateError("insufficient time for separated host-readback observations", "BOOT_DEADLINE")
    time.sleep(HOST_STABILITY_GAP)
    read_host_stability("host-stability-confirm")
    d.host_stable_before_guest = True

    d.at("guest-boot-command", "guest")
    guest_deadline = min(deadline - JOINT_READ_SECONDS, time.monotonic() + BOOT_ROLE_SECONDS)
    guest_seconds = run_boot_command(guest, guest_deadline, d, "guest")
    d.guest_boot_command_completed = True

    # One fresh atomic inventory: historical host and guest observations cannot be paired.
    d.at("joint-booted-snapshot")
    _, rows = inventory(timeout=boot_remaining(deadline, JOINT_READ_SECONDS))
    boot_remaining(deadline, JOINT_READ_SECONDS)
    scope_check(rows, baseline, records)
    for role, uid in (("host", host), ("guest", guest)):
        d.at("joint-booted-snapshot", role)
        require_state(rows, token, uid, role, "Booted", "POSTBOOT_NOT_BOOTED")
    d.dual_boot_verified = True
    return {"host": host_seconds, "guest": guest_seconds}


def preflight(tmp, marker, minimum, budget, keep, diagnostic=None):
    d = diagnostic or Diagnostic()
    try:
        return _preflight(tmp, marker, minimum, budget, keep, d)
    except Exception as exc:
        d.record_primary(exc)
        raise


def _preflight(tmp, marker, minimum, budget, keep, d):
    d.at("disk-before")
    before = free_space(tmp, minimum, "before create")
    baseline, global_ids = validate_catalog(d)
    existing_ids = set(global_ids)
    existing_names = set(global_ids.values())
    token = uuid.uuid4().hex
    if any(name_for(token, role) in existing_names for role in ROLES):
        raise GateError("nonce-name collision before create", "NONCE_COLLISION")
    d.at("journal")
    directory = tmp / (PREFIX + token)
    directory.mkdir(mode=0o700)
    receipt = directory / RECEIPT
    data = {"schema": 1, "job_marker": marker, "token": token, "records": {}}
    write_receipt(receipt, data)
    keep_owned = False
    success = False
    try:
        for role in ROLES:
            d.at("journal", role)
            data["records"][role] = None
            write_receipt(receipt, data)  # journal the operation before calling simctl
            d.at("create", role)
            uid = command("simctl", "create", name_for(token, role), DEVICE, RUNTIME)
            if (not UUID_RE.fullmatch(uid) or uid in existing_ids
                    or uid in data["records"].values()):
                raise GateError(f"{role} did not return a fresh UUID", "FRESH_UUID_REQUIRED")
            d.at("journal", role)
            data["records"][role] = uid
            write_receipt(receipt, data)
            d.at("create-readback", role)
            _, rows = inventory()
            scope_check(rows, baseline, data["records"])
            row = lookup(rows, token, role, uid)
            if not row or row.get("state") != "Shutdown" or row.get("isAvailable") is not True:
                raise GateError(f"{role} newly created device is unavailable or not Shutdown", "CREATED_NOT_SHUTDOWN")
        d.at("preboot-readback")
        _, rows = inventory()
        scope_check(rows, baseline, data["records"])
        for role, uid in data["records"].items():
            d.at(d.stage, role)
            row = lookup(rows, token, role, uid)
            if not row or row.get("state") != "Shutdown" or row.get("isAvailable") is not True:
                raise GateError(f"{role} not available and Shutdown before dual boot", "PREBOOT_NOT_SHUTDOWN")
        timings = boot_pair(data["records"], token, budget, d, baseline)
        d.at("disk-both-booted")
        during = free_space(tmp, minimum, "while both booted")
        result = {
            "status": "PASS", "scope": "dual-simulator-only",
            "xcode": {"version": "26.4.1", "build": "17E202"},
            "runtime": {"identifier": RUNTIME, "version": RUNTIME_VERSION, "build": RUNTIME_BUILD},
            "device_type": DEVICE, "boot_deadline_s": budget, "disk_floor_bytes": minimum,
            "free_disk_before": before, "free_disk_both_booted": during,
            "devices": {role: {"name": name_for(token, role), "udid": uid,
                               "state_at_probe": "Booted", "boot_wait_s": timings[role]}
                        for role, uid in data["records"].items()},
            "disposition": "retained-for-same-job" if keep else "deleted-and-verified",
        }
        if keep:
            result["cleanup_receipt"] = str(receipt)
        success = True
        keep_owned = keep
        return result
    except Exception as exc:
        d.record_primary(exc)
        raise
    finally:
        if not keep_owned:
            try:
                cleanup(receipt, data, d)
            except (GateError, OSError) as exc:
                # Report cleanup failure, but preserve a primary preflight error and its cause.
                print(f"cleanup incomplete: {exc}; same-job receipt: {receipt}", file=sys.stderr)
                if success:
                    raise


def interrupted(signum, _frame):
    raise GateError(f"interrupted (signal {signum})", "INTERRUPTED")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    probe = sub.add_parser("probe")
    probe.add_argument("--min-free-gib", required=True, type=int)
    probe.add_argument("--boot-timeout", default=180, type=int)
    probe.add_argument("--keep", action="store_true")
    clean = sub.add_parser("cleanup")
    clean.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "probe" and (not 1 <= args.min_free_gib <= 64 or
                                   not 1 <= args.boot_timeout <= 300):
        parser.error("min-free-gib must be 1–64 and boot-timeout 1–300 seconds")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        tmp, marker = job_context()
        if args.action == "probe":
            result = preflight(tmp, marker, args.min_free_gib * GIB, args.boot_timeout, args.keep)
        else:
            data = read_receipt(args.receipt, tmp, marker)
            cleanup(args.receipt, data)
            result = {"status": "PASS", "scope": "owned-simulators-cleaned"}
        print(json.dumps(result, sort_keys=True))
        return 0
    except (GateError, OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
        print(json.dumps({"status": "FAIL", "reason": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
