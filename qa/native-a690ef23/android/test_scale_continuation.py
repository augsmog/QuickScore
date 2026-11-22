"""Offline scheduling controls, never native run evidence."""
import json,pathlib,tempfile,unittest
from unittest.mock import patch,MagicMock
import hosted,checkpoints

class ScaleContinuation(unittest.TestCase):
 def exercise(self,failure):
  events=[]
  def adb(*args):events.append(args);return '1.0'
  def home(cfg):
   events.append(('home',cfg['expectedScale']))
   if failure=='home':raise ValueError('PROVENANCE_OR_HOME_FAILURE')
  with tempfile.TemporaryDirectory() as td:
   out=pathlib.Path(td)
   def journey(cfg,lane):
    value=cfg['expectedScale'];events.append(('journey',value))
    (out/('retained-'+str(value))).write_text('synthetic fixture')
    if value==1.0 and lane=='join':
     if failure=='supplemental':raise checkpoints.SupplementalJourneyBlocked('setup')
     if failure=='capture':raise checkpoints.CaptureBoundaryFailure('capture boundary')
     if failure=='unexpected':raise RuntimeError('unexpected')
   with patch.object(hosted,'smoke',side_effect=home),patch.object(checkpoints,'journey',side_effect=journey):
    if failure:
     with self.assertRaises((ValueError,RuntimeError)):hosted.run_scales(adb,'test.app',{},out,'a'*64)
    else:self.assertEqual(hosted.run_scales(adb,'test.app',{},out,'a'*64),[1.0,1.3])
   self.assertEqual(events[-1],('shell','settings','put','system','font_scale','1.0'))
   if failure in ('supplemental',None):
    self.assertIn(('home',1.3),events);self.assertIn(('journey',1.3),events)
    self.assertTrue((out/'retained-1.0').exists());self.assertTrue((out/'retained-1.3').exists())
    self.assertGreaterEqual(events.count(('home',1.0)),2)
    second=events.index(('home',1.3))
    self.assertEqual(events[second-2],('shell','am','force-stop','test.app'))
    self.assertEqual(events[second-1],('shell','monkey','-p','test.app','-c','android.intent.category.LAUNCHER','1'))
    result=json.loads((out/'smoke-summary.json').read_text());self.assertFalse(result['aggregatePass'])
    self.assertEqual(result['supplementalFailures'],[{'scale':1.0,'lane':'join','phase':'setup','reason':'NAVIGATION_BLOCKED','status':'BLOCKED'}] if failure else [])
   else:self.assertNotIn(('home',1.3),events)
 def test_supplemental_failure_keeps_artifacts_and_second_scale_but_raises(self):self.exercise('supplemental')
 def test_home_failure_stops_loop(self):self.exercise('home')
 def test_supplemental_capture_boundary_stops_loop(self):self.exercise('capture')
 def test_untyped_failure_stops_loop(self):self.exercise('unexpected')
 def test_success_still_has_no_acceptance(self):self.exercise(None)
 def test_capture_failure_cannot_become_retryable_navigation(self):
  from test_checkpoints import fixture
  d=object.__new__(checkpoints.Driver);d.c={};d.out=pathlib.Path('/unused');d.report=[];d.observations=[]
  with patch.object(d,'read',return_value=fixture('rounds')),patch.object(checkpoints,'capture',side_effect=ValueError('installed APK mismatch')):
   with self.assertRaises(checkpoints.CaptureBoundaryFailure):d.shot('rounds')
  self.assertEqual(d.report,[])
 def test_real_journey_optional_capture_failure_is_fatal(self):
  for section in ['paywall-free','paywall-annual','paywall-disabled']:
   with self.subTest(section=section):
    d=MagicMock();d.report=[]
    def shot(name):
     d.phase=name
     if name==section:raise checkpoints.CaptureBoundaryFailure('capture boundary')
    d.shot.side_effect=shot
    with patch.object(checkpoints,'Driver',return_value=d),patch.object(checkpoints,'one'),patch.object(checkpoints,'validate'):
     with self.assertRaises(checkpoints.CaptureBoundaryFailure):checkpoints.journey({})
    d.save.assert_called_once_with('BLOCKED')
    self.assertFalse(any(r.get('status')=='SECTION_NOT_SAFELY_OBSERVED' for r in d.report))
    self.assertFalse(any(call.args[0]=='paywall-close' for call in d.tap.call_args_list))
 def test_real_journey_missing_optional_section_remains_explicit(self):
  d=MagicMock();d.report=[]
  def shot(name):
   if name=='paywall-free':raise ValueError('label missing before capture')
  d.shot.side_effect=shot
  with patch.object(checkpoints,'Driver',return_value=d),patch.object(checkpoints,'one'),patch.object(checkpoints,'validate'):checkpoints.journey({})
  self.assertIn({'checkpoint':'paywall-free','captured':False,'status':'SECTION_NOT_SAFELY_OBSERVED','geometryPassed':False},d.report)
  d.save.assert_called_once_with('CAPTURED_SUPPLEMENTAL_ONLY')

if __name__=='__main__':unittest.main()
