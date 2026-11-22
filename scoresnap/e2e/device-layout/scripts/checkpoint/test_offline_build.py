import unittest,tempfile,pathlib,xml.etree.ElementTree as ET
from unittest.mock import patch
import sdk_offline_provision as s,offline_apk as o,gate_android as g
class Tests(unittest.TestCase):
 def test_exact_package_plan_only(self):
  with tempfile.TemporaryDirectory() as t:
   self.assertEqual(s.plan(t),['ndk;27.1.12297006','cmake;3.22.1'])
   for relative in s.PACKAGES.values():p=pathlib.Path(t,relative);p.parent.mkdir(parents=True,exist_ok=True);p.touch()
   self.assertEqual(s.plan(t),[])
 def test_host_rejects_wrong_machine(self):
  e={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','RUNNER_OS':'Linux','RUNNER_ARCH':'X64','GITHUB_REPOSITORY':'augsmog/QuickScore','ImageOS':'ubuntu26','ImageVersion':'20261116.202.1'}
  s.host_guard(e,{'ID':'ubuntu','VERSION_ID':'26.04'},'/usr/local/lib/android/sdk')
  for k in e:
   with self.assertRaises(ValueError):s.host_guard({**e,k:'wrong'},{'ID':'ubuntu','VERSION_ID':'26.04'},'/usr/local/lib/android/sdk')
 def test_license_requires_existing_and_records_drift(self):
  with tempfile.TemporaryDirectory() as t:
   with self.assertRaises(ValueError):s.licenses(t)
   p=pathlib.Path(t,'licenses');p.mkdir();f=p/'android-sdk-license';f.write_text('a'*40)
   before=s.licenses(t);f.write_text('b'*40);self.assertNotEqual(before,s.licenses(t))
 def test_overlay_only_release_remove_both_variants(self):
  with tempfile.TemporaryDirectory() as t:
   digest=o.overlay(t);self.assertEqual(len(digest),64);p=pathlib.Path(t,'app/src/release/AndroidManifest.xml');r=ET.fromstring(p.read_bytes())
   self.assertEqual([n.tag for n in r],['uses-permission','uses-permission-sdk-23'])
   for n in r:self.assertEqual(n.attrib,{'{'+o.ANDROID+'}name':o.PERMISSION,'{'+o.TOOLS+'}node':'remove'})
   with self.assertRaises(ValueError):o.overlay(t)
 def test_apk_permission_check_not_source_assumption(self):
  prefix='package: com.snapscore.app\n'
  self.assertFalse(o.verify_permissions(prefix+"uses-permission: name='android.permission.CAMERA'",'com.snapscore.app')['internetPermissionPresent'])
  for text in ['',prefix+"uses-permission: name='android.permission.INTERNET'",prefix+"uses-permission-sdk-23: name='android.permission.INTERNET'",prefix+'unknown',prefix.replace('com.snapscore','com.other')]:
   with self.assertRaises(ValueError):o.verify_permissions(text,'com.snapscore.app')
 def test_build_checks_before_return_install_and_no_acceptance_command(self):
  text=pathlib.Path(g.__file__).read_text();self.assertLess(text.index('network=offline_apk.verify_permissions'),text.index('return apk,binding'))
  text=pathlib.Path(s.__file__).read_text();self.assertNotIn('--licenses',text);self.assertNotIn('sudo',text);self.assertIn('stdin=subprocess.DEVNULL',text)
if __name__=='__main__':unittest.main()
