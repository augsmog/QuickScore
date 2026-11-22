"""Synthetic portable controls; not native evidence."""
import pathlib,tempfile,unittest,xml.etree.ElementTree as ET
from unittest.mock import patch,MagicMock
import checkpoints as c
from test_checkpoints import node,fixture
def host(value='',count=1):
 r=fixture('setup-initial');card=node(**{'resource-id':'contest-player-0'})
 for _ in range(count):card.append(node(**{'class':'android.widget.EditText','hint':'Your name','text':value,'bounds':'[10,10][50,20]'}))
 r.append(card)
 for n in r:
  if n.get('resource-id')=='contest-footer':n.set('bounds','[0,100][400,200]')
 return r
class Evidence(unittest.TestCase):
 def driver(self,td):
  return c.Driver({'out':td+'/test','package':'test.app','serial':'emulator-5554'})
 def test_all_counts_recorded_before_rejection_and_capped(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td);r=fixture('entry');r.remove(r[0])
   for _ in range(4):r.append(node(text='Find contest'))
   with self.assertRaises(ValueError):d.guard(r,'entry')
   rows=d.observations[0]['selectors']
   self.assertEqual([x['matches'] for x in rows],[0,1,1,2])
   self.assertEqual(len(rows),4)
 def test_host_nonempty_is_untouched_and_not_logged(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',return_value=host('Synthetic Name')),patch.object(d,'adb') as adb:d.prepare_host()
   adb.assert_not_called();self.assertEqual(d.hostName,'Synthetic Name')
   self.assertNotIn('Synthetic Name',str(d.observations))
 def test_proven_empty_host_only_is_filled(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',side_effect=[host(),host(),host('QAHost')]),patch.object(d,'adb',return_value='mInputShown=true') as adb:d.prepare_host()
   self.assertIn(('shell','input','text','QAHost'),[x.args for x in adb.call_args_list])
 def test_duplicate_missing_changed_host_prevents_text(self):
  for r in (host(count=0),host(count=2)):
   with tempfile.TemporaryDirectory() as td:
    d=self.driver(td)
    with patch.object(d,'read',return_value=r),patch.object(d,'adb') as adb:
     with self.assertRaises(ValueError):d.prepare_host()
    adb.assert_not_called()
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',side_effect=[host(),host('changed')]),patch.object(d,'adb') as adb:
    with self.assertRaises(ValueError):d.prepare_host()
   self.assertFalse(any(x.args[:3]==('shell','input','text') for x in adb.call_args_list))
 def test_initial_wizard_precedes_names_and_survives_host_failure(self):
  d=MagicMock();d.report=[];d.prepare_host.side_effect=ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
  with patch.object(c,'Driver',return_value=d):
   with self.assertRaises(c.SupplementalJourneyBlocked) as error:c.journey({},lane='wizard')
  d.shot.assert_called_once_with('setup-initial');d.fill.assert_not_called()
  self.assertEqual(error.exception.phase,'host-prefill')
 def test_no_diagnostic_before_successful_tap(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td);d.phase='join-destination'
   with patch.object(c,'capture') as capture:
    with self.assertRaises(c.CaptureBoundaryFailure):d.join_diagnostic()
   capture.assert_not_called()
 def test_diagnostic_distinct_from_checkpoint_and_boundary_fatal(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td);d.phase='join-destination';d.joinTapped=True
   with patch.object(c,'capture') as capture:d.join_diagnostic()
   self.assertTrue(capture.call_args.args[0]['_diagnostic_only'])
   self.assertFalse(d.diagnostic['sceneVerified']);self.assertEqual(d.report,[])
   with patch.object(c,'capture',side_effect=ValueError('APK')):
    with self.assertRaises(c.CaptureBoundaryFailure):d.join_diagnostic()
if __name__=='__main__':unittest.main()
