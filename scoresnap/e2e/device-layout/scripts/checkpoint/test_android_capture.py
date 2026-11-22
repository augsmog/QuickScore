import importlib.util,pathlib,tempfile,unittest,struct,zlib
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('capture',pathlib.Path(__file__).with_name('android_capture.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def chunk(k,p):return struct.pack('>I',len(p))+k+p+struct.pack('>I',zlib.crc32(k+p)&0xffffffff)
def png():return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0'+b'\0'*6+b'\0'+b'\0'*6))+chunk(b'IEND',b'')
XML=b'<hierarchy><node package="com.scoresnap.app" resource-id="home-new-contest" enabled="true" bounds="[0,0][2,2]"/></hierarchy>'
B={'source_sha':'1'*40,'source_tree':'2'*40,'apk_sha256':'3'*64,'pixel_size':[2,2]}
class Device:
 def __init__(self):self.calls=[];self.fail=None;self.changed=False;self.image=png();self.xml=XML
 def call(self,k):
  self.calls.append(k)
  if self.fail==k:raise m.Failure(k)
 def identity(self):self.call('identity');return 'boot'
 def installed(self):self.call('installed');return B['apk_sha256']
 def foreground(self):self.call('foreground')
 def hierarchy(self):
  self.call('hierarchy');return self.xml+(b' ' if self.changed and self.calls.count('hierarchy')>1 else b'')
 def screenshot(self):self.call('screenshot');return self.image
class Tests(unittest.TestCase):
 def invoke(self,d,b=None):
  with tempfile.TemporaryDirectory() as tmp:
   out=pathlib.Path(tmp)/'evidence'
   try:return m.capture(d,b or B,'home',out)
   except Exception:
    self.assertFalse(out.exists());raise
 def test_positive_is_never_gate_acceptance(self):
  r=self.invoke(Device());self.assertEqual(r['native_gate'],'INCOMPLETE');self.assertEqual(r['scale_admission'],'UNRUN')
 def test_every_command_failure_stops_without_capture(self):
  for phase in ['identity','installed','foreground','hierarchy','screenshot']:
   with self.subTest(phase=phase):
    d=Device();d.fail=phase
    with self.assertRaises(m.Failure):self.invoke(d)
    self.assertEqual(d.calls[-1],phase)
 def test_scene_missing_duplicate_foreign_mixed_empty(self):
  for xml in [b'<hierarchy/>',XML.replace(b'</hierarchy>',XML+b'</hierarchy>'),XML.replace(b'com.scoresnap.app',b'com.android.systemui'),XML.replace(b'</hierarchy>',b'<node resource-id="contest-step-setup"/></hierarchy>'),XML.replace(b'[2,2]',b'[0,0]')]:
   d=Device();d.xml=xml
   with self.assertRaises(m.Failure):self.invoke(d)
   self.assertNotIn('screenshot',d.calls)
 def test_changed_scene_after_capture_rejected(self):
  d=Device();d.changed=True
  with self.assertRaises(m.Failure):self.invoke(d)
 def test_inset_or_keyboard_transition_rejects_capture(self):
  for key,changed in [('safeArea',{'top':25}),('keyboard',{'visible':True})]:
   d=Device();count=0
   def foreground():
    nonlocal count
    count+=1
    d.observation={'safeArea':{'top':24},'keyboard':{'visible':False}}
    if count>1:d.observation[key]=changed
   with patch.object(d,'foreground',side_effect=foreground),self.assertRaises(m.Failure):self.invoke(d)
 def test_bad_png_no_fallback(self):
  for image in [b'',b'clipboard',png()[:-1],png()+b'old',png().replace(b'IDAT',b'FAIL')]:
   d=Device();d.image=image
   with self.assertRaises(m.Failure):self.invoke(d)
 def test_wrong_apk_and_viewport(self):
  for key,value in [('apk_sha256','4'*64),('pixel_size',[3,3]),('source_sha','bad')]:
   with self.assertRaises(m.Failure):self.invoke(Device(),{**B,key:value})
 def test_foreground_default_display_and_unique_activity(self):
  a=m.Android('emulator-5554',m.PACKAGE+'/.MainActivity')
  w=b'mTopFocusedDisplayId=0';d=b'Display: mDisplayId=0\n mCurrentFocus=Window{abc u0 com.scoresnap.app/.MainActivity}';r=b'mResumedActivity: ActivityRecord{abc u0 com.scoresnap.app/.MainActivity t1}'
  with patch.object(a,'run',side_effect=[w,d,r]):a.foreground()
  for records in [[w.replace(b'=0',b'=1'),d,r],[w,d+d,r],[w,d,r+r],[w,d.replace(b'com.scoresnap.app',b'com.android.systemui'),r]]:
   with patch.object(a,'run',side_effect=records),self.assertRaises(m.Failure):a.foreground()
 def test_command_timeout_and_nonzero(self):
  a=m.Android('emulator-5554',m.PACKAGE+'/.MainActivity')
  with patch.object(m.subprocess,'run',side_effect=m.subprocess.TimeoutExpired('adb',25)),self.assertRaises(m.Failure):a.screenshot()
  with patch.object(m.subprocess,'run',return_value=m.subprocess.CompletedProcess([],1,b'private',b'private')),self.assertRaises(m.Failure):a.screenshot()
 def test_final_source_failure_publishes_nothing(self):
  with tempfile.TemporaryDirectory() as tmp:
   out=pathlib.Path(tmp)/'result'
   def reject():raise m.Failure('source')
   with self.assertRaises(m.Failure):m.capture(Device(),B,'home',out,reject)
   self.assertFalse(out.exists())
 def test_boot_or_installed_identity_change(self):
  for method,values in [('identity',['boot','other']),('installed',[B['apk_sha256'],'4'*64])]:
   d=Device()
   with patch.object(d,method,side_effect=values),self.assertRaises(m.Failure):self.invoke(d)
 def test_existing_output_not_overwritten(self):
  with tempfile.TemporaryDirectory() as tmp:
   with self.assertRaises(m.Failure):m.capture(Device(),B,'home',tmp)
 def test_source_and_apk_controls(self):
  with tempfile.TemporaryDirectory() as tmp:
   apk=pathlib.Path(tmp)/'a.apk';apk.write_bytes(b'synthetic')
   b={**B,'apk_sha256':m.digest(b'synthetic')}
   def result(v):return m.subprocess.CompletedProcess([],0,v.encode(),b'')
   with patch.object(m.subprocess,'run',side_effect=[result(B['source_sha']),result(B['source_tree']),result('')]):m.verify_inputs(tmp,apk,b)
   for values in [['0'*40], [B['source_sha'],'0'*40], [B['source_sha'],B['source_tree'],'dirty']]:
    with patch.object(m.subprocess,'run',side_effect=[result(v) for v in values]),self.assertRaises(m.Failure):m.verify_inputs(tmp,apk,b)
if __name__=='__main__':unittest.main()
