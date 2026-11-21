#!/usr/bin/env python3
"""Supplemental stock-category captures. Never initialized-RN/native gate proof."""
import argparse,hashlib,json,os,pathlib,re,shutil,signal,struct,subprocess,sys,tempfile,time
SHA='a690ef23e67a255408028d81e57d40e09778c3eb';TREE='ba833845c2f2cfbacdecc3ee847e74c4fcfd90b7';BUNDLE='com.scoresnap.app'
CATEGORIES={'large':1.0,'extra-extra-large':1.235,'extra-extra-extra-large':1.353}
def sha(b):return hashlib.sha256(b).hexdigest()
def validate_source(commit,tree,dirty):
 if commit!=SHA or tree!=TREE or dirty:raise ValueError('exact clean candidate required')
def category_readback(raw,expected=None):
 value=raw.strip()
 allowed=set(CATEGORIES)|{'extra-small','small','medium','extra-large','accessibility-medium','accessibility-large','accessibility-extra-large','accessibility-extra-extra-large','accessibility-extra-extra-extra-large'}
 if value not in allowed or (expected and value!=expected):raise ValueError('missing/mismatched actual simctl category readback')
 return value

def screen(tree,scene):
 ids=set()
 def walk(n):
  a=n.get('attributes',{});rid=a.get('resource-id','')
  if rid:ids.add(rid)
  for c in n.get('children',[]):walk(c)
 walk(tree)
 required={'home':{'home-new-contest'},'setup':{'new-contest-back','contest-continue','contest-player-3'},'paywall':{'paywall-close'}}[scene]
 if not required<=ids or (scene!='home' and 'home-new-contest' in ids):raise ValueError('wrong scene or missing four-player/control identity')
 # Hierarchy identity is corroboration, not proof of paint/visibility. Maestro assertVisible must also succeed.
 return sorted(ids)
def apphash(root):
 rows=[]
 for p in sorted(pathlib.Path(root).rglob('*')):
  if p.is_symlink():rows.append([str(p.relative_to(root)),'link',os.readlink(p)])
  elif p.is_file():rows.append([str(p.relative_to(root)),sha(p.read_bytes())])
 if not rows:raise ValueError('empty app')
 return sha(json.dumps(rows,separators=(',',':')).encode())
def run(a):
 if sys.platform!='darwin':raise ValueError('Mac native executor required; no local emulation')
 needed=['xcrun','xcodebuild','node','npm','pod','maestro']
 tools={k:shutil.which(k) for k in needed}
 if any(not v for v in tools.values()):raise ValueError('missing installed tools: '+','.join(k for k,v in tools.items() if not v))
 out=pathlib.Path(a.out).resolve();out.mkdir(exist_ok=False)
 with tempfile.TemporaryDirectory(prefix='snapscore-iphone-') as tmp:
  tmp=pathlib.Path(tmp);home=tmp/'home';home.mkdir();src=tmp/'source'
  env={k:os.environ[k] for k in ['PATH','JAVA_HOME','LANG','TMPDIR'] if k in os.environ}
  env.update(HOME=str(home),CP_HOME_DIR=str(home/'pods'),NPM_CONFIG_USERCONFIG='/dev/null',NPM_CONFIG_GLOBALCONFIG='/dev/null',CI='1',EXPO_OFFLINE='1',EXPO_NO_TELEMETRY='1',SENTRY_DISABLE_AUTO_UPLOAD='true',EXPO_PUBLIC_OFFLINE_MODE='true',EXPO_PUBLIC_DEMO_MODE='false',EXPO_PUBLIC_SIMULATOR_NO_MLKIT='1',EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING='true',EXPO_PUBLIC_FEATURE_LEAGUES='false',EXPO_PUBLIC_FEATURE_NATIVE_LINKS='false')
  def call(args,name,timeout=30,cwd=None,binary=False):
   p=subprocess.Popen(args,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
   try:b,e=p.communicate(timeout=timeout)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.communicate();raise RuntimeError(name+' timed out')
   (out/(name+'.stdout')).write_bytes(b);(out/(name+'.stderr')).write_bytes(e)
   if p.returncode:raise RuntimeError(name+' failed; inspect phase logs')
   return b if binary else b.decode().strip()
  def sim(*args,name='simctl',timeout=30):return call([tools['xcrun'],'simctl',*args],name,timeout)
  xcode=call([tools['xcodebuild'],'-version'],'xcode-version')
  if 'Xcode 26.4.1' not in xcode:raise ValueError('verified recipe requires existing Xcode26.4.1')
  devices=json.loads(sim('list','devices','booted','--json',name='devices'))
  matches=[(runtime,d) for runtime,ds in devices['devices'].items() for d in ds if d['udid']==a.udid and d['name']==getattr(a,'device_name','iPhone 16 Pro') and d['state']=='Booted']
  if len(matches)!=1:raise ValueError('supplied booted disposable iPhone16Pro required')
  # Read and retain actual original category before any change. No guessing/fallback.
  original=category_readback(sim('ui',a.udid,'content_size',name='original-category'))
  existing=subprocess.run([tools['xcrun'],'simctl','get_app_container',a.udid,BUNDLE,'app'],capture_output=True,env=env,timeout=20)
  if existing.returncode==0:raise ValueError('fresh disposable simulator without existing app required')
  call(['git','init','-q',str(src)],'source-init')
  call(['git','-C',str(src),'fetch','--quiet','--depth=1',str(pathlib.Path(a.repo).resolve()),SHA],'source-export')
  call(['git','-C',str(src),'checkout','--quiet','--detach',SHA],'source-checkout')
  def git(*args):return call(['git','-C',str(src),*args],'source-'+args[0])
  validate_source(git('rev-parse','HEAD'),git('rev-parse','HEAD^{tree}'),git('status','--porcelain'))
  app=src/'scoresnap';lock=sha((app/'package-lock.json').read_bytes())
  call([tools['npm'],'ci','--no-audit','--no-fund'],'npm',300,app)
  call([tools['node'],str(app/'node_modules/expo/bin/cli'),'prebuild','--platform','ios','--no-install'],'prebuild',180,app)
  call([tools['pod'],'install'],'pods',300,app/'ios')
  if git('diff','--name-only') or sha((app/'package-lock.json').read_bytes())!=lock:raise ValueError('native generation changed tracked app/dependency inputs')
  derived=tmp/'DerivedData'
  call([tools['xcodebuild'],'-workspace','SnapScore.xcworkspace','-scheme','SnapScore','-configuration','Release','-destination','generic/platform=iOS Simulator','-derivedDataPath',str(derived),'CODE_SIGNING_ALLOWED=NO','build'],'release-build',1200,app/'ios')
  built=derived/'Build/Products/Release-iphonesimulator/SnapScore.app';digest=apphash(built)
  uuids=call([tools['xcrun'],'dwarfdump','--uuid',str(built/'SnapScore')],'binary-uuids')
  sim('install',a.udid,str(built),name='install',timeout=60)
  installed=sim('get_app_container',a.udid,BUNDLE,'app',name='installed-path')
  if apphash(pathlib.Path(installed))!=digest:raise ValueError('installed build content mismatch')
  manifest={'sourceSha':SHA,'sourceTree':TREE,'lockSha256':lock,'buildSha256':digest,'binaryUUIDs':uuids,'device':matches[0],'xcode':xcode,'recipeSha256':sha(pathlib.Path(__file__).read_bytes()),'offline':True,'runtimeRNScale':None,'aggregatePass':False}
  (out/'build.json').write_text(json.dumps(manifest,indent=2)+'\n')
  def flow(text,name):
   f=tmp/(name+'.yaml');f.write_text('appId: '+BUNDLE+'\n---\n'+text)
   call([tools['maestro'],'--device',a.udid,'test',str(f)],name,120)
  def shot(scene,label,category,assertions):
   flow(assertions,label+'-visible-before')
   hierarchy=json.loads(call([tools['maestro'],'--device',a.udid,'hierarchy'],label+'-hierarchy',30));screen(hierarchy,scene)
   before=category_readback(sim('ui',a.udid,'content_size',name=label+'-category-before'),category)
   file=out/(label+'.pending.png')
   sim('io',a.udid,'screenshot','--type=png',str(file),name=label+'-screenshot',timeout=20)
   try:
    after=category_readback(sim('ui',a.udid,'content_size',name=label+'-category-after'),category)
    flow(assertions,label+'-visible-after')
    hierarchy2=json.loads(call([tools['maestro'],'--device',a.udid,'hierarchy'],label+'-hierarchy-after',30));screen(hierarchy2,scene)
    b=file.read_bytes()
    if not b.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('invalid PNG')
    receipt={**manifest,'scene':scene,'categoryBefore':before,'categoryAfter':after,'stockRNReferenceMultiplier':CATEGORIES[category],'runtimeRNScale':None,'pngSha256':sha(b),'pixelSize':struct.unpack('>II',b[16:24]),'geometryPassed':False,'nativeAcceptance':False}
    file.rename(out/(label+'.png'));(out/(label+'.json')).write_text(json.dumps(receipt,indent=2)+'\n')
   except Exception:
    if file.exists():file.rename(out/(label+'.REJECTED.png'))
    raise
  home='- extendedWaitUntil:\n    visible:\n      id: "home-new-contest"\n    timeout: 30000\n'
  setup='- assertVisible:\n    id: "new-contest-back"\n- assertVisible:\n    id: "contest-player-3"\n- assertVisible:\n    id: "contest-continue"\n- assertNotVisible:\n    id: "home-new-contest"\n'
  try:
   sim('launch',a.udid,BUNDLE,name='launch')
   for i,category in enumerate(CATEGORIES):
    sim('ui',a.udid,'content_size',category,name='set-category-'+str(i))
    category_readback(sim('ui',a.udid,'content_size',name='verify-category-'+str(i)),category)
    if i:flow('- tapOn:\n    id: "new-contest-back"\n','return-home-'+str(i))
    shot('home','home-'+category,category,home)
    flow('- tapOn:\n    id: "home-new-contest"\n- extendedWaitUntil:\n    visible:\n      id: "new-contest-back"\n    timeout: 15000\n- scrollUntilVisible:\n    element:\n      id: "add-player"\n    direction: DOWN\n    timeout: 12000\n- tapOn:\n    id: "add-player"\n- tapOn:\n    id: "add-player"\n- scrollUntilVisible:\n    element:\n      id: "contest-player-3"\n    direction: DOWN\n    timeout: 12000\n','four-players-'+str(i))
    shot('setup','four-player-'+category,category,setup)
  finally:sim('ui',a.udid,'content_size',original,name='restore-original-category')
  (out/'result.json').write_text(json.dumps({'status':'SUPPLEMENTAL_STOCK_CATEGORY_CAPTURES','aggregatePass':False,'runtimeRNScaleObserved':False,'paywall':'unrun','nativeJoin':'unrun','SE3':'unrun/report-only'})+'\n')
  return 78
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',required=True);p.add_argument('--udid',required=True);p.add_argument('--out',required=True);a=p.parse_args()
 try:sys.exit(run(a))
 except Exception as e:print('BLOCKED: '+str(e),file=sys.stderr);sys.exit(78)
