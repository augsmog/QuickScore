import unittest,os,json,pathlib,hashlib,tempfile,subprocess
from intake import guard,sanitize,BRANCH
from run import SHA,TREE
class Intake(unittest.TestCase):
 def env(self):return dict(GITHUB_ACTIONS='true',RUNNER_ENVIRONMENT='self-hosted',RUNNER_OS='macOS',GITHUB_REPOSITORY='augsmog/QuickScore',GITHUB_EVENT_NAME='workflow_dispatch',GITHUB_WORKFLOW='device-layout-gate',GITHUB_REF=BRANCH)
 def test_trusted_manual(self):guard(self.env())
 def test_no_external_pr_or_wrong_ref(self):
  for k,v in [('GITHUB_EVENT_NAME','pull_request'),('GITHUB_EVENT_NAME','push'),('GITHUB_REF','refs/heads/main'),('GITHUB_REPOSITORY','fork/other'),('RUNNER_OS','Linux'),('GITHUB_ACTIONS','false')]:
   with self.assertRaises(ValueError):guard({**self.env(),k:v})
 def receipt(self,b):return dict(sourceSha=SHA,sourceTree=TREE,categoryBefore='large',categoryAfter='large',runtimeRNScale=None,scene='home',nativeAcceptance=False,geometryPassed=False,pngSha256=hashlib.sha256(b).hexdigest(),buildSha256='a'*64,privatePath='/synthetic/private',environment={'secret':'synthetic-never-export'},binaryUUIDs='path and UUID',device={'extra':'do-not-export'})
 def test_allowlist_drops_all_extra_data(self):
  b=b'\x89PNG\r\n\x1a\n';r=sanitize(self.receipt(b),b);serialized=json.dumps(r)
  for forbidden in ['privatePath','environment','secret','binaryUUIDs','do-not-export']:self.assertNotIn(forbidden,serialized)
  self.assertFalse(r['aggregatePass'])
 def test_bad_receipt(self):
  b=b'\x89PNG\r\n\x1a\n'
  for change in [dict(sourceSha='580b'),dict(runtimeRNScale=1.0),dict(categoryAfter='extra-extra-large'),dict(nativeAcceptance=True),dict(pngSha256='bad')]:
   with self.assertRaises(ValueError):sanitize({**self.receipt(b),**change},b)
 def test_actual_entry_no_native_calls_outside_intake(self):
  root=pathlib.Path(__file__).resolve().parents[2]
  with tempfile.TemporaryDirectory() as d:
   env={'PATH':os.environ['PATH'],'DEVICE_LAYOUT_OUT':d}
   r=subprocess.run(['bash',str(root/'scoresnap/e2e/device-layout/scripts/run-ios-sim.sh')],env=env,capture_output=True)
   self.assertEqual(r.returncode,78);self.assertEqual(list(pathlib.Path(d).iterdir()),[])
