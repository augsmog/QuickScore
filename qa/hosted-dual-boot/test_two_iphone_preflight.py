"""Linux-safe tests: all native commands are intercepted at subprocess.run."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

import two_iphone_preflight as subject

HOST = "20000000-0000-4000-8000-000000000001"
GUEST = "20000000-0000-4000-8000-000000000002"
EXISTING = "10000000-0000-4000-8000-000000000003"
FOREIGN = "30000000-0000-4000-8000-000000000004"
MARK = "same-job"


def row(uid, name, state="Shutdown", kind=subject.DEVICE):
    return dict(udid=uid, name=name, state=state, deviceTypeIdentifier=kind, isAvailable=True)


class Sim:
    def __init__(self):
        self.devices = {EXISTING: row(EXISTING, "Already present", "Booted")}
        self.original = copy.deepcopy(self.devices[EXISTING])
        self.calls = []
        self.barrier = threading.Barrier(2, timeout=3)
        self.failure = None
        self.build = subject.RUNTIME_BUILD
        self.runtime_available = True
        self.supports = True
        self.delete_fails = set()

    def run(self, argv, *, env, timeout, **_):
        assert argv[0] == "/usr/bin/xcrun"
        assert env["DEVELOPER_DIR"] == subject.XCODE
        assert "GITHUB_TOKEN" not in env
        cmd = argv[1:]
        self.calls.append((cmd, timeout))

        def result(stdout="", returncode=0):
            return subprocess.CompletedProcess(argv, returncode, stdout, "private raw error")

        if cmd == ["xcodebuild", "-version"]:
            return result("\n".join(subject.XCODE_ID))
        if cmd == ["simctl", "list", "-j"]:
            devices = [dict(d) for d in self.devices.values()]
            supported = subject.DEVICE if self.supports else "wrong-type"
            return result(json.dumps({
                "devices": {subject.RUNTIME: devices},
                "runtimes": [{"identifier": subject.RUNTIME, "isAvailable": self.runtime_available,
                              "version": subject.RUNTIME_VERSION, "buildversion": self.build,
                              "supportedDeviceTypes": [{"identifier": supported}]}],
                "devicetypes": [{"identifier": subject.DEVICE}],
            }))
        if cmd[:2] == ["simctl", "create"]:
            name = cmd[2]
            assert cmd[3:] == [subject.DEVICE, subject.RUNTIME]
            assert not any(r["name"] == name for r in self.devices.values())
            uid = HOST if name.endswith("-host") else GUEST
            if self.failure == "returned-existing":
                return result(EXISTING)
            self.devices[uid] = row(uid, name)
            if self.failure == "uncertain-create" and uid == GUEST:
                raise subprocess.TimeoutExpired(argv, timeout)
            if self.failure == "lost-create" and uid == GUEST:
                del self.devices[uid]
                raise subprocess.TimeoutExpired(argv, timeout)
            if self.failure == "preboot-drift" and uid == GUEST:
                self.devices[HOST]["name"] = "Unrelated name"
            return result(uid)
        op, uid = cmd[1:3]
        assert uid in {HOST, GUEST}, (op, uid)
        if op == "bootstatus":
            assert cmd[3:] == ["-b"]
            self.barrier.wait()  # serial launches cannot pass this test
            if uid == GUEST and self.failure == "boot-error":
                return result(returncode=148)
            if uid == GUEST and self.failure == "boot-timeout":
                raise subprocess.TimeoutExpired(argv, timeout)
            self.devices[uid]["state"] = "Booted"
            if uid == GUEST and self.failure == "drift":
                self.devices[uid]["deviceTypeIdentifier"] = "foreign-type"
            if uid == GUEST and self.failure == "false-ready":
                self.devices[uid]["state"] = "Shutdown"
        elif op == "shutdown":
            self.devices[uid]["state"] = "Shutdown"
        elif op == "delete":
            if uid in self.delete_fails:
                return result(returncode=1)
            assert self.devices[uid]["state"] == "Shutdown"
            del self.devices[uid]
        else:
            raise AssertionError(cmd)
        return result()

    def mutations(self):
        return [(cmd[1], cmd[2]) for cmd, _ in self.calls
                if len(cmd) >= 3 and cmd[1] in {"bootstatus", "delete", "shutdown"}]


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tmp = Path(self.temp.name).resolve()
        self.sim = Sim()
        self.logs = io.StringIO()
        for p in (patch.object(subject.subprocess, "run", side_effect=self.sim.run),
                  patch.object(subject.shutil, "disk_usage",
                               return_value=shutil._ntuple_diskusage(14*subject.GIB, 4*subject.GIB, 10*subject.GIB)),
                  patch.object(subject, "device_home", return_value=self.tmp/"home"/"Library"/"Developer"/"CoreSimulator"/"Devices"),
                  contextlib.redirect_stderr(self.logs)):
            p.__enter__()
            self.addCleanup(p.__exit__, None, None, None)

    def probe(self, keep=False):
        return subject.preflight(self.tmp, MARK, 4 * subject.GIB, 2, keep)

    def cleanup(self, receipt):
        path = Path(receipt)
        data = subject.read_receipt(path, self.tmp, MARK)
        subject.cleanup(path, data)

    def only_original(self):
        self.assertEqual(self.sim.devices, {EXISTING: self.sim.original})

    def test_concurrent_success_and_default_scoped_cleanup(self):
        verdict = self.probe()
        self.assertEqual(verdict["disposition"], "deleted-and-verified")
        self.assertEqual({d["udid"] for d in verdict["devices"].values()}, {HOST, GUEST})
        self.assertEqual({d["state_at_probe"] for d in verdict["devices"].values()}, {"Booted"})
        self.assertEqual(verdict["free_disk_both_booted"]["simulator_volume_free_bytes"], 10 * subject.GIB)
        self.assertEqual(len({d["name"] for d in verdict["devices"].values()}), 2)
        self.assertEqual(list(self.tmp.iterdir()), [])
        self.only_original()

    def test_one_boot_failure_still_removes_pair(self):
        self.sim.failure = "boot-error"
        with self.assertRaisesRegex(subject.GateError, "guest.*148"):
            self.probe(keep=True)
        self.assertEqual({i for op, i in self.sim.mutations() if op == "delete"}, {HOST, GUEST})
        self.only_original()

    def test_timeout_uses_one_shared_budget_and_cleans_pair(self):
        self.sim.failure = "boot-timeout"
        with self.assertRaisesRegex(subject.GateError, "guest.*deadline"):
            self.probe()
        boot_waits = [t for c, t in self.sim.calls if c[1:2] == ["bootstatus"]]
        self.assertEqual(len(boot_waits), 2)
        self.assertTrue(all(0 < t <= 2 for t in boot_waits))
        self.only_original()

    def test_identity_drift_never_mutates_changed_guest(self):
        self.sim.failure = "drift"
        with self.assertRaisesRegex(subject.GateError, "guest.*identity drift"):
            self.probe()
        self.assertIn(("delete", HOST), self.sim.mutations())
        self.assertNotIn(("shutdown", GUEST), self.sim.mutations())
        self.assertNotIn(("delete", GUEST), self.sim.mutations())
        self.assertEqual(self.sim.devices[EXISTING], self.sim.original)
        self.assertIn("cleanup incomplete", self.logs.getvalue())

    def test_drift_before_boot_never_invokes_boot(self):
        self.sim.failure = "preboot-drift"
        with self.assertRaisesRegex(subject.GateError, "host.*identity drift"):
            self.probe()
        self.assertFalse(any(op == "bootstatus" for op, _ in self.sim.mutations()))
        self.assertNotIn(("delete", HOST), self.sim.mutations())
        self.assertNotIn(GUEST, self.sim.devices)

    def test_success_explicit_cleanup_only_owned_devices(self):
        verdict = self.probe(keep=True)
        self.assertEqual(verdict["disposition"], "retained-for-same-job")
        self.sim.devices[FOREIGN] = row(FOREIGN, "New unrelated", "Booted")
        other = copy.deepcopy(self.sim.devices[FOREIGN])
        self.assertFalse(any(a in {"delete", "shutdown"} for a, _ in self.sim.mutations()))
        self.cleanup(verdict["cleanup_receipt"])
        self.assertEqual(self.sim.devices.pop(FOREIGN), other)
        self.only_original()

    def test_cleanup_receipt_from_different_job_is_refused(self):
        verdict = self.probe(keep=True)
        receipt = Path(verdict["cleanup_receipt"])
        before = list(self.sim.calls)
        with self.assertRaisesRegex(subject.GateError, "doesn't match"):
            subject.read_receipt(receipt, self.tmp, "different-job")
        self.assertEqual(self.sim.calls, before)
        self.cleanup(receipt)

    def test_runtime_mismatch_or_unsupported_type_stops_before_create(self):
        self.sim.build = "wrong build"
        with self.assertRaisesRegex(subject.GateError, "expected installed"):
            self.probe()
        self.sim.build = subject.RUNTIME_BUILD
        self.sim.supports = False
        with self.assertRaisesRegex(subject.GateError, "does not advertise support"):
            self.probe()
        self.assertFalse(any(c[1:2] == ["create"] for c, _ in self.sim.calls))
        self.only_original()

    def test_disk_floor_rechecked_before_creating_and_when_both_booted(self):
        stat = lambda free: shutil._ntuple_diskusage(14*subject.GIB, 0, free*subject.GIB)
        with patch.object(subject.shutil, "disk_usage", side_effect=[stat(3), stat(10)]):
            with self.assertRaisesRegex(subject.GateError, "before create disk floor"):
                self.probe()
            self.assertEqual(self.sim.calls, [])
        with patch.object(subject.shutil, "disk_usage", side_effect=[stat(10), stat(10), stat(10), stat(3)]):
            with self.assertRaisesRegex(subject.GateError, "while both booted disk floor"):
                self.probe()
        self.only_original()

    def test_interrupted_create_with_observed_nonce_name_is_cleaned(self):
        self.sim.failure = "uncertain-create"
        with self.assertRaisesRegex(subject.GateError, "create exceeded"):
            self.probe()
        self.only_original()
        self.assertEqual(list(self.tmp.iterdir()), [])

    def test_interrupted_create_without_observation_retains_journal(self):
        self.sim.failure = "lost-create"
        with self.assertRaisesRegex(subject.GateError, "create exceeded"):
            self.probe()
        self.only_original()
        self.assertIn("not yet observable", self.logs.getvalue())
        [receipt] = list(self.tmp.glob("*/ownership.json"))
        journal = subject.read_receipt(receipt, self.tmp, MARK)
        self.assertEqual(journal["records"], {"guest": None})

    def test_duplicate_unsafe_uuid_is_not_acted_on(self):
        self.sim.failure = "returned-existing"
        with self.assertRaisesRegex(subject.GateError, "fresh UUID"):
            self.probe()
        self.assertEqual(self.sim.mutations(), [])
        self.only_original()

    def test_both_booted_required_not_just_zero_exit(self):
        self.sim.failure = "false-ready"
        with self.assertRaisesRegex(subject.GateError, "guest not available and Booted"):
            self.probe()
        self.only_original()

    def test_cleanup_failure_prevents_pass_and_retains_exact_failed_role(self):
        self.sim.delete_fails.add(HOST)
        with self.assertRaisesRegex(subject.GateError, "simctl delete exited 1"):
            self.probe()
        [receipt] = list(self.tmp.glob("*/ownership.json"))
        self.assertEqual(subject.read_receipt(receipt, self.tmp, MARK)["records"], {"host": HOST})
        self.assertNotIn(GUEST, self.sim.devices)
        self.sim.delete_fails.clear()
        self.cleanup(receipt)
        self.only_original()

    def test_host_gate_refuses_non_darwin_with_zero_simctl(self):
        with patch.object(subject.platform, "system", return_value="Linux"):
            with self.assertRaisesRegex(subject.GateError, "no simulator commands ran"):
                subject.job_context()
        self.assertEqual(self.sim.calls, [])


if __name__ == "__main__":
    unittest.main()
