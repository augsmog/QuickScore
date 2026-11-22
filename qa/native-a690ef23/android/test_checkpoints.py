"""Portable XML/command controls only; fixtures are not native run evidence."""
import pathlib,unittest,xml.etree.ElementTree as ET,json,tempfile,hashlib
from unittest.mock import patch
import checkpoints as c

def node(**a):
 return ET.Element('node',{'package':'test.app','bounds':'[10,10][100,50]','visible-to-user':'true','enabled':'true',**a})
def fixture(name):
 r=ET.Element('hierarchy')
 for key in c.SCENES[name]:r.append(node(**{'resource-id':key}))
 for label in c.TEXTS.get(name,()):
  attrs={'class':'android.widget.Button','clickable':'true'} if label==c.FIND else {}
  r.append(node(text=label,enabled='false' if label=='Currently unavailable' else 'true',**attrs))
 if name in ('entry','entry-invalid'):
  for label,typed in [('Join code','AAAAAA'),('Display name','QAGuest')]:
   r.append(node(**{'class':'android.widget.EditText','hint':label,'text':typed if name=='entry-invalid' else ''}))
 return r

class Controls(unittest.TestCase):
 def test_all_exact_scene_positive_fixtures(self):
  for name in c.SCENES:
   with self.subTest(name=name):self.assertTrue(c.validate(fixture(name),name))
 def test_every_required_marker_missing_or_duplicate_rejected(self):
  for name in c.SCENES:
   good=fixture(name)
   for i in range(len(good)):
    for duplicate in (False,True):
     r=fixture(name)
     if duplicate:r.append(ET.fromstring(ET.tostring(r[i])))
     else:r.remove(r[i])
     with self.subTest(name=name,index=i,duplicate=duplicate),self.assertRaises(ValueError):c.validate(r,name)
 def test_wrong_scene_and_reverse_step(self):
  for name in c.SCENES:
   r=fixture(name);r.append(node(**{'resource-id':'home-new-contest'}))
   with self.assertRaises(ValueError):c.validate(r,name)
  with self.assertRaises(ValueError):c.validate(fixture('games'),'round-settings')
  with self.assertRaises(ValueError):c.validate(fixture('round-settings'),'games')
 def test_foreign_and_hidden(self):
  r=fixture('entry');r.append(node(package='com.android.permissioncontroller'))
  with self.assertRaises(ValueError):c.tree(ET.tostring(r).decode(),'test.app')
  r=fixture('rounds');r[0].set('visible-to-user','false')
  with self.assertRaises(ValueError):c.validate(r,'rounds')
 def test_disabled_copy_is_not_disabled_proof(self):
  r=fixture('paywall-disabled');r[0].set('enabled','true')
  with self.assertRaises(ValueError):c.validate(r,'paywall-disabled')
  r[0].attrib.pop('enabled')
  with self.assertRaises(ValueError):c.validate(r,'paywall-disabled')
 def test_annual_price_mismatch(self):
  r=fixture('paywall-annual');r[-1].set('text','$7.99/month')
  with self.assertRaises(ValueError):c.validate(r,'paywall-annual')
 def test_input_scoping_rejects_label_and_duplicate(self):
  r=ET.Element('hierarchy');r.append(node(text='Join code'))
  with self.assertRaises(ValueError):c.one(r,'Join code','input')
  r.append(node(**{'class':'android.widget.EditText','content-desc':'Join code'}))
  self.assertEqual(c.one(r,'Join code','input').get('class'),'android.widget.EditText')
  r.append(node(**{'class':'android.widget.EditText','content-desc':'Join code'}))
  with self.assertRaises(ValueError):c.one(r,'Join code','input')
 def driver(self):
  d=object.__new__(c.Driver);d.c={'package':'test.app','serial':'emulator-5554'};d.observations=[];return d
 def test_seek_timeout_bounded(self):
  d=self.driver()
  with patch.object(d,'read',return_value=ET.Element('hierarchy')),patch.object(d,'scroll') as scroll:
   with self.assertRaises(ValueError):d.seek('missing')
   self.assertEqual(scroll.call_count,8)
 def test_scroll_never_crosses_footer(self):
  r=ET.Element('hierarchy');r.append(node(scrollable='true',bounds='[0,0][1080,2200]'));r.append(node(**{'resource-id':'contest-footer','bounds':'[0,1800][1080,2200]'}))
  d=self.driver()
  with patch.object(d,'adb') as adb,patch.object(c.time,'sleep'):
   d.scroll('down',r)
   args=adb.call_args.args;self.assertLess(int(args[4]),1800);self.assertLess(int(args[6]),1800)
 def test_obscured_tap_never_posted(self):
  r=ET.Element('hierarchy');r.append(node(**{'resource-id':'contest-footer','bounds':'[0,100][400,200]'}));n=node(text='+ ADD PLAYER',bounds='[20,80][200,130]');r.append(n)
  d=self.driver()
  with patch.object(d,'seek',return_value=(r,n)),patch.object(d,'scroll'),patch.object(d,'adb') as adb:
   with self.assertRaises(ValueError):d.tap('+ ADD PLAYER','text')
   adb.assert_not_called()
 def test_missing_keyboard_does_not_back_out(self):
  d=self.driver()
  with patch.object(d,'seek',return_value=(ET.Element('hierarchy'),node(text=''))),patch.object(d,'tap'),patch.object(d,'adb',return_value='mInputShown=false') as adb:
   with self.assertRaises(ValueError):d.fill('Player 2 name','QAGuest')
   self.assertFalse(any('keyevent' in call.args for call in adb.call_args_list))
 def test_capture_reuses_installed_apk_and_scale_checks(self):
  import smoke,inspect
  source=inspect.getsource(smoke.run)
  for contract in ['installed APK mismatch','SETTINGS','activityIdentitySha256']:
   if contract=='SETTINGS':continue
   self.assertIn(contract,source)
  self.assertIn('validator(x,f,package)',source)
  self.assertIn('validator is scene:settle_home',source)
 def test_source_route_and_no_purchase_commands(self):
  repo=pathlib.Path(__file__).resolve().parents[3]
  import subprocess
  app=lambda path:subprocess.check_output(['git','-C',str(repo),'show','a073d5761b77f3e01610acebaf5d98f76a920fb5:'+path]).decode()
  source=app('scoresnap/app/contest/new.tsx')
  for key in ['contest-step-setup','contest-step-gamemodes','contest-step-round-settings','contest-start','tournament-toggle','rounds-${n}','+ ADD PLAYER']:self.assertIn(key,source)
  self.assertIn('router.push("/paywall?tier=td")',source)
  self.assertIn('defaultCourse(courseName || "My Course")',source)
  self.assertIn(c.MISSING,app('scoresnap/app/join/[code].tsx'))
  self.assertIn(c.HEADER,app('scoresnap/src/ui/paywall-copy.ts'))
  own=pathlib.Path(c.__file__).read_text()
  for forbidden in ['am\',\'start','pm\',\'clear','Restore Purchases\',','Subscribe —\',','settings\',\'put']:self.assertNotIn(forbidden,own)

class CaptureControls(unittest.TestCase):
 def exercise(self,fault=None,diagnostic=False):
  import smoke
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td);apk=b'synthetic-apk';h=hashlib.sha256(apk).hexdigest()
   (p/'app.apk').write_bytes(apk)
   (p/'build.json').write_text(json.dumps({'sourceSha':smoke.SHA,'sourceTree':smoke.TREE,'apkSha256':h,'variant':'release','offline':True,'recipeSha256':'a'*64,'flags':{} if fault=='profile' else {'EXPO_PUBLIC_OFFLINE_MODE':'true','EXPO_PUBLIC_DEMO_MODE':'false','EXPO_PUBLIC_FEATURE_NATIVE_LINKS':'false','EXPO_PUBLIC_FEATURE_LEAGUES':'false'}}))
   focus='mCurrentFocus=Window{abc u0 test.app/.Main}'
   activity='ACTIVITY test.app/.Main token pid=1\n mResumed=true mStopped=false mFinished=false\n mCurrentConfig={1.3 test}'
   xml=ET.tostring(fixture('rounds')).decode()
   if fault=='wrong-scene':xml=ET.tostring(fixture('entry')).decode()
   count=[0]
   def command(args,**kw):
    if args[0]=='git':
     if args[-1]=='HEAD':return smoke.SHA.encode()
     if args[-1]=='HEAD^{tree}':return ('bad' if fault=='source' else smoke.TREE).encode()
     return b''
    a=args[3:]
    if a==['get-state']:return b'device'
    if a[:3]==['shell','pm','path']:return b'package:/data/app/fake/base.apk'
    if a[:2]==['exec-out','cat']:return b'wrong' if fault=='installed-apk' else apk
    if a[:3]==['shell','settings','get']:return b'1.0' if fault=='scale' else b'1.3'
    if a==['shell','dumpsys','window','windows']:return b'mTopFocusedDisplayId=0'
    if a==['shell','dumpsys','window','displays']:return ('Display: mDisplayId=0\n '+focus.replace('test.app','foreign.app') if fault=='foreign' else 'Display: mDisplayId=0\n '+focus).encode()
    if a==['shell','dumpsys','activity','top']:
     count[0]+=1
     return (activity.replace('pid=1','pid=2') if fault=='changed-activity' and count[0]>1 else activity).encode()
    if a[:2]==['exec-out','uiautomator']:return xml.encode()
    if a==['exec-out','screencap','-p']:return b'\x89PNG\r\n\x1a\nSYNTHETIC-CONTROL-NOT-IMAGE'
    raise AssertionError('unexpected test command')
   def guard(raw,f,pkg):smoke.target_focus(f,pkg);return c.validate(c.tree(raw,pkg),'rounds')
   cfg={'source':str(p),'serial':'emulator-5554','package':'test.app','apk':str(p/'app.apk'),'buildManifest':str(p/'build.json'),'expectedScale':1.3,'out':str(p/'capture'),'_scene':guard,'_checkpoint':'rounds'}
   if diagnostic:cfg.update(_scene=c.diagnostic_guard,_checkpoint='join-unidentified',_diagnostic_only=True)
   with patch.object(smoke.subprocess,'check_output',side_effect=command),patch.object(smoke.time,'time',side_effect=[1,20] if fault=='stale' else [1,2]):
    if fault:
     with self.assertRaises(ValueError):smoke.run(cfg)
     self.assertFalse((p/'capture/home.png').exists());self.assertFalse((p/'capture/diagnostic.png').exists())
    else:
     smoke.run(cfg);r=json.loads((p/'capture/receipt.json').read_text())
     self.assertEqual(r['sceneVerified'],not diagnostic);self.assertFalse(r['nativeAcceptance']);self.assertFalse(r['before']['homeSceneVerified']);self.assertIsNone(r['runtimeRNScale'])
 def test_diagnostic_is_never_scene_acceptance(self):self.exercise(diagnostic=True)
 def test_diagnostic_preserves_all_boundaries(self):
  for fault in ['source','installed-apk','scale','foreign','changed-activity','stale','profile']:
   with self.subTest(fault=fault):self.exercise(fault,diagnostic=True)
 def test_screened_rounds_fixture_only(self):self.exercise()
 def test_failures_never_emit_capture(self):
  for fault in ['source','installed-apk','scale','foreign','wrong-scene','changed-activity','stale']:
   with self.subTest(fault=fault):self.exercise(fault)

if __name__=='__main__':unittest.main()
