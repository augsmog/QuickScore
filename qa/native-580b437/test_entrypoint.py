import unittest,importlib.util,pathlib,subprocess,tempfile,os,json
p=pathlib.Path(__file__).parent
s=importlib.util.spec_from_file_location('adapter',p/'entrypoint.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Controls(unittest.TestCase):
 def test_success_is_incomplete(self):
  r,code=m.conclude('android',True);self.assertEqual(code,78);self.assertFalse(r['aggregatePass']);self.assertIn('native-two-client-Join',r['missing'])
 def test_failure_no_pass(self):
  for platform in ['android','ios']:
   r,code=m.conclude(platform,False,'missing input');self.assertNotEqual(code,0);self.assertFalse(r['smokePassed'])
 def test_actual_ios_entrypoint(self):
  with tempfile.TemporaryDirectory() as d:
   env={**os.environ,'DEVICE_LAYOUT_OUT':d}
   r=subprocess.run(['bash',str(m.ROOT/'scoresnap/e2e/device-layout/scripts/run-ios-sim.sh')],env=env,capture_output=True)
   self.assertEqual(r.returncode,78)
   receipt=json.loads((pathlib.Path(d)/'ios-adapter-status.json').read_text());self.assertFalse(receipt['aggregatePass']);self.assertFalse(receipt['smokePassed']);self.assertFalse(list(pathlib.Path(d).rglob('*.png')))
 def test_actual_android_missing_config(self):
  with tempfile.TemporaryDirectory() as d:
   env={**os.environ,'DEVICE_LAYOUT_OUT':d};env.pop('DEVICE_LAYOUT_ANDROID_SMOKE_CONFIG',None)
   r=subprocess.run(['bash',str(m.ROOT/'scoresnap/e2e/device-layout/scripts/run-android-compact.sh')],env=env,capture_output=True)
   self.assertEqual(r.returncode,78);self.assertFalse(list(pathlib.Path(d).rglob('bundle.json')))
   receipt=json.loads((pathlib.Path(d)/'android-adapter-status.json').read_text());self.assertFalse(receipt['smokePassed'])
