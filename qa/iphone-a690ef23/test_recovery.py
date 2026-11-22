import unittest,yaml,pathlib
from run import Progress,paywall_attempt,NavigationFailure,CaptureBoundaryFailure
from paywall import CLOSE_PHASES,run_close
from pricing import optional_sections,SectionUnavailable,SECTIONS,reveal
class RecoveryControls(unittest.TestCase):
 def test_each_close_command_has_separate_observed_destination(self):
  steps=dict(CLOSE_PHASES)
  self.assertEqual(list(steps),['close-precondition','close-tap','close-dismiss','back-games-tap','back-games-scene','back-setup-tap','back-setup-scene'])
  for name in ['close-tap','back-games-tap','back-setup-tap']:
   self.assertEqual(len(yaml.safe_load(steps[name])),1)
  for name in ['close-dismiss','back-games-scene','back-setup-scene']:
   self.assertIn('extendedWaitUntil',steps[name]);self.assertIn('timeout: 15000',steps[name])
   self.assertNotIn('tapOn',steps[name])
 def test_actual_close_failure_records_category_and_stops_later_steps(self):
  for failure,_ in CLOSE_PHASES:
   p=Progress();p.observe_category('large');calls=[]
   def flow(text,step):
    calls.append(step)
    if step==failure:raise NavigationFailure('private')
   self.assertFalse(paywall_attempt(lambda:run_close(flow,p),p))
   self.assertEqual(calls[-1],failure);self.assertEqual(p.categoryFailures,[{'phase':'paywall','sceneStep':failure,'observedCategory':'large'}]);self.assertNotIn('private',str(p.receipt()))
   p.observe_category('extra-extra-large')
   self.assertTrue(paywall_attempt(lambda:run_close(lambda *_:None,p),p))
   self.assertEqual(len(p.categoryFailures),1);self.assertEqual(p.failure['observedCategory'],'large')
 def test_actual_optional_branch_never_swallows_capture_or_unknown_failure(self):
  for error in [CaptureBoundaryFailure('capture'),ValueError('source'),RuntimeError('unknown')]:
   p=Progress()
   with self.assertRaises(type(error)):
    paywall_attempt(lambda:optional_sections(lambda _:(_ for _ in ()).throw(error)),p)
   self.assertEqual(p.categoryFailures,[])
 def test_optional_typed_steps_only_and_later_sections_continue(self):
  for step in ['return-top','reveal','visible']:
   rows=optional_sections(lambda section:(_ for _ in ()).throw(SectionUnavailable(step)) if section=='paywall-free' else None)
   self.assertEqual(rows[0]['step'],step);self.assertEqual(rows[1]['status'],'captured')
  with self.assertRaises(ValueError):SectionUnavailable('private value')
 def test_each_category_setup_precedes_paywall_and_recovery_cannot_skip_home(self):
  s=(pathlib.Path(__file__).parent/'run.py').read_text()
  block=s[s.index('   recovered=True'):s.index("  finally:progress.perform('restore'")]
  self.assertEqual(block.count('for i,category in enumerate(CATEGORIES):'),1)
  self.assertLess(block.index('flow(ADD_ACTIVATE'),block.index('def category_paywall'))
  self.assertIn('progress,reopen=False',block)
  self.assertLess(block.index('cold_restart('),block.index("flow(home,'reacquire-home-"))
  self.assertLess(block.index("flow(home,'reacquire-home-"),block.index("flow(home+'- tapOn:"))
  self.assertIn('recovered=paywall_attempt(category_paywall,progress)',block)
  self.assertNotIn('except Exception',block)
 def test_reveal_and_visible_are_distinct_steps(self):
  for section in SECTIONS:self.assertEqual(list(yaml.safe_load(reveal(section))[0]),['scrollUntilVisible'])
