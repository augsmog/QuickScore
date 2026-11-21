import unittest,tempfile,pathlib
from provision import host_guard,plan,licenses,PACKAGES
class Provision(unittest.TestCase):
 def env(self):return dict(GITHUB_ACTIONS='true',RUNNER_ENVIRONMENT='github-hosted',RUNNER_OS='Linux',RUNNER_ARCH='X64',GITHUB_REPOSITORY='augsmog/QuickScore',ImageOS='ubuntu26',ImageVersion='20261116.88.1')
 def test_allow_actual_host_identity(self):host_guard(self.env(),dict(ID='ubuntu',VERSION_ID='26.04'),'/usr/local/lib/android/sdk')
 def test_reject_other_contexts(self):
  for k,v in [('RUNNER_ENVIRONMENT','self-hosted'),('RUNNER_OS','macOS'),('GITHUB_ACTIONS','false'),('GITHUB_REPOSITORY','other/repo'),('ImageOS','ubuntu24'),('ImageVersion','')]:
   with self.assertRaises(ValueError):host_guard({**self.env(),k:v},dict(ID='ubuntu',VERSION_ID='26.04'),'/usr/local/lib/android/sdk')
  with self.assertRaises(ValueError):host_guard(self.env(),dict(ID='ubuntu',VERSION_ID='26.04'),'/tmp/sdk')
 def test_exact_missing_only(self):
  with tempfile.TemporaryDirectory() as d:
   self.assertEqual(plan(d),list(PACKAGES))
   for f in PACKAGES.values():p=pathlib.Path(d)/f;p.parent.mkdir(parents=True,exist_ok=True);p.touch()
   self.assertEqual(plan(d),[])
 def test_existing_license_required_not_created(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):licenses(d)
   self.assertFalse((pathlib.Path(d)/'licenses').exists())
   p=pathlib.Path(d)/'licenses';p.mkdir();(p/'android-sdk-license').write_text('')
   with self.assertRaises(ValueError):licenses(d)
   (p/'android-sdk-license').write_text('a'*40+'\n');self.assertIn('android-sdk-license',licenses(d))
 def test_no_acceptance_or_unbounded_install_command(self):
  s=(pathlib.Path(__file__).parent/'provision.py').read_text()
  self.assertIn('stdin=subprocess.DEVNULL',s);self.assertNotIn("'--licenses'",s);self.assertIn("'--install',*missing",s)
