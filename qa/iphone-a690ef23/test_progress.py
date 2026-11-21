import unittest,json,re,pathlib,tempfile,os,io,types
from unittest.mock import patch
import yaml
import intake
from run import Progress,player_flow
class PhaseControls(unittest.TestCase):
 def tool_failure(self):raise RuntimeError('/private/device-ID secret arbitrary stderr')
 def test_positive_and_first_failure_survives_restore(self):
  p=Progress();self.assertEqual(p.perform('setup','entry',lambda:42),42);self.assertIsNone(p.receipt()['failure'])
  for phase,step in [('setup','add-third'),('restore','restore-category')]:
   with self.assertRaises(RuntimeError):p.perform(phase,step,self.tool_failure)
  self.assertEqual(p.receipt(),{'failure':{'phase':'setup','sceneStep':'add-third'},'restoreFailed':True})
  self.assertNotIn('private',json.dumps(p.receipt()))
 def test_unknown_steps_never_execute(self):
  for phase,step in [('private-name','tap'),('home','/private/path')]:
   with self.assertRaises(ValueError):Progress().perform(phase,step,self.tool_failure)
 def exercise(self,scene='setup',label='+ ADD PLAYER',count=2,adds=True):
  for index in (2,3):
   commands=yaml.safe_load(player_flow(index))
   for command in commands:
    op,arg=next(iter(command.items()))
    rid=arg.get('id')
    visible=(scene=='setup' if rid in ('contest-step-setup','new-contest-back') else scene=='home' if rid=='home-new-contest' else int(rid.rsplit('-',1)[1])<count if rid and rid.startswith('contest-player-') else False)
    if op=='assertVisible':self.assertTrue(visible)
    elif op=='assertNotVisible':self.assertFalse(visible)
    elif op=='scrollUntilVisible':
     element=arg['element']
     if 'text' in element:self.assertIsNotNone(re.fullmatch(element['text'],label))
     else:self.assertLess(int(element['id'].rsplit('-',1)[1]),count)
    elif op=='tapOn':
     self.assertIsNotNone(re.fullmatch(arg['text'],label))
     if adds:count+=1
    else:self.fail("unknown operation")
  return count
 def test_positive_fixture_two_to_four(self):self.assertEqual(self.exercise(),4)
 def test_wrong_scene_missing_label_no_effect_and_already_added(self):
  for kw in [dict(scene='home'),dict(label='ADD PLAYER'),dict(label='++ ADD PLAYER'),dict(adds=False),dict(count=3)]:
   with self.assertRaises(AssertionError):self.exercise(**kw)
 def test_source_label_and_no_legacy_id(self):
  import subprocess
  s=subprocess.check_output(['git','show',intake.SHA+':scoresnap/app/contest/new.tsx'],cwd=intake.ROOT).decode()
  self.assertIn('+ ADD PLAYER',s);self.assertNotIn('testID="add-player"',s)
  for index in (2,3):self.assertNotIn('id: "add-player"',player_flow(index))
  with self.assertRaises(ValueError):player_flow(4)
 def test_wrapper_retains_safe_failure_and_red_status(self):
  env={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'self-hosted','RUNNER_OS':'macOS','GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_WORKFLOW':'device-layout-gate','GITHUB_REF':intake.BRANCH}
  def output(args,**kw):
   if args[0]=='xcodebuild':return b'Xcode 26.4.1'
   if 'runtimes' in args:return json.dumps({'runtimes':[{'identifier':intake.RUNTIME_ID,'version':'26.4.1','isAvailable':True}]}).encode()
   if 'create' in args:return b'00000000-0000-0000-0000-000000000000'
   if 'rev-parse' in args:return (intake.TREE if args[-1].endswith('^{tree}') else 'a'*40).encode()
   return b''
  def run(a):return a.progress.perform('setup','add-third',self.tool_failure)
  with tempfile.TemporaryDirectory() as d,patch.dict(os.environ,{**env,'DEVICE_LAYOUT_OUT':d},clear=True),patch.object(intake.shutil,'which',return_value='/synthetic/tool'),patch.object(intake.subprocess,'check_output',side_effect=output),patch.object(intake.subprocess,'run',return_value=types.SimpleNamespace(returncode=0)),patch.object(intake,'run',side_effect=run),patch('sys.stdout',new_callable=io.StringIO) as stdout:
   self.assertEqual(intake.main(),78)
   state=json.loads((pathlib.Path(d)/'iphone-smoke-supplemental/status.json').read_text())
   self.assertEqual(state['phaseDiagnostic']['failure'],{'phase':'setup','sceneStep':'add-third'})
   self.assertFalse(state['aggregatePass']);self.assertEqual(state['captures'],0)
   for secret in ['private','device-ID','secret','stderr']:self.assertNotIn(secret,stdout.getvalue())
