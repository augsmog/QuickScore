import unittest,yaml
from paywall import OPEN,CLOSE,ENTRY_STEPS,REENTRY_STEPS,run_entry,ENTER,GUEST,NAMES,run_close,CLOSE_STEPS
from run import Progress
class PrefillControls(unittest.TestCase):
 def test_preserves_expected_host_and_only_types_guest(self):
  self.assertNotIn('Your name',OPEN);self.assertNotIn('QA Host',OPEN);self.assertNotIn('eraseText',OPEN)
  commands=yaml.safe_load(OPEN)
  self.assertEqual([c['inputText'] for c in commands if isinstance(c,dict) and 'inputText' in c],['QA Guest'])
  self.assertIn('contest-player-4',ENTER);self.assertNotIn('tapOn',ENTER)
  self.assertIn('direction: UP',GUEST);self.assertIn('^QA Guest$',NAMES);self.assertIn('^Golfer$',NAMES)
  self.assertNotIn('containsDescendants',OPEN);self.assertIn('^2 ready$',OPEN)
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
 def test_active_draft_not_discarded(self):
  import pathlib
  source=(pathlib.Path(__file__).parent/'run.py').read_text()
  route=source[source.index('   from paywall import OPEN'):source.index("  finally:progress.perform('restore'")]
  self.assertNotIn('paywall-return-home',route);self.assertNotIn({'tapOn':{'id':'home-new-contest'}},yaml.safe_load(OPEN))
 def test_observed_category_only_and_first_failure_preserved(self):
  p=Progress();p.observe_category('extra-extra-large')
  with self.assertRaises(RuntimeError):p.perform('paywall','guest-entry',lambda:(_ for _ in ()).throw(RuntimeError('private')))
  p.observe_category('large')
  self.assertEqual(p.receipt()['failure'],{'phase':'paywall','sceneStep':'guest-entry','observedCategory':'extra-extra-large'})
  with self.assertRaises(ValueError):p.observe_category('requested-1.3')
 def test_functional_close_and_literal_names_independent(self):
  for names in (True,False):
   p=Progress();calls=[]
   def flow(text,step):
    calls.append(step)
    if step=='draft-names' and not names:raise RuntimeError('AX unavailable')
   self.assertIs(run_close(flow,p),names);self.assertIsNone(p.receipt()['failure'])
   self.assertEqual(calls,[s for s,_ in CLOSE_STEPS]+['draft-names','draft-rounds'])
  for fail,_ in CLOSE_STEPS:
   p=Progress();calls=[]
   def stop(text,step):
    calls.append(step)
    if step==fail:raise RuntimeError('stop')
   with self.assertRaises(RuntimeError):run_close(stop,p)
   self.assertEqual(calls[-1],fail);self.assertEqual(p.receipt()['failure']['sceneStep'],fail)
 def test_draft_receipt_does_not_infer_names(self):
  from intake import sanitize_draft,SHA,TREE
  for names in (True,False):
   r={'sourceSha':SHA,'sourceTree':TREE,'category':'large','namesRetained':names,'functionalDraftRetained':True,'twoRoundControlVisible':True,'aggregatePass':False}
   self.assertIs(sanitize_draft(r,'large')['namesRetained'],names)
   for change in [{'sourceSha':'wrong'},{'category':'extra-extra-large'},{'functionalDraftRetained':False},{'namesRetained':1},{'aggregatePass':True}]:
    with self.assertRaises(ValueError):sanitize_draft({**r,**change},'large')
