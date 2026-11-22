import unittest
from transport import policy
class Transport(unittest.TestCase):
 def test_release_default_and_explicit(self):
  m='E: manifest\n  E: application\n    A: android:label(0x1)="test"\n'
  self.assertFalse(policy(m,"targetSdkVersion:'36'")['defaultCleartextPermitted'])
  for raw,want in [('0xffffffff',True),('0x0',False)]:
   self.assertIs(policy(m+'    A: android:usesCleartextTraffic(0x1)=(type 0x12)'+raw,"targetSdkVersion:'36'")['defaultCleartextPermitted'],want)
 def test_no_guess_for_custom_policy_duplicate_or_bad(self):
  for m in ['', '  E: application\n    A: android:networkSecurityConfig(0x1)=@ref', '  E: application\n    A: android:usesCleartextTraffic(0x1)=unknown','  E: application\n  E: application']:
   self.assertIsNone(policy(m,"targetSdkVersion:'36'")['defaultCleartextPermitted'])
  self.assertFalse(policy('', '')['effectiveNetworkPolicyVerified'])
