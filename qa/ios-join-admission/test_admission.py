import json
import tempfile
import unittest
from unittest.mock import patch
from contextlib import ExitStack
import admission as a

U="AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
V="BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB"
X="CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC"
def row(uid,name,state="Booted"):
    return (a.RUNTIME,dict(udid=uid,name=name,state=state,deviceTypeIdentifier=a.DEVICE))

class Guards(unittest.TestCase):
    def test_all_darwin_arm64_pins_required(self):
        lock=a.pathlib.Path(__file__).with_name("supabase.lock").read_bytes()
        a.lock_platform_pins(lock)
        for service in a.LOCK_SERVICES:
            for changed in ("archive","manifest"):
                d=json.loads(lock)
                d["services"][service]["resolved"]["natives"]["darwin-arm64"][changed]="0"*63
                with self.assertRaisesRegex(a.Blocked,"LOCK_PLATFORM_PINS"):
                    a.lock_platform_pins(json.dumps(d).encode())
        d=json.loads(lock); del d["services"]["auth"]
        with self.assertRaisesRegex(a.Blocked,"LOCK_PLATFORM_PINS"):
            a.lock_platform_pins(json.dumps(d).encode())

    def test_frozen_copy_readback_requires_exact_bytes_and_regular_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=a.pathlib.Path(tmp)/"supabase.lock"
            p.write_bytes(b"pin\n")
            a.unchanged_lock(p,b"pin\n")
            with self.assertRaisesRegex(a.Blocked,"LOCK_CHANGED_AFTER_FROZEN_START"):
                a.unchanged_lock(p,b"nop\n")
            q=p.with_name("symlink"); q.symlink_to(p)
            with self.assertRaisesRegex(a.Blocked,"LOCK_CHANGED_AFTER_FROZEN_START"):
                a.unchanged_lock(q,b"pin\n")

    def test_exact_stock_empty_list_shape_and_nonempty_refusal(self):
        self.assertTrue(a.empty_stack_list({"stacks":[],"message":""}))
        self.assertTrue(a.empty_stack_list({"stacks":[]}))
        for value in ([], {"stacks":[{"id":"synthetic"}],"message":""},
                      {"stacks":[],"message":"failed"}, {"stacks":[],"other":False}):
            self.assertFalse(a.empty_stack_list(value))

    def test_inventory_timeout_reports_phase_and_cleanup_bounded_retry(self):
        t={}
        with patch.object(a,"inventory",side_effect=[a.Blocked("SIM_INVENTORY_TIMEOUT"),{}]) as c:
            self.assertEqual(a.probe(t,"verify-identity",a.cleanup_inventory,{}),{})
            self.assertEqual([o.kwargs for o in c.call_args_list],[{"seconds":12}]*2)
        self.assertEqual(t["lastStep"],"verify-identity")
        self.assertIn("verify-identity",t["stepSeconds"])
        with patch.object(a,"inventory",side_effect=a.Blocked("SIM_INVENTORY_TIMEOUT")) as c:
            with self.assertRaisesRegex(a.Blocked,"SIM_INVENTORY_TIMEOUT"):
                a.cleanup_inventory({})
            self.assertEqual(c.call_count,2)

    def test_cleanup_never_mutates_on_unknown_identity(self):
        with patch.object(a,"cleanup_inventory",return_value={U:row(U,"different")}), patch.object(a,"sim") as sim:
            with self.assertRaisesRegex(a.Blocked,"SIM_OWNERSHIP"):
                a.clean_sim({},a.pathlib.Path("/"),U,"ours",{})
            sim.assert_not_called()

    def test_primary_sim_failure_blocks_any_backend_preparation(self):
        m=json.loads(a.pathlib.Path(__file__).with_name("handoff-manifest.json").read_bytes())
        with tempfile.TemporaryDirectory() as t, ExitStack() as st:
            root=a.pathlib.Path(t); product=root/"app"; scratch=root/"runner-temp"; harness=root/"qa"
            scratch.mkdir(); harness.mkdir()
            digests={"handoff-manifest.json":a.MANIFEST}
            for item in m["sqlOrdered"]:
                p=product/item["path"]; p.parent.mkdir(parents=True,exist_ok=True); p.write_text("fixture")
                digests[p.name]=item["sha256"]
            st.enter_context(patch.object(a,"digest",side_effect=lambda p:digests[p.name]))
            st.enter_context(patch.object(a,"bind",return_value=("a"*40,"b"*40)))
            st.enter_context(patch.object(a.platform,"system",return_value="Darwin"))
            st.enter_context(patch.object(a.platform,"machine",return_value="arm64"))
            st.enter_context(patch.object(a.shutil,"disk_usage",return_value=type("Disk",(),{"free":3*a.BUILD_BUDGET})()))
            st.enter_context(patch.object(a,"listener_rows",return_value=set()))
            cmd=st.enter_context(patch.object(a,"cmd",return_value="23E252"))
            cat=dict(runtimes=[dict(identifier=a.RUNTIME,version="26.4.1",buildversion="23E254a",isAvailable=True,
                                    supportedDeviceTypes=[dict(identifier=a.DEVICE)])])
            sim=st.enter_context(patch.object(a,"sim",return_value=json.dumps(cat)))
            st.enter_context(patch.object(a,"inventory",side_effect=[{},a.Blocked("SIM_INVENTORY_TIMEOUT")]))
            env=dict(GITHUB_REPOSITORY="augsmog/QuickScore",GITHUB_EVENT_NAME="workflow_dispatch",
                     GITHUB_REF=a.REF,RUNNER_ENVIRONMENT="github-hosted",RUNNER_OS="macOS",RUNNER_ARCH="ARM64",
                     RUNNER_TEMP=str(scratch))
            result=a.admit(harness,product,env)
            self.assertEqual(result["lastStep"],"pre-create-inventory")
            self.assertEqual(result["reason"],"SIM_INVENTORY_TIMEOUT")
            self.assertFalse(result["backendVerified"]); self.assertFalse(result["cohabitationVerified"])
            self.assertTrue(result["cleanupVerified"]); self.assertEqual(list(scratch.iterdir()),[])
            self.assertEqual(cmd.call_count,1); self.assertEqual(sim.call_count,1)

    def test_listener_inventory_darwin_file_records(self):
        with patch.object(a,"cmd",return_value="p52\nf9\nn127.0.0.1:54321\nf10\nn*:54010"):
            self.assertEqual(a.listener_rows({}),{(52,"127.0.0.1:54321"),(52,"*:54010")})

    def test_backend_ignores_existing_unrelated_and_rejects_new_wildcard(self):
        orig={(2,"*:8000")}
        local={(3,"127.0.0.1:54321"),(4,"127.0.0.1:54322")}
        self.assertEqual(a.backend_sockets(orig|local,orig),local)
        with self.assertRaisesRegex(a.Blocked,"BACKEND_NON_LOOPBACK"):
            a.backend_sockets(orig|local|{(1,"*:1234")},orig)
        with self.assertRaisesRegex(a.Blocked,"BACKEND_ENDPOINT_OWNERSHIP"):
            a.backend_sockets({(3,"127.0.0.1:54321")},orig)

    def test_endpoint_refuses_remote_tls_redirect_host_or_wrong_runtime(self):
        ok=dict(runtime="native",env=dict(API_URL="http://127.0.0.1:54321",ANON_KEY="a",SERVICE_ROLE_KEY="b"),
                endpoints={"db":{"address":"127.0.0.1"}})
        a.endpoint_check(ok)
        for override in ({"runtime":"docker"}, {"endpoints":{"db":{"address":"0.0.0.0"}}},
                         {"env":{"API_URL":"https://127.0.0.1:54321"}}):
            with self.assertRaises(a.Blocked): a.endpoint_check({**ok,**override})

    def test_two_distinct_booted_owned_and_no_unowned_active(self):
        rows={U:row(U,"host"),V:row(V,"guest")}
        a.verify_pair(rows,{U:"host",V:"guest"},"Booted")
        for bad in ({**rows,X:row(X,"another")},{**rows,X:row(X,"guest","Shutdown")},{**rows,V:row(V,"guest","Shutdown")}):
            with self.assertRaises(a.Blocked): a.verify_pair(bad,{U:"host",V:"guest"},"Booted")

    def test_off_host_no_mutation(self):
        with patch.object(a,"cmd") as command:
            result=a.admit(a.pathlib.Path("/"),a.pathlib.Path("/"),{})
        command.assert_not_called()
        self.assertEqual(result["reason"],"HOST_SCOPE")
        self.assertFalse(result["joinAccepted"])
