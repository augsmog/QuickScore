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
        self.devices = {EXISTING: row(EXISTING, "Already present", "Shutdown")}
        self.original = copy.deepcopy(self.devices[EXISTING])
        self.calls = []
        self.host_stability_reads = 0
        self.guest_boot_requested = False
        self.failure = None
        self.build = subject.RUNTIME_BUILD
        self.runtime_available = True
        self.supports = True
        self.delete_fails = set()
        self.delayed_shutdown = {}
        self.delayed_delete = {}
        self.shutdown_delay = False
        self.delete_delay = False
        self.delete_reply_lost = False
        self.shutdown_drift = False
        self.host_never_shuts = False

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
        if cmd == ["simctl", "list", "-j", "runtimes"]:
            supported = subject.DEVICE if self.supports else "wrong-type"
            return result(json.dumps({"runtimes": [{"identifier": subject.RUNTIME, "isAvailable": self.runtime_available,
                              "version": subject.RUNTIME_VERSION, "buildversion": self.build,
                              "supportedDeviceTypes": [{"identifier": supported}]}]}))
        if cmd == ["simctl", "list", "-j", "devicetypes"]:
            return result(json.dumps({"devicetypes": [{"identifier": subject.DEVICE}]}))
        if cmd == ["simctl", "list", "-j", "devices", "26.4"]:
            if self.guest_boot_requested and self.failure == "joint-timeout" and self.devices.get(GUEST, {}).get("state") == "Booted":
                self.failure = None  # only the joint read fails; cleanup remains observable
                raise subprocess.TimeoutExpired(argv, timeout)
            if not self.guest_boot_requested and self.devices.get(HOST, {}).get("state") == "Booted":
                self.host_stability_reads += 1
                if self.failure == "host-loses-state-on-confirm" and self.host_stability_reads == 2:
                    self.devices[HOST]["state"] = "Shutdown"
            for uid in list(self.delayed_shutdown):
                self.delayed_shutdown[uid] -= 1
                if self.delayed_shutdown[uid] <= 0:
                    self.devices[uid]["state"] = "Shutdown"
                    del self.delayed_shutdown[uid]
            for uid in list(self.delayed_delete):
                self.delayed_delete[uid] -= 1
                if self.delayed_delete[uid] <= 0:
                    del self.devices[uid]
                    del self.delayed_delete[uid]
            devices = [dict(d) for d in self.devices.values()]
            return result(json.dumps({"devices": {subject.RUNTIME: devices}}))
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
            if uid == HOST and self.failure == "host-timeout":
                raise subprocess.TimeoutExpired(argv, timeout)
            if uid == GUEST:
                self.guest_boot_requested = True
                if self.failure == "parallel-contention" and self.host_stability_reads < 2:
                    # Illustrative contention model only: an early second boot cannot succeed.
                    raise subprocess.TimeoutExpired(argv, timeout)
                assert self.host_stability_reads >= 2
            if uid == GUEST and self.failure == "boot-error":
                return result(returncode=148)
            if uid == GUEST and self.failure == "boot-timeout":
                raise subprocess.TimeoutExpired(argv, timeout)
            self.devices[uid]["state"] = "Booted"
            if uid == GUEST and self.failure == "drift":
                self.devices[uid]["deviceTypeIdentifier"] = "foreign-type"
            if (uid == GUEST and self.failure == "false-ready") or (uid == HOST and self.failure == "host-false-ready"):
                self.devices[uid]["state"] = "Shutdown"
            if uid == GUEST and self.failure == "host-regresses-during-guest":
                self.devices[HOST]["state"] = "Shutdown"
        elif op == "shutdown":
            if self.host_never_shuts and uid == HOST:
                self.devices[uid]["state"] = "Shutting Down"
                raise subprocess.TimeoutExpired(argv, timeout)
            if self.shutdown_delay:
                self.devices[uid]["state"] = "Shutting Down"
                self.delayed_shutdown[uid] = 2
            else:
                self.devices[uid]["state"] = "Shutdown"
            if self.shutdown_drift and uid == GUEST:
                self.devices[uid]["name"] = "Not task-owned any longer"
        elif op == "delete":
            if uid in self.delete_fails:
                return result(returncode=1)
            assert self.devices[uid]["state"] == "Shutdown"
            if self.delete_delay:
                self.delayed_delete[uid] = 2
            else:
                del self.devices[uid]
            if self.delete_reply_lost:
                raise subprocess.TimeoutExpired(argv, timeout)
        else:
            raise AssertionError(cmd)
        return result()

    def mutations(self):
        return [(cmd[1], cmd[2]) for cmd, _ in self.calls
                if len(cmd) >= 3 and cmd[1] in {"bootstatus", "delete", "shutdown"}]


class DeviceSetTests(unittest.TestCase):
    def test_real_local_scope_reads_only_identity_and_rejects_symlink(self):
        import plistlib
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/EXISTING).mkdir()
            (root/EXISTING/"device.plist").write_bytes(plistlib.dumps({"UDID":EXISTING,"name":"Existing"}))
            (root/"device_set.plist").write_bytes(b"not an examined identity file")
            with patch.object(subject,"device_home",return_value=root):
                self.assertEqual(subject.device_set_baseline(lambda:1),{EXISTING:"Existing"})
                (root/FOREIGN).symlink_to(root/EXISTING,target_is_directory=True)
                with self.assertRaises(subject.GateError) as err:subject.device_set_baseline(lambda:1)
                self.assertEqual(err.exception.code,"DEVICE_SCOPE_UNVERIFIED")

    def test_unknown_global_nonce_collision_never_allocates(self):
        from types import SimpleNamespace
        t="a"*32
        d=subject.Diagnostic()
        ids={EXISTING:"Already present",FOREIGN:subject.name_for(t,"host")}
        with tempfile.TemporaryDirectory() as tmp, patch.object(subject,"free_space"), \
             patch.object(subject,"validate_catalog",return_value=({EXISTING:"Already present"},ids)), \
             patch.object(subject.uuid,"uuid4",return_value=SimpleNamespace(hex=t)), \
             patch.object(subject,"command") as mutating:
            with self.assertRaises(subject.GateError) as err:
                subject.preflight(Path(tmp),MARK,4*subject.GIB,subject.BOOT_SHARED_SECONDS,False,d)
            self.assertEqual(err.exception.code,"NONCE_COLLISION")
            mutating.assert_not_called()
            self.assertFalse(d.cleanup_attempted)


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tmp = Path(self.temp.name).resolve()
        home = tempfile.TemporaryDirectory()
        self.addCleanup(home.cleanup)
        self.device_scope = Path(home.name)/"Library"/"Developer"/"CoreSimulator"/"Devices"
        self.device_scope.mkdir(parents=True)
        self.sim = Sim()
        self.logs = io.StringIO()
        for p in (patch.object(subject.subprocess, "run", side_effect=self.sim.run),
                  patch.object(subject.shutil, "disk_usage",
                               return_value=shutil._ntuple_diskusage(14*subject.GIB, 4*subject.GIB, 10*subject.GIB)),
                  patch.object(subject, "device_set_baseline", return_value={EXISTING:"Already present"}),
                  patch.object(subject, "SETTLE_SECONDS", .06),
                  patch.object(subject, "HOST_STABILITY_GAP", .001),
                  patch.object(subject, "POLL_SECONDS", .001),
                  patch.object(subject, "device_home", return_value=self.device_scope),
                  contextlib.redirect_stderr(self.logs)):
            p.__enter__()
            self.addCleanup(p.__exit__, None, None, None)

    def probe(self, keep=False):
        return subject.preflight(self.tmp, MARK, 4 * subject.GIB, subject.BOOT_SHARED_SECONDS, keep)

    def cleanup(self, receipt):
        path = Path(receipt)
        data = subject.read_receipt(path, self.tmp, MARK)
        subject.cleanup(path, data)

    def only_original(self):
        self.assertEqual(self.sim.devices, {EXISTING: self.sim.original})

    def test_serial_success_under_synthetic_contention_and_default_scoped_cleanup(self):
        self.sim.failure = "parallel-contention"
        verdict = self.probe()
        self.assertEqual(verdict["disposition"], "deleted-and-verified")
        self.assertEqual(self.sim.host_stability_reads, 2)
        self.assertEqual([uid for op, uid in self.sim.mutations() if op == "bootstatus"], [HOST, GUEST])
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
        self.assertTrue(0 < boot_waits[0] <= subject.BOOT_ROLE_SECONDS - subject.HOST_STABILITY_RESERVE)
        self.assertTrue(0 < boot_waits[1] <= subject.BOOT_ROLE_SECONDS)
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
        with self.assertRaisesRegex(subject.GateError, "does not advertise exact support"):
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

    def test_async_shutdown_and_delete_wait_for_actual_owned_state(self):
        self.sim.shutdown_delay = True
        self.sim.delete_delay = True
        d = subject.Diagnostic()
        verdict = subject.preflight(self.tmp, MARK, 4*subject.GIB, subject.BOOT_SHARED_SECONDS, False, d)
        self.assertEqual(verdict["status"], "PASS")
        self.assertTrue(d.dual_boot_verified)
        self.assertTrue(d.cleanup_verified)
        for role in (HOST, GUEST):
            self.assertEqual(self.sim.mutations().count(("shutdown", role)), 1)
            self.assertEqual(self.sim.mutations().count(("delete", role)), 1)
        self.only_original()

    def test_delete_timeout_after_completion_uses_verified_readback(self):
        self.sim.delete_reply_lost = True
        verdict = self.probe()
        self.assertEqual(verdict["disposition"], "deleted-and-verified")
        for role in (HOST, GUEST):
            self.assertEqual(self.sim.mutations().count(("delete", role)), 1)
        self.only_original()

    def test_post_shutdown_identity_drift_prevents_delete_without_primary_failure(self):
        self.sim.shutdown_drift = True
        d = subject.Diagnostic()
        with self.assertRaises(subject.CleanupError):
            subject.preflight(self.tmp, MARK, 4*subject.GIB, subject.BOOT_SHARED_SECONDS, False, d)
        self.assertTrue(d.dual_boot_verified)
        self.assertIsNone(d.primary)
        self.assertIn(("shutdown", GUEST), self.sim.mutations())
        self.assertNotIn(("delete", GUEST), self.sim.mutations())
        self.assertIn(("delete", HOST), self.sim.mutations())
        self.assertEqual(d.cleanup_failures,[{"stage":"cleanup-shutdown-readback","role":"guest","code":"IDENTITY_DRIFT"}])

    def test_boot_timeout_and_owned_cleanup_timeout_preserve_both_causes(self):
        self.sim.failure = "boot-timeout"
        self.sim.host_never_shuts = True
        d = subject.Diagnostic()
        with self.assertRaisesRegex(subject.GateError, "guest.*deadline"):
            subject.preflight(self.tmp, MARK, 4*subject.GIB, subject.BOOT_SHARED_SECONDS, False, d)
        self.assertFalse(d.dual_boot_verified)
        self.assertFalse(d.cleanup_verified)
        self.assertEqual(d.primary,{"stage":"guest-boot-command","role":"guest","code":"COMMAND_TIMEOUT"})
        self.assertEqual(d.cleanup_failures,[{"stage":"cleanup-shutdown-readback",
            "role":"host","code":"COMMAND_TIMEOUT","commandFailure":"COMMAND_TIMEOUT"}])
        self.assertIn(("delete", GUEST), self.sim.mutations())
        self.assertNotIn(("delete", HOST), self.sim.mutations())
        self.assertEqual(self.sim.devices[EXISTING],self.sim.original)

    def test_host_block_never_requests_guest_boot(self):
        for failure, phase, code in (("host-timeout", "host-boot-command", "COMMAND_TIMEOUT"),
                                     ("host-false-ready", "host-stability-first", "HOST_NOT_STABLY_BOOTED"),
                                     ("host-loses-state-on-confirm", "host-stability-confirm", "HOST_NOT_STABLY_BOOTED")):
            with self.subTest(failure=failure):
                self.sim.calls.clear()
                self.sim.failure = failure
                d = subject.Diagnostic()
                with self.assertRaises(subject.GateError):
                    subject.preflight(self.tmp, MARK, 4*subject.GIB, subject.BOOT_SHARED_SECONDS, False, d)
                self.assertEqual(d.primary, {"stage":phase, "role":"host", "code":code})
                self.assertEqual([uid for op, uid in self.sim.mutations() if op == "bootstatus"], [HOST])
                self.assertFalse(d.host_stable_before_guest)
                self.assertFalse(d.guest_boot_requested)
                self.only_original()

    def test_separate_boots_never_satisfy_one_joint_snapshot(self):
        self.sim.failure = "host-regresses-during-guest"
        d = subject.Diagnostic()
        with self.assertRaises(subject.GateError):
            subject.preflight(self.tmp, MARK, 4*subject.GIB, subject.BOOT_SHARED_SECONDS, False, d)
        self.assertTrue(d.host_stable_before_guest)
        self.assertTrue(d.guest_boot_command_completed)
        self.assertFalse(d.dual_boot_verified)
        self.assertEqual(d.primary, {"stage":"joint-booted-snapshot","code":"POSTBOOT_NOT_BOOTED","role":"host"})
        self.only_original()

    def test_joint_inventory_timeout_typed_even_after_both_commands_succeeded(self):
        self.sim.failure = "joint-timeout"
        d = subject.Diagnostic()
        with self.assertRaises(subject.GateError):
            subject.preflight(self.tmp, MARK, 4*subject.GIB, subject.BOOT_SHARED_SECONDS, False, d)
        self.assertEqual(d.fields()["bootReadbacks"], {"hostBootCommandCompleted":True,
            "hostStableBeforeGuest":True, "guestBootRequested":True, "guestBootCommandCompleted":True})
        self.assertFalse(d.dual_boot_verified)
        self.assertEqual(d.primary, {"stage":"joint-booted-snapshot","code":"COMMAND_TIMEOUT"})
        self.only_original()

    def test_shared_deadline_exhausted_before_any_boot_command(self):
        with patch.object(subject, "JOINT_READ_SECONDS", subject.BOOT_SHARED_SECONDS):
            d = subject.Diagnostic()
            with self.assertRaises(subject.GateError):
                subject.preflight(self.tmp, MARK, 4*subject.GIB, subject.BOOT_SHARED_SECONDS, False, d)
        self.assertEqual(d.primary,{"stage":"host-boot-command","code":"BOOT_DEADLINE","role":"host"})
        self.assertFalse(any(op == "bootstatus" for op, _ in self.sim.mutations()))
        self.only_original()

    def test_catalog_has_one_read_per_stage_with_small_shared_budget(self):
        d = subject.Diagnostic()
        ticks=iter([100,100.01,105,111,112,118,119,139])
        with patch.object(subject.time, "monotonic", side_effect=lambda:next(ticks)):
            subject.validate_catalog(d)
        calls=self.sim.calls
        self.assertEqual([c for c,_ in calls], [["xcodebuild","-version"],["simctl","list","-j","runtimes"],
            ["simctl","list","-j","devicetypes"],["simctl","list","-j","devices","26.4"]])
        self.assertTrue(all(0 < budget <= cap for (_,budget),cap in zip(calls,(12,22,12,15))))
        self.assertEqual(d.stage,"catalog-ownership-scope")
        self.assertTrue(d.catalog_verified)
        self.assertEqual(d.fields()["catalogDeviceInventory"], "exact-nonempty")
        self.assertEqual(self.sim.mutations(), [])

    def test_catalog_timeout_has_exact_operation_stage_and_no_device_mutation(self):
        catalog=[
            (["xcodebuild","-version"],"catalog-xcode"),
            (["simctl","list","-j","runtimes"],"catalog-runtime"),
            (["simctl","list","-j","devicetypes"],"catalog-device-type"),
            (["simctl","list","-j","devices","26.4"],"catalog-runtime-devices")]
        for index,(argv,stage) in enumerate(catalog):
            with self.subTest(stage=stage):
                self.sim.calls.clear()
                d = subject.Diagnostic()
                def invoke(request, **kw):
                    if request[1:]==argv:
                        self.sim.calls.append((request[1:],kw["timeout"]))
                        raise subprocess.TimeoutExpired(request, kw["timeout"], stderr=b"private device or path")
                    return self.sim.run(request, **kw)
                with patch.object(subject.subprocess,"run",side_effect=invoke):
                    with self.assertRaises(subject.GateError):
                        subject.preflight(self.tmp,MARK,4*subject.GIB,180,False,d)
                self.assertEqual(d.primary, {"stage":stage,"code":"COMMAND_TIMEOUT"})
                self.assertFalse(d.cleanup_attempted)
                self.assertEqual([cmd for cmd,_ in self.sim.calls],[pair[0] for pair in catalog[:index+1]])

    def test_no_second_read_when_xcode_consumed_catalog_deadline(self):
        d = subject.Diagnostic()
        with patch.object(subject.time, "monotonic", side_effect=[100,100,145.01]):
            with self.assertRaises(subject.GateError) as failure:subject.validate_catalog(d)
        self.assertEqual(failure.exception.code,"CATALOG_DEADLINE")
        self.assertEqual(d.stage,"catalog-runtime")
        self.assertEqual([cmd for cmd,_ in self.sim.calls],[["xcodebuild","-version"]])

    def test_simctl_short_selector_retains_exact_runtime_validation(self):
        def selection(*args, **kw):
            self.assertEqual(args, ("simctl", "list", "-j", "devices", "26.4"))
            self.assertEqual(kw, {"timeout": 7})
            return json.dumps({"devices": {subject.RUNTIME: [row(EXISTING, "Private fixture name")]}})
        with patch.object(subject, "command", side_effect=selection):
            self.assertEqual(subject.inventory(timeout=7)[1][0][1]["udid"], EXISTING)

    def test_exact_empty_runtime_is_distinguished_in_catalog_without_claiming_boot(self):
        d = subject.Diagnostic()
        self.sim.devices.clear()
        baseline, _ = subject.validate_catalog(d)
        self.assertEqual(baseline, {})
        self.assertEqual(d.fields()["catalogDeviceInventory"], "exact-empty")
        self.assertFalse(d.dual_boot_verified)
        self.assertFalse(d.cleanup_attempted)
        self.assertEqual(self.sim.mutations(), [])

    def test_broad_or_ambiguous_device_scope_is_rejected_with_sanitized_codes(self):
        cases = (
            ({"devices": {}}, "RUNTIME_INVENTORY_KEY_ABSENT"),
            ({"devices": {"private.runtime": [row(EXISTING, "private device")]}}, "RUNTIME_INVENTORY_KEY_ABSENT"),
            ({"devices": {subject.RUNTIME: [], "private.runtime": []}}, "RUNTIME_INVENTORY_ADDITIONAL_KEYS"),
            ({"devices": {subject.RUNTIME: [row(HOST, "x"), row(HOST, "y")]}}, "INVENTORY_INVALID"),
            ({"devices": {subject.RUNTIME: []}, "runtimes": []}, "INVENTORY_INVALID"),
        )
        for doc, code in cases:
            with self.subTest(code=code), patch.object(subject, "command", return_value=json.dumps(doc)):
                with self.assertRaises(subject.GateError) as failure:
                    subject.inventory()
                redacted = subject.reason(failure.exception, "catalog-runtime-devices")
                self.assertEqual(redacted, {"stage": "catalog-runtime-devices", "code": code})

    def test_unknown_scoped_device_blocks_before_guest_mutation(self):
        d=subject.Diagnostic()
        original=self.sim.run
        def insert_before_read(argv, **kw):
            if argv[1:3]==["simctl","bootstatus"] and argv[3]==HOST:
                self.sim.devices[FOREIGN]=row(FOREIGN,"New unowned","Shutdown")
            return original(argv,**kw)
        with patch.object(subject.subprocess,"run",side_effect=insert_before_read):
            with self.assertRaises(subject.GateError):
                subject.preflight(self.tmp,MARK,4*subject.GIB,subject.BOOT_SHARED_SECONDS,False,d)
        self.assertEqual(d.primary,{"stage":"host-stability-first","role":"host","code":"UNKNOWN_DEVICE_IN_SCOPE"})
        self.assertFalse(d.guest_boot_requested)
        self.assertFalse(any(uid==FOREIGN for _,uid in self.sim.mutations()))

    def test_absence_of_still_present_uid_never_mutates_or_successfully_cleans(self):
        d=subject.Diagnostic()
        original=self.sim.run
        def drift(argv, **kw):
            response=original(argv,**kw)
            if argv[1:3]==["simctl","bootstatus"] and argv[3]==GUEST:
                del self.sim.devices[HOST]
                (subject.device_home()/HOST).mkdir(parents=True)
            return response
        with patch.object(subject.subprocess,"run",side_effect=drift):
            with self.assertRaises(subject.GateError):
                subject.preflight(self.tmp,MARK,4*subject.GIB,subject.BOOT_SHARED_SECONDS,False,d)
        self.assertFalse(d.dual_boot_verified)
        self.assertFalse(d.cleanup_verified)
        self.assertEqual(d.cleanup_failures,[{"stage":"cleanup-identify","role":"host","code":"IDENTITY_DRIFT"}])
        self.assertNotIn(("shutdown",HOST),self.sim.mutations())
        self.assertNotIn(("delete",HOST),self.sim.mutations())

    def test_intel_context_requires_real_machine_and_hosted_x64_markers(self):
        flags={"GITHUB_ACTIONS":"true","RUNNER_OS":"macOS","RUNNER_ARCH":"X64",
            "RUNNER_ENVIRONMENT":"github-hosted","GITHUB_REPOSITORY":"augsmog/QuickScore","GITHUB_RUN_ID":"1",
            "GITHUB_RUN_ATTEMPT":"1","GITHUB_JOB":"dual_boot","RUNNER_NAME":"fake","RUNNER_TEMP":str(self.tmp)}
        for machine, override in (("x86_64",{}),("arm64",{}),("x86_64",{"RUNNER_ARCH":"ARM64"}),
            ("x86_64",{"RUNNER_ENVIRONMENT":"self-hosted"})):
            with self.subTest(machine=machine,override=override), patch.object(subject.platform,"system",return_value="Darwin"), \
                 patch.object(subject.platform,"machine",return_value=machine), patch.dict(os.environ,flags|override,clear=True):
                if machine=="x86_64" and not override:
                    self.assertEqual(subject.job_context()[0],self.tmp)
                else:
                    with self.assertRaisesRegex(subject.GateError,"no simulator commands ran"):subject.job_context()
        self.assertEqual(self.sim.calls,[])

    def test_incomplete_runtime_device_catalog_is_not_admitted(self):
        doc={"runtimes":[{"identifier":subject.RUNTIME, "version":subject.RUNTIME_VERSION,
             "buildversion":subject.RUNTIME_BUILD,"isAvailable":True}],"devicetypes":[{"identifier":subject.DEVICE}]}
        d=subject.Diagnostic()
        with patch.object(subject,"catalog_records",side_effect=lambda name,_:doc[name]):
            with self.assertRaisesRegex(subject.GateError, "exact support"):
                subject.preflight(self.tmp, MARK, 4*subject.GIB, subject.BOOT_SHARED_SECONDS, False,d)
        self.assertFalse(d.catalog_verified)
        self.assertEqual(d.primary,{"stage":"catalog-validation","code":"RUNTIME_DEVICE_UNSUPPORTED"})
        self.assertEqual(self.sim.mutations(),[])

    def test_host_gate_refuses_non_darwin_with_zero_simctl(self):
        with patch.object(subject.platform, "system", return_value="Linux"):
            with self.assertRaisesRegex(subject.GateError, "no simulator commands ran"):
                subject.job_context()
        self.assertEqual(self.sim.calls, [])


if __name__ == "__main__":
    unittest.main()
