import unittest,yaml
from paywall import OPEN,CLOSE,ENTRY_STEPS,REENTRY_STEPS,run_entry,HOST,GUEST
from run import Progress
class PrefillControls(unittest.TestCase):
 def test_preserves_expected_host_and_only_types_guest(self):
  self.assertNotIn('Your name',OPEN);self.assertNotIn('QA Host',OPEN);self.assertNotIn('eraseText',OPEN)
  commands=yaml.safe_load(OPEN)
  self.assertEqual([c['inputText'] for c in commands if isinstance(c,dict) and 'inputText' in c],['QA Guest'])
  h=yaml.safe_load(HOST)[1]['assertVisible'];self.assertEqual(h,{'id':'contest-player-0','containsDescendants':[{'text':'^Golfer$'}]})
  self.assertIn('contest-player-1',GUEST);self.assertIn('^QA Guest$',CLOSE);self.assertIn('^Golfer$',CLOSE)
 def test_every_stage_failure_is_bounded_and_stops_later_actions(self):
  for failed,_ in ENTRY_STEPS:
   progress=Progress();calls=[]
   def flow(text,step):
    calls.append(step)
    if step==failed:raise RuntimeError('private screenshot text /path')
   with self.assertRaises(RuntimeError):run_entry(flow,progress)
   self.assertEqual(progress.receipt()['failure'],{'phase':'paywall','sceneStep':failed})
   self.assertEqual(calls[-1],failed);self.assertNotIn('private',str(progress.receipt()))
 def test_success_and_reentry_do_not_retype_or_toggle_draft(self):
  for reopen,steps in [(False,ENTRY_STEPS),(True,REENTRY_STEPS)]:
   progress=Progress();calls=[];run_entry(lambda text,step:calls.append(step),progress,reopen)
   self.assertEqual(calls,[s for s,_ in steps]);self.assertIsNone(progress.receipt()['failure'])
  self.assertEqual([s for s,_ in REENTRY_STEPS],['game-step','round-step','start','appearance'])
 def test_host_selector_does_not_depend_on_direct_child_or_coordinates(self):
  self.assertIn('containsDescendants',HOST);self.assertNotIn('childOf',HOST);self.assertNotIn('point:',OPEN)
  for action in yaml.safe_load(HOST):self.assertNotIn('tapOn',action)
