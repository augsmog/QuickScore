"""Portable controls only: no device or native success evidence."""
import json,pathlib,tempfile,unittest
from unittest.mock import patch,MagicMock
import checkpoints as c,hosted
class IndependentLanes(unittest.TestCase):
 def test_join_failure_runs_wizard_after_verified_cold_home_and_stays_red(self):
  events=[]
  def adb(*args):events.append(args);return '1.0'
  def home(cfg):events.append(('home',cfg['out']))
  def journey(cfg,lane):
   events.append(('lane',lane,cfg['expectedScale']))
   if lane=='join':raise c.SupplementalJourneyBlocked('join-destination','WRONG_SCENE')
  with tempfile.TemporaryDirectory() as td:
   with patch.object(hosted,'smoke',side_effect=home),patch.object(c,'journey',side_effect=journey):
    with self.assertRaisesRegex(ValueError,'SUPPLEMENTAL_JOURNEY_INCOMPLETE'):
     hosted.run_scales(adb,'synthetic.app',{},pathlib.Path(td),'a'*64)
   r=json.loads((pathlib.Path(td)/'smoke-summary.json').read_text())
   self.assertFalse(r['aggregatePass']);self.assertEqual(len(r['supplementalFailures']),2)
   for scale in (1.0,1.3):
    i=events.index(('lane','wizard',scale))
    self.assertEqual(events[i-1][0],'home')
    self.assertEqual(events[i-3],('shell','am','force-stop','synthetic.app'))
   self.assertFalse(any('clear' in x for x in events))
 def test_recovery_home_boundary_is_fatal(self):
  events=[]
  def home(cfg):
   events.append(cfg['out'])
   if cfg['out'].endswith('-wizard'):raise c.CaptureBoundaryFailure('bad scale')
  with tempfile.TemporaryDirectory() as td,patch.object(hosted,'smoke',side_effect=home),patch.object(c,'journey',side_effect=c.SupplementalJourneyBlocked('join-home-lookup')) as j:
   with self.assertRaises(c.CaptureBoundaryFailure):
    hosted.run_scales(lambda *a:'1.0','synthetic.app',{},pathlib.Path(td),'a'*64)
   self.assertEqual(j.call_count,1);self.assertEqual(len(events),2)
 def test_actual_join_lookup_tap_destination_are_distinct(self):
  for method,reason,phase in [('seek','CONTROL_UNREACHABLE','join-home-lookup'),('tap','CONTROL_DISABLED','join-home-tap'),('validate','WRONG_SCENE','join-destination')]:
   d=MagicMock();d.report=[]
   with patch.object(c,'Driver',return_value=d),patch.object(c,'validate') as v:
    (v if method=='validate' else getattr(d,method)).side_effect=ValueError(reason)
    with self.assertRaises(c.SupplementalJourneyBlocked) as e:c.journey({},lane='join')
   self.assertEqual(e.exception.phase,phase);self.assertEqual(e.exception.reason,reason)
   d.shot.assert_not_called();d.save.assert_called_once_with('BLOCKED')
 def test_read_foreground_failure_never_navigation(self):
  d=object.__new__(c.Driver);d.c={'package':'synthetic.app'};d.adb=MagicMock()
  with patch('smoke.read_focus',side_effect=ValueError('foreign focus')):
   with self.assertRaises(c.CaptureBoundaryFailure):d.read()
 def test_unclassified_and_capture_failures_not_retryable(self):
  for e in [ValueError('secret arbitrary tool output'),c.CaptureBoundaryFailure('WRONG_SCENE'),RuntimeError('CONTROL_DISABLED')]:
   self.assertIsNone(c.navigation_reason(e))
 def test_join_positive_does_not_run_wizard_or_claim_acceptance(self):
  d=MagicMock()
  with patch.object(c,'Driver',return_value=d),patch.object(c,'validate'):c.journey({},lane='join')
  self.assertEqual([x.args[0] for x in d.shot.call_args_list],['entry','entry-invalid'])
  self.assertNotIn('home-new-contest',[x.args[0] for x in d.tap.call_args_list])
  d.save.assert_called_once_with('CAPTURED_SUPPLEMENTAL_ONLY')
if __name__=='__main__':unittest.main()
