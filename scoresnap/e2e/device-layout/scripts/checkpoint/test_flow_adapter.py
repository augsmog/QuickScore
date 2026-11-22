import pathlib,tempfile,unittest
from unittest.mock import patch,MagicMock
import flow_adapter as a
class Controls(unittest.TestCase):
 def test_source_selector_contract_positive_and_each_missing(self):
  with tempfile.TemporaryDirectory() as tmp:
   for f,keys in a.REQUIRED.items():
    p=pathlib.Path(tmp,f);p.parent.mkdir(parents=True,exist_ok=True);p.write_text('\n'.join('testID="'+k+'"' for k in keys))
   a.source_selectors(tmp)
   for f,keys in a.REQUIRED.items():
    p=pathlib.Path(tmp,f);original=p.read_text()
    for k in keys:
     p.write_text(original.replace('testID="'+k+'"',''))
     with self.assertRaises(a.boundary.Failure):a.source_selectors(tmp)
     p.write_text(original)
 def test_no_device_access_before_source_admission(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(a.boundary,'Android') as device:
   with self.assertRaises(OSError):a.run({'repo':tmp})
   device.assert_not_called()
 def test_no_unbound_driver_or_unknown_lane(self):
  with self.assertRaises(ValueError):a.flow.journey({})
  with self.assertRaises(ValueError):a.flow.journey({},'unknown')
 def test_adb_only_navigation_and_keyboard_observation(self):
  d=object.__new__(a.BoundDriver);d.device=MagicMock();d.device.run.return_value=b''
  with patch.object(d,'check_identity'):
   for args in [('shell','input','tap','1','2'),('shell','dumpsys','input_method')]:d.adb(*args)
   for args in [('shell','pm','clear','com.scoresnap.app'),('shell','settings','put','system','font_scale','1.3'),('kill-server',)]:
    with self.assertRaises(a.flow.CaptureBoundaryFailure):d.adb(*args)
 def test_no_unidentified_capture(self):
  d=object.__new__(a.BoundDriver)
  with self.assertRaises(a.flow.CaptureBoundaryFailure):d.join_diagnostic()
 def test_boundary_failure_not_optional_section_success(self):
  self.assertIsNone(a.flow.navigation_reason(a.flow.CaptureBoundaryFailure('bad')))
  self.assertIsNone(a.flow.navigation_reason(a.boundary.Failure('command')))
if __name__=='__main__':unittest.main()
