import json,unittest
from smoke import target_focus,FocusReadbackError,settle_home
class FocusControls(unittest.TestCase):
 focus='mCurrentFocus=Window{abc u0 test.app/.Main}'
 xml='<hierarchy>'+''.join('<node package="test.app" resource-id="test.app:id/'+s+'" bounds="[0,0][10,10]" />' for s in ['home-scroll','home-new-contest'])+'</hierarchy>'
 def test_positive_and_foreign_ambiguous_missing(self):
  self.assertEqual(target_focus(self.focus,'test.app'),'test.app/.Main')
  for raw,reason in [(self.focus.replace('test.app','private.foreign'),'FOCUS_FOREIGN'),(self.focus+'\n'+self.focus,'FOCUS_AMBIGUOUS'),('mCurrentFocus=null','FOCUS_MISSING_OR_UNSUPPORTED'),('','FOCUS_MISSING_OR_UNSUPPORTED')]:
   with self.assertRaises(FocusReadbackError) as caught:target_focus(raw,'test.app')
   self.assertEqual(caught.exception.diagnostic['reason'],reason)
   self.assertNotIn('private.foreign',str(caught.exception))
 def fake(self,focuses,xml=None,pid='123'):
  calls=[];i=[0]
  def adb(*args):
   calls.append(args)
   if args[:2]==('shell','pidof'):return pid
   if args[:2]==('shell','dumpsys'):
    value=focuses[min(i[0],len(focuses)-1)];i[0]+=1;return value
   return self.xml if xml is None else xml
  return adb,calls
 def test_readonly_settle_records_initial_failure_then_real_ready(self):
  adb,calls=self.fake(['mCurrentFocus=null',self.focus]);rows=[];sleeps=[]
  settle_home(adb,'test.app',rows.append,sleeps.append)
  self.assertEqual([r['reason'] for r in rows],['FOCUS_MISSING_OR_UNSUPPORTED','READY'])
  self.assertEqual(sleeps,[2]);self.assertTrue(rows[-1]['homeSceneVerified'])
  self.assertFalse(any(any(v in ('tap','monkey','grant','force-stop') for v in c) for c in calls))
 def test_foreign_then_target_only_retries_without_dismissing(self):
  adb,calls=self.fake([self.focus.replace('test.app','other.app'),self.focus]);rows=[]
  settle_home(adb,'test.app',rows.append,lambda _:None)
  self.assertEqual(rows[0]['foreignFocusMatches'],1);self.assertEqual(rows[-1]['reason'],'READY')
 def test_timeout_wrong_scene_and_missing_process_never_pass(self):
  for focuses,xml,pid in [([self.focus+'\n'+self.focus],None,'123'),([self.focus],'<hierarchy/>','123'),([self.focus],None,'')]:
   adb,calls=self.fake(focuses,xml,pid);rows=[];sleeps=[]
   with self.assertRaisesRegex(ValueError,'HOME_READINESS_TIMEOUT'):settle_home(adb,'test.app',rows.append,sleeps.append)
   self.assertEqual(len(rows),6);self.assertEqual(sleeps,[2]*5);self.assertNotIn('READY',[r['reason'] for r in rows])
 def test_tool_error_redacted_and_bounded(self):
  def fail(*_):raise RuntimeError('private raw identifier /secret')
  rows=[]
  with self.assertRaises(ValueError):settle_home(fail,'test.app',rows.append,lambda _:None)
  self.assertEqual(len(rows),6)
  self.assertNotIn('secret',json.dumps(rows));self.assertTrue(all(r['reason']=='READBACK_FAILED' for r in rows))
