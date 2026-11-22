import unittest,tempfile,pathlib,json,subprocess
from unittest.mock import patch
import gate_android as g
class Controls(unittest.TestCase):
 def env(self):return {'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','RUNNER_OS':'Linux','GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_SHA':'a'*40,'GITHUB_EVENT_NAME':'pull_request','GITHUB_REF':'refs/pull/1/merge'}
 def event(self):return {'number':1,'pull_request':{s:{'sha':v*40,'repo':{'full_name':'augsmog/QuickScore'}} for s,v in [('head','b'),('base','c')]}}
 def replies(self):return ['a'*40,'d'*40,'','https://github.com/augsmog/QuickScore.git','c'*40+' '+'b'*40]
 def test_pr_records_distinct_checkout_head_base_tree(self):
  with patch.object(g,'read',side_effect=self.replies()):r=g.ingress('.',self.env(),self.event())
  self.assertNotEqual(r['checkoutSha'],r['prHead']);self.assertEqual(r['checkoutTree'],'d'*40)
 def test_foreign_context_sha_dirty_origin_and_parent_rejected(self):
  for index,value in [(0,'b'*40),(2,'dirty'),(3,'https://github.com/foreign/repo.git'),(4,'b'*40+' '+'c'*40)]:
   replies=self.replies();replies[index]=value
   with patch.object(g,'read',side_effect=replies),self.assertRaises(g.b.Failure):g.ingress('.',self.env(),self.event())
  for key,value in [('GITHUB_REPOSITORY','foreign/repo'),('RUNNER_ENVIRONMENT','self-hosted'),('GITHUB_EVENT_NAME','push')]:
   with patch.object(g,'read',side_effect=self.replies()),self.assertRaises(g.b.Failure):g.ingress('.',{**self.env(),key:value},self.event())
 def test_sdk_preflight_stops_before_install_or_build(self):
  with tempfile.TemporaryDirectory() as t,patch.dict(g.os.environ,{'ANDROID_SDK_ROOT':t}),patch.object(g,'command') as command:
   with self.assertRaises(g.b.Failure):g.build(pathlib.Path(t),pathlib.Path(t)/'src',pathlib.Path(t),{})
   command.assert_not_called()
 def test_process_nonzero_is_fatal(self):
  with tempfile.TemporaryDirectory() as t,patch.object(g.subprocess,'Popen') as pop:
   pop.return_value.wait.return_value=1
   with self.assertRaises(g.b.Failure):g.command(['false'],{},t,'build',1,pathlib.Path(t))
 def test_phase_replay_real_orchestrator_never_passes_and_restores(self):
  from unittest.mock import MagicMock
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);out=root/'out';apk=root/'candidate.apk';apk.write_bytes(b'synthetic')
   binding={'source_sha':'a'*40,'source_tree':'d'*40,'apk_sha256':g.b.digest(b'synthetic'),'pixel_size':[1080,2400]}
   device=MagicMock();device.identity.return_value='boot';device.installed.return_value=binding['apk_sha256']
   state={'scale':'1.0','size':None,'density':None};calls=[]
   def run(*args):
    calls.append(args)
    if args[:3]==('shell','pm','path'):return b''
    if args[:3]==('shell','settings','get'):return state['scale'].encode()
    if args[:3]==('shell','settings','put'):state['scale']=args[-1];return b''
    if args[:2]==('shell','wm'):
     key=args[2];physical='1080x2340' if key=='size' else '440'
     if len(args)==4:state[key]=None if args[3]=='reset' else args[3];return b''
     return (f'Physical {key}: {physical}'+(f'\nOverride {key}: '+state[key] if state[key] else '')).encode()
    return b''
   device.run.side_effect=run
   with patch.object(g,'ingress',return_value={'checkoutSha':'a'*40,'checkoutTree':'d'*40}),patch.object(g.flow,'source_selectors'),patch.object(g,'read',return_value='emulator-5554 device'),patch.object(g.b,'Android',return_value=device),patch.object(g,'ObservedDevice',return_value=device),patch.object(g,'build',return_value=(apk,binding,{})),patch.object(g.b,'capture') as capture,patch.object(g.flow.flow,'journey') as journey:
    self.assertEqual(g.execute(root,out,{'RUNNER_TEMP':t},{}),1)
    self.assertEqual(capture.call_count,2);self.assertEqual(journey.call_count,2)
   result=json.loads((out/'result.json').read_text());self.assertEqual(result['failure'],'REQUIRED_GEOMETRY_VALIDATION_FAILED');self.assertEqual(result['restore'],'VERIFIED')
   self.assertEqual(state,{'scale':'1.0','size':None,'density':None})
 def test_no_gate_success_branch(self):
  import inspect
  s=inspect.getsource(g.execute)
  self.assertIn('return 1',s);self.assertNotIn('return 0',s)
  self.assertIn('geometry_output.mjs',s)
if __name__=='__main__':unittest.main()
