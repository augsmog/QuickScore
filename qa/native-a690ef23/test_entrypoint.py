import unittest,importlib.util,pathlib,subprocess,tempfile,os,json
p=pathlib.Path(__file__).parent
s=importlib.util.spec_from_file_location('adapter',p/'entrypoint.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Controls(unittest.TestCase):
 def manual(self):return dict(GITHUB_ACTIONS='true',GITHUB_EVENT_NAME='workflow_dispatch',GITHUB_REPOSITORY='augsmog/QuickScore',GITHUB_WORKFLOW='device-layout-gate',GITHUB_REF=m.BRANCH)
 def test_manual_ref_guard(self):
  m.guard(self.manual())
  for k,v in [('GITHUB_ACTIONS','false'),('GITHUB_EVENT_NAME','push'),('GITHUB_EVENT_NAME','pull_request'),('GITHUB_REPOSITORY','fork/QuickScore'),('GITHUB_WORKFLOW','other'),('GITHUB_REF','refs/heads/qa/snapscore-580b437-android-smoke')]:
   with self.assertRaises(ValueError):m.guard({**self.manual(),k:v})
 def test_guard_before_side_effects(self):
  with tempfile.TemporaryDirectory() as d:
   r=subprocess.run(['python3','-B',str(p/'entrypoint.py'),'android'],env={'PATH':os.environ['PATH'],'DEVICE_LAYOUT_OUT':d},capture_output=True)
   self.assertEqual(r.returncode,78);self.assertEqual(list(pathlib.Path(d).iterdir()),[])
 def test_source_bindings(self):
  spec=importlib.util.spec_from_file_location('sourcecheck',p/'check-source.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
  good=[v.base,v.tree,['qa/native-a690ef23/entrypoint.py'],'','https://github.com/augsmog/QuickScore.git',str(m.ROOT)]
  v.validate(*good)
  for index,bad in [(0,'580b437'),(1,'0'*40),(2,['scoresnap/app.json']),(2,['.github/workflows/device-layout-gate.yml']),(3,'dirty'),(4,'https://github.com/fork/QuickScore.git'),(5,'/tmp/wrong-checkout')]:
   args=good.copy();args[index]=bad
   with self.assertRaises(ValueError):v.validate(*args)

 def test_success_is_incomplete(self):
  r,code=m.conclude('android',True);self.assertEqual(code,78);self.assertFalse(r['aggregatePass']);self.assertIn('native-two-client-Join',r['missing'])
 def test_failure_no_pass(self):
  for platform in ['android','ios']:
   r,code=m.conclude(platform,False,'missing input');self.assertNotEqual(code,0);self.assertFalse(r['smokePassed'])
 def test_actual_ios_entrypoint(self):
  with tempfile.TemporaryDirectory() as d:
   env={**os.environ,**self.manual(),'DEVICE_LAYOUT_OUT':d}
   r=subprocess.run(['python3',str(p/'entrypoint.py'),'ios'],env=env,capture_output=True)
   self.assertEqual(r.returncode,78)
   receipt=json.loads((pathlib.Path(d)/'ios-adapter-status.json').read_text());self.assertFalse(receipt['aggregatePass']);self.assertFalse(receipt['smokePassed']);self.assertFalse(list(pathlib.Path(d).rglob('*.png')))
 def test_actual_android_missing_config(self):
  with tempfile.TemporaryDirectory() as d:
   env={**os.environ,**self.manual(),'DEVICE_LAYOUT_OUT':d};env.pop('DEVICE_LAYOUT_ANDROID_SMOKE_CONFIG',None)
   r=subprocess.run(['python3',str(p/'entrypoint.py'),'android'],env=env,capture_output=True)
   self.assertEqual(r.returncode,78);self.assertFalse(list(pathlib.Path(d).rglob('bundle.json')))
   receipt=json.loads((pathlib.Path(d)/'android-adapter-status.json').read_text());self.assertFalse(receipt['smokePassed'])
