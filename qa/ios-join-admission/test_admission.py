import unittest
from unittest.mock import patch
import admission as a

U="AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
V="BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB"
X="CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC"
def row(uid,name,state="Booted"):
    return (a.RUNTIME,dict(udid=uid,name=name,state=state,deviceTypeIdentifier=a.DEVICE))

class Guards(unittest.TestCase):
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
