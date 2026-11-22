import unittest,xml.etree.ElementTree as ET
from unittest.mock import patch
import flow_adapter as a
f=a.flow;P=a.boundary.PACKAGE
def fixture(selected=2):
 r=ET.Element('hierarchy')
 def n(key,box,**attrs):
  x=ET.SubElement(r,'node',{'resource-id':key,'package':P,'bounds':box,'enabled':'true','visible-to-user':'true','clickable':'false',**attrs});return x
 n('contest-step-setup','[0,0][400,700]');n('contest-scroll','[0,0][400,700]',scrollable='true');n('contest-footer','[0,700][400,800]');n('new-contest-back','[0,0][50,40]')
 n('tournament-toggle','[10,50][70,100]',**{'class':'android.widget.Switch','content-desc':f.TOURNAMENT,'clickable':'true','checkable':'true','checked':'true'})
 n('heading','[10,120][300,150]',text=f.ROUND_HEADING,**{'class':'android.widget.TextView'})
 for count in (2,3,4):
  x=10+(count-2)*80
  n('rounds-'+str(count),f'[{x},160][{x+60},220]',text=str(count),selected=str(count==selected).lower(),**{'class':'android.widget.Button','clickable':'true'})
 return r
class Controls(unittest.TestCase):
 def test_real_contract_no_wrapper_each_selection(self):
  for count in (2,3,4):
   proof={};_,controls=f.tournament_controls(fixture(count),P,True,proof)
   self.assertEqual(proof['observedSelectedRoundCount'],count);self.assertEqual(len(controls),4)
 def test_wrong_scene_foreign_duplicate_offscreen_wrong_label(self):
  for mutate in [lambda r:r.append(ET.Element('node',{'resource-id':'home-new-contest','bounds':'[0,0][20,20]'})),lambda r:r[-1].set('package','foreign.app'),lambda r:r.append(ET.fromstring(ET.tostring(r[-1]))),lambda r:r[-1].set('bounds','[10,710][70,770]'),lambda r:r[-1].set('text','3')]:
   r=fixture();mutate(r)
   with self.assertRaises(ValueError):f.tournament_controls(r,P,True,{})
 def test_two_selected_rejected(self):
  r=fixture();r[-1].set('selected','true')
  with self.assertRaises(ValueError):f.tournament_controls(r,P,True,{})
 def test_sequence_observes_before_each_next_tap(self):
  d=object.__new__(a.BoundDriver)
  with patch.object(d,'read',side_effect=[fixture(2),fixture(2),fixture(2),fixture(3),fixture(3),fixture(4)]),patch.object(d,'adb') as adb,patch.object(d,'shot_round_state') as shot:
   d.select_rounds_sequence();self.assertEqual(adb.call_count,3);self.assertEqual([c.args[0] for c in shot.call_args_list],[2,3,4])
 def test_unknown_or_wrong_after_tap_stops_sequence(self):
  for after in [fixture(3)]:
   d=object.__new__(a.BoundDriver)
   with patch.object(d,'read',side_effect=[fixture(),after]),patch.object(d,'adb') as adb,patch.object(d,'shot_round_state') as shot:
    with self.assertRaises(f.CaptureBoundaryFailure):d.select_rounds_sequence()
    self.assertEqual(adb.call_count,1);shot.assert_not_called()
 def test_actual_composed_source_preflight_without_device(self):
  import pathlib
  root=pathlib.Path(__file__).resolve().parents[5]
  with patch.object(a.boundary,'Android') as adb:
   a.source_selectors(root);adb.assert_not_called()
if __name__=='__main__':unittest.main()
