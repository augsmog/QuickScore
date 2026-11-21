import unittest,json,tempfile,pathlib,os,io
from unittest.mock import patch
import intake
class RuntimeSelection(unittest.TestCase):
 def row(self,**kw):return dict(identifier=intake.RUNTIME_ID,version='26.4',isAvailable=True,**kw)
 def select(self,rows):return intake.select_runtime({'runtimes':rows})
 def test_exact_canonical(self):
  for version in ['26.4','26.4.0']:
   row=self.row();row['version']=version
   result=self.select([row]);self.assertEqual(result['selected'],intake.RUNTIME_ID);self.assertEqual(result['reason'],'SELECTED');self.assertEqual(result['iosRuntimes'][0]['version'],version)
 def test_empty(self):self.assertEqual(self.select([])['reason'],'IOS_26_4_RUNTIME_MISSING')
 def test_unavailable(self):
  row=self.row();row['isAvailable']=False
  self.assertEqual(self.select([row])['reason'],'IOS_26_4_RUNTIME_UNAVAILABLE')
 def test_multiple(self):
  for second in [self.row(),{**self.row(),'isAvailable':False},{**self.row(),'identifier':intake.RUNTIME_ID+'-0'}]:
   r=self.select([self.row(),second]);self.assertIsNone(r['selected']);self.assertEqual(r['reason'],'IOS_26_4_RUNTIME_AMBIGUOUS')
 def test_identity_mismatch(self):
  for row in [{**self.row(),'version':'26.4.1'},{**self.row(),'version':'26.3'},{**self.row(),'identifier':intake.RUNTIME_ID+'-0'}]:
   self.assertEqual(self.select([row])['reason'],'IOS_26_4_IDENTITY_MISMATCH')
 def test_typed_bounded_private_fields(self):
  row=self.row(name='private-name',bundlePath='/private/path',availabilityError='private-error')
  other={'identifier':'com.apple.CoreSimulator.SimRuntime.tvOS-26-4','version':'26.4','isAvailable':True,'name':'private-other'}
  r=self.select([other,row]);self.assertEqual(r['iosRuntimes'],[{'identifier':intake.RUNTIME_ID,'version':'26.4','isAvailable':True}]);self.assertNotIn('private',json.dumps(r))
  for value in ['private-path',None,True,26.4,'26.4'*100]:
   r=self.select([{**row,'version':value}]);self.assertIsNone(r['selected']);self.assertNotIn('private',json.dumps(r))
  for value in ['true',1,None]:self.assertIsNone(self.select([{**row,'isAvailable':value}])['selected'])
  for rows in [[row]*33,[other]*129]:self.assertEqual(self.select(rows)['reason'],'IOS_RUNTIME_INVENTORY_LIMIT')
 def test_bad_shape_and_other_runtime(self):
  for raw in [None,[],{}, {'runtimes':None},{'runtimes':[None]}]:self.assertEqual(intake.select_runtime(raw)['reason'],'IOS_RUNTIME_INVENTORY_INVALID')
  r=self.select([{**self.row(),'identifier':'com.apple.CoreSimulator.SimRuntime.iOS-26-3','version':'26.3'}]);self.assertEqual(r['reason'],'IOS_26_4_RUNTIME_MISSING')
 def test_failed_selection_stops_before_create_and_sanitizes_status(self):
  env={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'self-hosted','RUNNER_OS':'macOS','GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_WORKFLOW':'device-layout-gate','GITHUB_REF':intake.BRANCH}
  for raw in ['not-json',json.dumps({'runtimes':[]}),json.dumps({'runtimes':[{**self.row(),'isAvailable':False,'name':'private-name'}]})]:
   calls=[]
   def output(args,**kw):
    calls.append(args)
    if args==['xcodebuild','-version']:return b'Xcode 26.4.1\nBuild version synthetic'
    if args==['xcrun','simctl','list','runtimes','--json']:return raw.encode()
    raise AssertionError('Unexpected command')
   with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{**env,'DEVICE_LAYOUT_OUT':d},clear=True),patch.object(intake.shutil,'which',return_value='/synthetic/tool'),patch.object(intake.subprocess,'check_output',side_effect=output),patch('sys.stdout',new_callable=io.StringIO) as stdout:
    self.assertEqual(intake.main(),78)
    state=json.loads((pathlib.Path(d)/'iphone-smoke-supplemental/status.json').read_text());self.assertFalse(state['aggregatePass']);self.assertEqual(state['captures'],0);self.assertIsNone(state['runtimeSelection']['selected']);self.assertNotIn('private-name',stdout.getvalue());self.assertEqual(len(calls),2)
