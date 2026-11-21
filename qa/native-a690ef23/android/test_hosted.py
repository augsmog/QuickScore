import unittest,tempfile,pathlib
from hosted import preflight,REQ
class Preflight(unittest.TestCase):
 def test_one_failure_lists_exact_requirements(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'ANDROID_PREFLIGHT_MISSING:.*adb.*android-36.*exactly one'):preflight(d,{},'')
 def test_existing_sdk_one_emulator(self):
  with tempfile.TemporaryDirectory() as d:
   for f in REQ:p=pathlib.Path(d)/f;p.parent.mkdir(parents=True,exist_ok=True);p.touch()
   tools={t:'/synthetic/'+t for t in ['node','npm','java','adb']}
   self.assertEqual(preflight(d,tools,'emulator-5554\tdevice\n'),'emulator-5554')
   with self.assertRaises(ValueError):preflight(d,tools,'emulator-5554\tdevice\nemulator-5556\tdevice')
