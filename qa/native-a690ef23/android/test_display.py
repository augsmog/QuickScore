import pathlib,unittest,json
from smoke import target_focus,FocusReadbackError,scale,scene,settle_home,ActivityReadbackError,read_focus
from transport import policy
ROOT=pathlib.Path(__file__).parent
class DisplayControls(unittest.TestCase):
 def fixture(self):return 'mTopFocusedDisplayId=0\n'+(ROOT/'fixtures/api35-display.txt').read_text()
 def test_source_derived_default_display_fixture(self):
  self.assertEqual(target_focus(self.fixture(),'test.app'),'test.app/.Main')
  config='ACTIVITY test.app/.Main token pid=1\n mResumed=true mStopped=false mFinished=false\n mCurrentConfig={1.3 test}'
  self.assertEqual(scale('1.3',config,1.3,self.fixture(),'test.app'),1.3)
  for c,s in [(config.replace('mResumed=true','mResumed=false'),'1.3'),(config.replace('/.Main','/.Other'),'1.3'),(config,'1.0')]:
   with self.assertRaises((ValueError,ActivityReadbackError)):scale(s,c,1.3,self.fixture(),'test.app')
 def test_no_display_null_foreign_duplicate_and_secondary_rejected(self):
  f=self.fixture()
  for bad in [f.replace('Display: mDisplayId=0','Display: mDisplayId=1'),f+f,f+'\nDisplay: mDisplayId=1\n  mCurrentFocus=null\n',f.replace('Window{abc u0 test.app/.Main}','null'),f.replace('Window{abc u0 test.app/.Main}','Window{abc u0 com.android.systemui/.Dialog}'),f+'\n mCurrentFocus=Window{abc u0 test.app/.Main}', 'WINDOW MANAGER WINDOWS\n Window #0 Window{abc u0 test.app/.Main}', 'mCurrentFocus=Window{abc u0 test.app/.Main}\n'+f]:
   with self.assertRaises(FocusReadbackError):target_focus(bad,'test.app')
 def test_command_selects_displays_without_raw_receipt(self):
  commands=[];rows=[]
  xml='<hierarchy><node package="test.app" resource-id="home-scroll" bounds="[0,0][10,10]"/><node package="test.app" resource-id="home-new-contest" bounds="[0,0][10,10]"/></hierarchy>'
  def adb(*a):
   commands.append(a)
   if a[:2]==('shell','pidof'):return '123'
   if a==('shell','dumpsys','window','windows'):return 'mTopFocusedDisplayId=0'
   if a[:2]==('shell','dumpsys'):
    self.assertEqual(a,('shell','dumpsys','window','displays'));return self.fixture().replace('mTopFocusedDisplayId=0\n','')
   return xml
  settle_home(adb,'test.app',rows.append,lambda _:None)
  self.assertEqual(rows[0]['reason'],'READY')
  self.assertNotIn('test.app',json.dumps(rows));self.assertNotIn('123',json.dumps(rows))
  source=(ROOT/'smoke.py').read_text();self.assertIn("'window','windows'",source)
  self.assertEqual(source.count("'window','displays'"),1)
 def test_namespaced_aapt_application_and_typed_raw_boolean(self):
  f=(ROOT/'fixtures/aapt-namespaced.txt').read_text()
  p=policy(f,"targetSdkVersion:'36'")
  self.assertIs(p['declaredCleartext'],False);self.assertEqual(p['targetSdk'],36);self.assertIs(p['networkSecurityConfigPresent'],False);self.assertIs(p['defaultCleartextPermitted'],False)
  shifted='N: tools=http://schemas.android.com/tools\n'+''.join('  '+l+'\n' for l in f.splitlines())
  self.assertEqual(policy(shifted,"targetSdkVersion:'36'"),p)
 def test_aapt_nested_duplicate_malformed_and_custom_remain_unknown(self):
  f=(ROOT/'fixtures/aapt-namespaced.txt').read_text()
  for bad in [f+f,f.replace('E: uses-sdk','E: application'),f.replace('    E: application','      E: application'),f+'\n***BAD DEPTH',f.replace('0x0 (Raw: "false")','0xffffffff (Raw: "false")'),f.replace('(type 0x12)0x0 (Raw: "false")','@0x1234')]:
   self.assertIsNone(policy(bad,"targetSdkVersion:'36'")['defaultCleartextPermitted'])
  custom=f.replace('      E: activity','      A: android:networkSecurityConfig(0x1)=@0x1\n      E: activity')
  self.assertIsNone(policy(custom,"targetSdkVersion:'36'")['defaultCleartextPermitted'])

 def test_global_top_missing_foreign_duplicate_or_changed_rejected(self):
  for header in ['', 'mTopFocusedDisplayId=1', 'mTopFocusedDisplayId=0\nmTopFocusedDisplayId=0']:
   with self.assertRaises(FocusReadbackError):target_focus(header+'\n'+(ROOT/'fixtures/api35-display.txt').read_text(),'test.app')
  replies=iter(['mTopFocusedDisplayId=0',(ROOT/'fixtures/api35-display.txt').read_text(),'mTopFocusedDisplayId=1'])
  with self.assertRaises(FocusReadbackError):read_focus(lambda *args:next(replies))
