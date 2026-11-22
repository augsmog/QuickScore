"""Portable mocked ADB and APK controls. Never accesses a device or the SDK."""
import hashlib,json,pathlib,subprocess,tempfile,unittest,sys,os
from unittest.mock import patch
import adb_boundary as a

BOOT='11111111-2222-4333-8444-555555555555'
ORIGINAL='1.15'
APK=b'private synthetic APK bytes'
PATH='package:/data/app/private-install-id/base.apk'
def offline():
 return subprocess.CalledProcessError(1,['adb','private argv'],output=b'',stderr=b'adb: device offline\n')

class Controls(unittest.TestCase):
 def run_case(self,d):return a.Boundary('/known/adb','emulator-5554',{},pathlib.Path(d))
 def fake(self,b):
  self.writes=[];self.scale=ORIGINAL;self.boot=BOOT
  self.state=[]
  def cmd(*args,**kw):
   if args==a.STATE:
    value=self.state.pop(0) if self.state else 'device'
    if isinstance(value,Exception):raise value
    return value
   if args in (a.READY,a.EMU):return '1'
   if args==a.BOOT:return self.boot
   if args==(*a.FONT,'get','system','font_scale'):return self.scale
   if args[:5]==(*a.FONT,'put','system','font_scale'):
    self.writes.append(args[-1]);self.scale=args[-1];return ''
   if args==('shell','pm','path','test.app'):return PATH
   if args==('exec-out','cat',PATH[8:]) and kw.get('binary'):return APK
   raise AssertionError('Unexpected probe')
  return patch.object(b,'run',side_effect=cmd)
 def data(self,b):return json.loads(b.receipt.read_text())
 def test_prebuild_proves_two_explicit_settings_then_exact_restore(self):
  with tempfile.TemporaryDirectory() as d:
   b=self.run_case(d)
   with self.fake(b):b.prebuild()
   self.assertEqual(self.writes,['1.0','1.3',ORIGINAL])
   self.assertEqual(self.scale,ORIGINAL)
   self.assertTrue(self.data(b)['scaleRestores'][0]['restored'])
 def test_primary_admission_error_and_secondary_offline_remain_separate(self):
  with tempfile.TemporaryDirectory() as d:
   b=self.run_case(d);b.phase='home-admission-1.0'
   primary=ValueError('untrusted private primary message')
   with patch.object(b,'font',side_effect=offline()):
    with self.assertRaises(ValueError) as e:
     with b.restore_guard('capture-font-restore',ORIGINAL):raise primary
   self.assertIs(e.exception,primary)
   receipt=self.data(b)
   self.assertEqual(receipt['firstFailure'],{'stage':'home-admission-1.0','errorType':'ValueError'})
   self.assertEqual(receipt['scaleRestores'][0]['reason'],'DEVICE_OFFLINE')
   self.assertFalse(receipt['scaleRestores'][0]['restored'])
   self.assertNotIn('private',b.receipt.read_text())
 def test_unexpected_reboot_refuses_scale_write_or_restore_on_replacement(self):
  with tempfile.TemporaryDirectory() as d:
   b=self.run_case(d)
   with self.fake(b):
    b.prebuild();self.writes=[]
    self.boot='00000000-2222-4333-8444-555555555555'
    with self.assertRaisesRegex(ValueError,'BOOT_ID'):
     with b.restore_guard('capture-font-restore',ORIGINAL):b.font('1.0')
   self.assertEqual(self.writes,[])
   self.assertFalse(self.data(b)['scaleRestores'][-1]['restored'])
 def test_passive_same_serial_recovery_requires_source_and_installed_hash(self):
  with tempfile.TemporaryDirectory() as d:
   b=self.run_case(d)
   with self.fake(b),patch.object(b,'installed_digest',return_value=hashlib.sha256(APK).hexdigest()),patch.object(a.time,'sleep'),patch.object(a.subprocess,'check_output',side_effect=[b'sha',b'tree',b'']):
    b.prebuild();self.writes=[];self.state=[offline(),'device']
    b.post_install(d,'sha','tree','test.app',hashlib.sha256(APK).hexdigest())
   self.assertEqual(self.writes,[])
   self.assertEqual(self.data(b)['postInstall'],{'attempts':2,'sameBoot':True,'originalScaleVerified':True,'sourceAndInstalledApkVerified':True})
 def test_permanent_offline_is_bounded_and_never_restarts_or_changes_scale(self):
  with tempfile.TemporaryDirectory() as d:
   b=self.run_case(d);b.original=ORIGINAL
   with self.fake(b) as mock,patch.object(a.time,'sleep'):
    self.state=[offline() for _ in range(5)]
    with self.assertRaises(subprocess.CalledProcessError):b.post_install(d,'sha','tree','test.app','bad')
   self.assertEqual(len(mock.call_args_list),5)
   self.assertTrue(all(call.args==a.STATE for call in mock.call_args_list))
   self.assertEqual(self.writes,[])
   self.assertEqual(self.data(b)['firstFailure']['reason'],'DEVICE_OFFLINE')
 def test_only_allowlisted_output_is_kept_in_receipt(self):
  with tempfile.TemporaryDirectory() as d:
   b=self.run_case(d)
   b.log(a.BOOT,stdout=BOOT.encode())
   b.log(('shell','pm','path','test.app'),stdout=PATH.encode())
   b.log(a.STATE,error=offline())
   b.log(('shell','dumpsys','activity','top'),error=subprocess.CalledProcessError(1,['private'],stderr=b'Permission denial sensitive-info'))
   b.log((*a.FONT,'get','system','font_scale'),stdout=b'1.3\n')
   raw=b.receipt.read_text()
   self.assertIn('adb: device offline',raw);self.assertIn('"stdout": "1.3"',raw)
   for value in (BOOT,PATH,'private','sensitive-info','dumpsys'):self.assertNotIn(value,raw)
 def test_stream_hash_and_bounds(self):
  cmd=[sys.executable,'-c',"import sys;sys.stdout.buffer.write(b'x'*100000)"]
  self.assertEqual(a.bounded_read(cmd,os.environ,5,100000,True),hashlib.sha256(b'x'*100000).hexdigest())
  with self.assertRaisesRegex(ValueError,'BOUND'):a.bounded_read(cmd,os.environ,5,99999,True)
  with self.assertRaises(subprocess.TimeoutExpired):a.bounded_read([sys.executable,'-c','import time;time.sleep(5)'],os.environ,.05)
 def test_empty_and_stderr_bound(self):
  with self.assertRaisesRegex(ValueError,'APK'):a.bounded_read([sys.executable,'-c','pass'],os.environ,5,10,True)
  with self.assertRaisesRegex(ValueError,'BOUND'):a.bounded_read([sys.executable,'-c',"import sys;sys.stderr.write('x'*4097)"],os.environ,5)
if __name__=='__main__':unittest.main()
