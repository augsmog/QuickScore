import contextlib,io,json,os,pathlib,tempfile,types,unittest
from unittest.mock import patch,Mock
import run as r
class Tests(unittest.TestCase):
 def env(self):return {'GITHUB_SHA':'a'*40,'GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':r.REF,'GITHUB_JOB':'dual_boot','DEVELOPER_DIR':r.probe.XCODE,'SNAPSCORE_DUAL_BOOT_STARTED_NS':str(r.time.monotonic_ns())}
 def exercise(self,fail=False,cleanup_fail=False):
  def preflight(tmp,marker,minimum,budget,keep,d):
   self.assertFalse(keep);self.assertEqual(budget,195);self.assertEqual(minimum,12*(1<<30))
   print('private raw identity');print('private path',file=__import__('sys').stderr)
   primary=r.probe.GateError('private primary identity','COMMAND_TIMEOUT')
   if fail:
    d.at('guest-boot-command','guest');d.record_primary(primary)
   d.dual_boot_verified=not fail
   d.cleanup_attempted=True
   d.cleanup_verified=not cleanup_fail
   if cleanup_fail:
    d.cleanup_failures=[r.probe.reason(r.probe.GateError('private path','SHUTDOWN_NOT_VERIFIED'),
                                       'cleanup-shutdown-readback','host')]
   if fail:raise primary
   if cleanup_fail:raise r.probe.CleanupError('private cleanup path','CLEANUP_FAILED')
   return {'status':'PASS','disposition':'deleted-and-verified','xcode':{},'runtime':{},'device_type':r.probe.DEVICE,'devices':{x:{'udid':'private-id','name':'private-name','boot_wait_s':2.5} for x in ('host','guest')},'free_disk_both_booted':{'runner_temp_free_bytes':100}}
  with patch.dict(os.environ,self.env(),clear=True),patch.object(r.probe,'job_context',return_value=(pathlib.Path('/synthetic'),'marker')),patch.object(r.subprocess,'run',return_value=types.SimpleNamespace(stdout=b'7516192768\n')),patch.object(r.probe,'command',side_effect=['26.4', '23E252']),patch.object(r.probe,'free_space',return_value={'runner_temp_free_bytes':100}),patch.object(r.probe,'preflight',side_effect=preflight):
   with contextlib.redirect_stdout(io.StringIO()) as stdout,contextlib.redirect_stderr(io.StringIO()) as stderr:
    actual=r.run()
   self.assertEqual(stdout.getvalue()+stderr.getvalue(),'')
   return actual
 def test_success_redacted_cleanup_required(self):
  result=self.exercise();self.assertEqual(result['status'],'PASS');self.assertTrue(result['cleanupVerified']);self.assertEqual(result['simulatorSdk']['version'],'26.4');self.assertNotIn('private',json.dumps(result));self.assertIsNone(result['buildBudgetPass']);self.assertIsNone(result['primaryFailure']);self.assertEqual(result['cleanupFailures'],[])
 def test_distinct_primary_and_cleanup_failure_fields(self):
  for a,b in ((True,False),(False,True),(True,True)):
   result=self.exercise(a,b);self.assertEqual(result['status'],'BLOCKED');self.assertNotIn('private',json.dumps(result))
   self.assertEqual(result['primaryFailure'],{'stage':'guest-boot-command','code':'COMMAND_TIMEOUT','role':'guest'} if a else None)
   self.assertEqual(result['simultaneousBootVerified'],not a)
   self.assertEqual(result['cleanupFailures'],[{'stage':'cleanup-shutdown-readback','code':'SHUTDOWN_NOT_VERIFIED','role':'host'}] if b else [])
 def test_reason_never_emits_unknown_untrusted_code_stage_or_role(self):
  self.assertEqual(r.probe.reason(r.probe.GateError('secret','PRIVATE_STRING'),'secret','secret'),{'stage':'completion','code':'UNKNOWN'})
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
 def test_transport_late_or_invalid_stops_without_commands_or_device_allocation(self):
  now=100_000_000_000
  for value,code in (('69999999999','TRANSPORT_BUDGET_EXHAUSTED'),
                     ('100000000001','TRANSPORT_BUDGET_INVALID'),
                     ('host/wall clock','TRANSPORT_BUDGET_INVALID')):
   with patch.dict(os.environ,self.env()|{'SNAPSCORE_DUAL_BOOT_STARTED_NS':value},clear=True),patch.object(r.time,'monotonic_ns',return_value=now),patch.object(r.probe,'job_context',return_value=(pathlib.Path('/synthetic'),'marker')),patch.object(r.probe,'preflight') as preflight,patch.object(r.subprocess,'run') as command:
    actual=r.run()
   self.assertEqual(actual['primaryFailure'],{'stage':'transport-admission','code':code})
   self.assertFalse(actual['cleanupAttempted']);self.assertEqual(actual['status'],'BLOCKED')
   preflight.assert_not_called();command.assert_not_called()
 def test_workflow_scope(self):
  text=(pathlib.Path(__file__).parents[2]/'.github/workflows/e2e-ios-sim.yml').read_text();self.assertIn(r.REF,text);self.assertIn(r.probe.XCODE,text);self.assertIn("from time import monotonic_ns",text);self.assertIn('SNAPSCORE_DUAL_BOOT_STARTED_NS="$started_ns"',text)
  for forbidden in ('pull_request:','push:','upload-artifact','secrets.','npm ','brew ','sudo ','self-hosted'):
   self.assertNotIn(forbidden,text)
if __name__=='__main__':unittest.main()
