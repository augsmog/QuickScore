import unittest,tempfile,pathlib,json,base64,os,sys,plistlib
from unittest.mock import patch
import build as b
class Tests(unittest.TestCase):
 def key(self):return 'x.'+base64.urlsafe_b64encode(json.dumps({'role':'anon','iss':'supabase'}).encode()).decode().rstrip('=')+'.x'
 def test_endpoint(self):
  k=self.key();u='http://localhost:54331';r={'kind':'disposable-loopback-stack','relay_url':u,'anon_sha256':b.digest(k.encode()),'no_hosted_credentials':True,'no_external_upstreams':True};b.endpoint(u,k,r)
  for bad in ['http://localhost.evil:54331','http://127.0.0.1:54331',u+'/',u+'?q=x','https://localhost:54331','http://localhost:99999']:
   with self.assertRaises(b.Blocked):b.endpoint(bad,k,r)
  with self.assertRaises(b.Blocked):b.endpoint(u,k,r|{'no_external_upstreams':False})
 def test_wrong_environment(self):
  with patch.object(b.platform,'system',return_value='Linux'):
   with self.assertRaises(b.Blocked):b.host({})
 def test_no_inherited_credentials(self):
  with tempfile.TemporaryDirectory() as d:
   e=b.environment(pathlib.Path(d)/'h','/usr/bin','http://localhost:54331',self.key(),'/Xcode')
   self.assertNotIn('GITHUB_TOKEN',e);self.assertNotIn('AWS_SECRET_ACCESS_KEY',e);self.assertNotEqual(e['NPM_CONFIG_USERCONFIG'],e['NPM_CONFIG_GLOBALCONFIG']);self.assertEqual(e['EXPO_PUBLIC_FEATURE_NATIVE_LINKS'],'false');self.assertEqual(e['EXPO_PUBLIC_OFFLINE_MODE'],'false')
 def test_release_commands(self):
  c=b.commands(pathlib.Path('/scratch/app'),pathlib.Path('/scratch/dd'));self.assertEqual([x[0] for x in c],['npm','prebuild','pods','release']);self.assertIn('CODE_SIGNING_ALLOWED=NO',c[-1][1]);self.assertIn('Release',c[-1][1]);self.assertNotIn('test',c[-1][1]);self.assertEqual([x[3] for x in c],[300,180,300,1200])
 def test_phase_timeout_and_failure(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(b.Blocked,'TIMEOUT'):b.phase([sys.executable,'-c','import time;time.sleep(20)'],d,os.environ,.05,0)
   with self.assertRaisesRegex(b.Blocked,'FAILED'):b.phase([sys.executable,'-c','raise SystemExit(2)'],d,os.environ,5,0)
 def fixture(self,p):
  p.mkdir();(p/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'com.scoresnap.app','CFBundleSupportedPlatforms':['iPhoneSimulator']}));(p/'Expo.plist').write_bytes(plistlib.dumps({'EXUpdatesEnabled':False}));(p/'SnapScore').write_bytes(b'synthetic executable')
 def test_artifact_identity_and_signed_reject(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'app';self.fixture(p);a=b.artifact(p);(p/'SnapScore').write_bytes(b'changed');self.assertNotEqual(a['sha256'],b.artifact(p)['sha256']);(p/'_CodeSignature').mkdir()
   with self.assertRaises(b.Blocked):b.artifact(p)
 def test_final_ota_reject(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'app';self.fixture(p);(p/'Expo.plist').write_bytes(plistlib.dumps({'EXUpdatesEnabled':True}))
   with self.assertRaises(ValueError):b.artifact(p)
 def test_generated_ota_and_ats(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);e=p/'ios/SnapScore/Supporting';e.mkdir(parents=True);(e/'Expo.plist').write_bytes(plistlib.dumps({'EXUpdatesEnabled':True,'EXUpdatesURL':'https://example.invalid'}));i=e.parent/'Info.plist';i.write_bytes(plistlib.dumps({}));b.generated_policy(p);self.assertFalse(plistlib.loads((e/'Expo.plist').read_bytes())['EXUpdatesEnabled']);i.write_bytes(plistlib.dumps({'NSAppTransportSecurity':{'NSAllowsArbitraryLoads':True}}))
   with self.assertRaises(ValueError):b.generated_policy(p)
if __name__=='__main__':unittest.main()

class Pipeline(unittest.TestCase):
 def test_pipeline_runs_policy_before_release_and_records_artifact(self):
  import types
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);repo=root/'repo';repo.mkdir();key=root/'anon';k=Tests().key();key.write_text(k);key.chmod(0o600);r=root/'stack.json';r.write_text(json.dumps({'kind':'disposable-loopback-stack','relay_url':'http://localhost:54331','anon_sha256':b.digest(k.encode()),'no_hosted_credentials':True,'no_external_upstreams':True}))
   args=types.SimpleNamespace(repo=str(repo),out=str(root/'out'),anon_file=str(key),stack_receipt=str(r),relay='http://localhost:54331',developer_dir='/Xcode',minimum_free_bytes=12884901888)
   calls=[]
   def export(repo,dest):
    p=dest/'scoresnap';p.mkdir(parents=True);(p/'package-lock.json').write_bytes(b'lock');(p/'package.json').write_bytes(b'package');return {'omitted':[{'path':b.TEMPLATE_PATH}]}
   def phase(cmd,cwd,env,seconds,floor):
    calls.append(cmd[0]);app=root/'out/source/scoresnap'
    if cmd[0]=='node':
     e=app/'ios/SnapScore/Supporting';e.mkdir(parents=True);(e/'Expo.plist').write_bytes(plistlib.dumps({'EXUpdatesEnabled':True}));(e.parent/'Info.plist').write_bytes(plistlib.dumps({}))
    if cmd[0]=='pod':
     (app/'ios/Pods').mkdir();(app/'ios/Podfile.lock').write_bytes(b'pods');(app/'ios/Pods/Manifest.lock').write_bytes(b'pods')
    if cmd[0]=='xcodebuild':
     self.assertFalse(plistlib.loads((app/'ios/SnapScore/Supporting/Expo.plist').read_bytes())['EXUpdatesEnabled'])
     artifact=root/'out/DerivedData/Build/Products/Release-iphonesimulator/SnapScore.app';artifact.parent.mkdir(parents=True);Tests().fixture(artifact)
   def read(cmd,env=None):
    return {'node':'v22.23.5','npm':'10.9.9','pod':'1.17.0','ruby':'3.4.12','xcodebuild':'Xcode 26.4.1\nBuild version 17E202','xcrun':'26.4' if '--show-sdk-version' in cmd else 'UUID: 11111111-2222-4333-8444-555555555555 (arm64) synthetic'}[cmd[0]]
   with patch.object(b,'host'),patch.object(b,'source',return_value=b.digest(b'lock')),patch.object(b,'export',side_effect=export),patch.object(b,'phase',side_effect=phase),patch.object(b,'read',side_effect=read),patch.object(b.shutil,'disk_usage',return_value=types.SimpleNamespace(free=100000000000)):
    result=b.build(args)
   self.assertEqual(calls,['npm','node','pod','xcodebuild']);self.assertEqual(result['status'],'UNSIGNED_SIMULATOR_RELEASE_BUILT');self.assertFalse(result['nativeAcceptance']);self.assertEqual(result['sourceExport']['omitted'],[{'path':b.TEMPLATE_PATH}]);self.assertNotIn(k,(root/'out/receipt.json').read_text())
