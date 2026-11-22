import contextlib,io,json,os,pathlib,tempfile,types,unittest
from unittest.mock import patch,Mock
import run as r
class Tests(unittest.TestCase):
 def env(self):return {'GITHUB_SHA':'a'*40,'GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':r.REF,'GITHUB_JOB':'dual_boot','DEVELOPER_DIR':r.probe.XCODE}
 def exercise(self,fail=False,cleanup_fail=False):
  def preflight(tmp,marker,minimum,budget,keep):
   self.assertFalse(keep);self.assertEqual(budget,180);self.assertEqual(minimum,12*(1<<30))
   try:
    if fail:raise r.probe.GateError('private identity should not leak')
    return {'status':'PASS','disposition':'deleted-and-verified','xcode':{},'runtime':{},'device_type':r.probe.DEVICE,'devices':{x:{'udid':'private-id','name':'private-name','boot_wait_s':2.5} for x in ('host','guest')},'free_disk_both_booted':{'runner_temp_free_bytes':100}}
   finally:r.probe.cleanup(None,None)
  with patch.dict(os.environ,self.env(),clear=True),patch.object(r.probe,'job_context',return_value=(pathlib.Path('/synthetic'),'marker')),patch.object(r.subprocess,'run',return_value=types.SimpleNamespace(stdout=b'7516192768\n')),patch.object(r.probe,'command',side_effect=['26.4','23E240']),patch.object(r.probe,'free_space',return_value={'runner_temp_free_bytes':100}),patch.object(r.probe,'preflight',side_effect=preflight),patch.object(r.probe,'cleanup',side_effect=r.probe.GateError('private path') if cleanup_fail else None):return r.run()
 def test_success_redacted_cleanup_required(self):
  result=self.exercise();self.assertEqual(result['status'],'PASS');self.assertTrue(result['cleanupVerified']);self.assertEqual(result['simulatorSdk']['version'],'26.4');self.assertNotIn('private',json.dumps(result));self.assertIsNone(result['buildBudgetPass'])
 def test_primary_or_cleanup_failure_stays_redacted_red(self):
  for a,b in ((True,False),(False,True)):
   result=self.exercise(a,b);self.assertEqual(result['status'],'BLOCKED');self.assertNotIn('private',json.dumps(result))
 def test_wrong_ref_no_command(self):
  with patch.dict(os.environ,self.env()|{'GITHUB_REF':'refs/heads/main'},clear=True),patch.object(r.probe,'job_context') as context:
   with self.assertRaises(r.probe.GateError):r.run()
   context.assert_not_called()
 def test_large_catalog_unique_exact_type(self):
  doc={'runtimes':[{'identifier':r.probe.RUNTIME,'isAvailable':True,'version':r.probe.RUNTIME_VERSION,'buildversion':r.probe.RUNTIME_BUILD}],'devicetypes':[{'identifier':'unrelated-'+str(i)} for i in range(250)]+[{'identifier':r.probe.DEVICE}]}
  with patch.object(r.probe,'command',return_value='\n'.join(r.probe.XCODE_ID)),patch.object(r.probe,'inventory',return_value=(doc,[])):
   self.assertEqual(r.probe.validate_catalog(),[])
   doc['devicetypes'].append({'identifier':r.probe.DEVICE})
   with self.assertRaises(r.probe.GateError):r.probe.validate_catalog()
 def test_workflow_scope(self):
  text=(pathlib.Path(__file__).parents[2]/'.github/workflows/e2e-ios-sim.yml').read_text();self.assertIn(r.REF,text);self.assertIn(r.probe.XCODE,text)
  for forbidden in ('pull_request:','push:','upload-artifact','secrets.','npm ','brew ','sudo ','self-hosted'):
   self.assertNotIn(forbidden,text)
if __name__=='__main__':unittest.main()
