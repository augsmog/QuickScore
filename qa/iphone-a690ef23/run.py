#!/usr/bin/env python3
"""Supplemental stock-category captures. Never initialized-RN/native gate proof."""
import argparse,hashlib,json,os,pathlib,re,shutil,signal,struct,subprocess,sys,tempfile,time
SHA='a073d5761b77f3e01610acebaf5d98f76a920fb5';TREE='3cbda6ddde720b614c0ae3c2bccef7948d805e20';BUNDLE='com.scoresnap.app'
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
 if scene=='paywall':
  from paywall import scene as paywall_scene
  paywall_scene(tree)
 ids=set();texts=set()
 def walk(n):
  a=n.get('attributes',{});rid=a.get('resource-id','')
  if rid:ids.add(rid)
  texts.update(a.get(k) for k in ('text','label','accessibilityText') if isinstance(a.get(k),str))
  for c in n.get('children',[]):walk(c)
 walk(tree)
 required={'home':{'home-new-contest'},'setup':{'new-contest-back','contest-continue','contest-player-3'},'paywall':{'paywall-close'},'add-player':{'contest-scroll','contest-footer','contest-continue'}}[scene]
 if not required<=ids or (scene!='home' and 'home-new-contest' in ids):raise ValueError('wrong scene or missing four-player/control identity')
 if scene=='add-player' and '+ ADD PLAYER' not in texts:raise ValueError('ADD_PLAYER_LABEL_REQUIRED')
 # Hierarchy identity is corroboration, not proof of paint/visibility. Maestro assertVisible must also succeed.
 return sorted(ids)
def apphash(root):
 rows=[]
 for p in sorted(pathlib.Path(root).rglob('*')):
  if p.is_symlink():rows.append([str(p.relative_to(root)),'link',os.readlink(p)])
  elif p.is_file():rows.append([str(p.relative_to(root)),sha(p.read_bytes())])
 if not rows:raise ValueError('empty app')
 return sha(json.dumps(rows,separators=(',',':')).encode())
def clean_npm_configs(home):
 # Distinct empty files avoid npm double-loading and inherited account config.
 paths={key:pathlib.Path(home)/name for key,name in [('NPM_CONFIG_USERCONFIG','npm-user.rc'),('NPM_CONFIG_GLOBALCONFIG','npm-global.rc')]}
 for path in paths.values():
  with path.open('x'):pass
  path.chmod(0o600)
 return {key:str(path) for key,path in paths.items()}
PHASES={'paywall','preflight','home','setup','scale','restore','cold-home','add-player'}
STEPS={'open','close-draft','prepare','tap','entry','add-third','add-fourth','capture','set-readback','return-home','restore-category','restart','reveal','activate'}
class Progress:
 def __init__(self):self.failure=None;self.restoreFailed=False
 def perform(self,phase,step,fn):
  if phase not in PHASES or step not in STEPS:raise ValueError('INVALID_DIAGNOSTIC_STEP')
  try:return fn()
  except Exception:
   if self.failure is None:self.failure={'phase':phase,'sceneStep':step}
   if phase=='restore':self.restoreFailed=True
   raise
 def receipt(self):return {'failure':self.failure,'restoreFailed':self.restoreFailed}

SETUP_GUARD='- assertVisible:\n    id: "contest-step-setup"\n- assertVisible:\n    id: "new-contest-back"\n- assertNotVisible:\n    id: "home-new-contest"\n'
def player_flow(index):
 if index not in (2,3):raise ValueError('INVALID_PLAYER_PROGRESSION')
 # Exact visible product label, regex-escaped in YAML single quotes. Reacquire each time.
 return SETUP_GUARD+f'''- assertNotVisible:\n    id: "contest-player-{index}"\n- scrollUntilVisible:\n    element:\n      text: '^\\+ ADD PLAYER$'\n    direction: DOWN\n    timeout: 12000\n    centerElement: true\n- tapOn:\n    text: '^\\+ ADD PLAYER$'\n- scrollUntilVisible:\n    element:\n      id: "contest-player-{index}"\n    direction: DOWN\n    timeout: 12000\n- assertVisible:\n    id: "contest-player-{index}"\n'''+SETUP_GUARD

def launch_pid(raw):
 match=re.fullmatch(re.escape(BUNDLE)+r': ([1-9][0-9]*)',raw.strip())
 if not match:raise ValueError('LAUNCH_PID_UNVERIFIED')
 return int(match[1])
def cold_restart(sim,udid,category,previous):
 sim('terminate',udid,BUNDLE,name='cold-terminate-'+category)
 sim('ui',udid,'content_size',category,name='cold-set-'+category)
 category_readback(sim('ui',udid,'content_size',name='cold-read-'+category),category)
 pid=launch_pid(sim('launch',udid,BUNDLE,name='cold-launch-'+category))
 if pid==previous:raise ValueError('COLD_PROCESS_ID_REUSED')
 return pid
ADD_VISIBLE="- scrollUntilVisible:\n    element:\n      text: '^\\+ ADD PLAYER$'\n    direction: DOWN\n    timeout: 12000\n    visibilityPercentage: 100\n    centerElement: true\n- assertVisible:\n    text: '^\\+ ADD PLAYER$'\n- assertVisible:\n    id: 'contest-continue'\n- assertNotVisible:\n    id: 'home-new-contest'\n"
ADD_ACTIVATE="- tapOn:\n    text: '^\\+ ADD PLAYER$'\n- scrollUntilVisible:\n    element:\n      id: 'contest-player-4'\n    direction: DOWN\n    timeout: 12000\n    visibilityPercentage: 100\n- assertVisible:\n    id: 'contest-player-4'\n- assertNotVisible:\n    id: 'contest-player-5'\n"
def run(a):
 progress=getattr(a,'progress',None) or Progress()
 return progress.perform('preflight','prepare',lambda:_run(a,progress))
def _run(a,progress):
 if sys.platform!='darwin':raise ValueError('Mac native executor required; no local emulation')
 needed=['xcrun','xcodebuild','node','npm','pod','maestro']
 tools={k:shutil.which(k) for k in needed}
 if any(not v for v in tools.values()):raise ValueError('missing installed tools: '+','.join(k for k,v in tools.items() if not v))
 out=pathlib.Path(a.out).resolve();out.mkdir(exist_ok=False)
 with tempfile.TemporaryDirectory(prefix='snapscore-iphone-') as tmp:
  tmp=pathlib.Path(tmp);home=tmp/'home';home.mkdir();src=tmp/'source'
  env={k:os.environ[k] for k in ['PATH','JAVA_HOME','LANG','TMPDIR'] if k in os.environ}
  env.update(HOME=str(home),CP_HOME_DIR=str(home/'pods'),CI='1',EXPO_OFFLINE='1',EXPO_NO_TELEMETRY='1',SENTRY_DISABLE_AUTO_UPLOAD='true',EXPO_PUBLIC_OFFLINE_MODE='true',EXPO_PUBLIC_DEMO_MODE='false',EXPO_PUBLIC_SIMULATOR_NO_MLKIT='1',EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING='true',EXPO_PUBLIC_FEATURE_LEAGUES='false',EXPO_PUBLIC_FEATURE_NATIVE_LINKS='false')
  env.update(clean_npm_configs(home))
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
  def shot(scene,label,category,assertions,process_mode='warm'):
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
    receipt={**manifest,'scene':scene,'categoryBefore':before,'categoryAfter':after,'stockRNReferenceMultiplier':CATEGORIES[category],'runtimeRNScale':None,'pngSha256':sha(b),'pixelSize':struct.unpack('>II',b[16:24]),'geometryPassed':False,'nativeAcceptance':False,'processMode':process_mode,'coldProcessVerified':process_mode=='cold'}
    file.rename(out/(label+'.png'));(out/(label+'.json')).write_text(json.dumps(receipt,indent=2)+'\n')
   except Exception:
    if file.exists():file.rename(out/(label+'.REJECTED.png'))
    raise
  home='- extendedWaitUntil:\n    visible:\n      id: "home-new-contest"\n    timeout: 30000\n'
  setup='- assertVisible:\n    id: "new-contest-back"\n- assertVisible:\n    id: "contest-player-3"\n- assertVisible:\n    id: "contest-continue"\n- assertNotVisible:\n    id: "home-new-contest"\n'
  try:
   pid=launch_pid(sim('launch',a.udid,BUNDLE,name='launch'))
   # Complete all Home comparisons before optional setup reachability work.
   for i,category in enumerate(CATEGORIES):
    progress.perform('scale','set-readback',lambda:sim('ui',a.udid,'content_size',category,name='set-category-'+str(i)))
    progress.perform('scale','set-readback',lambda:category_readback(sim('ui',a.udid,'content_size',name='verify-category-'+str(i)),category))
    progress.perform('home','capture',lambda:shot('home','home-'+category,category,home))
   for category in CATEGORIES:
    pid=progress.perform('cold-home','restart',lambda:cold_restart(sim,a.udid,category,pid))
    progress.perform('cold-home','capture',lambda:shot('home','home-cold-'+category,category,home,'cold'))
   for i,category in enumerate(CATEGORIES):
    progress.perform('scale','set-readback',lambda:sim('ui',a.udid,'content_size',category,name='setup-category-'+str(i)))
    if i:progress.perform('home','return-home',lambda:flow('- tapOn:\n    id: "new-contest-back"\n','return-home-'+str(i)))
    progress.perform('home','tap',lambda:flow(home+'- tapOn:\n    id: "home-new-contest"\n','home-tap-'+str(i)))
    progress.perform('setup','entry',lambda:flow('- extendedWaitUntil:\n    visible:\n      id: "contest-step-setup"\n    timeout: 15000\n'+SETUP_GUARD,'setup-entry-'+str(i)))
    for index,step in [(2,'add-third'),(3,'add-fourth')]:
     progress.perform('setup',step,lambda:flow(player_flow(index),step+'-'+str(i)))
    progress.perform('setup','capture',lambda:shot('setup','four-player-'+category,category,setup,'post-cold'))
    progress.perform('add-player','reveal',lambda:flow(ADD_VISIBLE,'add-visible-'+str(i)))
    progress.perform('add-player','capture',lambda:shot('add-player','add-player-'+category,category,ADD_VISIBLE,'post-cold'))
    progress.perform('add-player','activate',lambda:flow(ADD_ACTIVATE,'add-activate-'+str(i)))
    (out/('add-player-action-'+category+'.json')).write_text(json.dumps({'sourceSha':SHA,'sourceTree':TREE,'category':category,'fourPlayerCheckpointPreserved':True,'fifthPlayerVisibleAfterTap':True,'aggregatePass':False})+'\n')
   from paywall import OPEN,CLOSE,VISIBLE,REOPEN
   progress.perform('home','return-home',lambda:flow('- tapOn: {id: new-contest-back}\n','paywall-return-home'))
   for i,category in enumerate(CATEGORIES):
    progress.perform('scale','set-readback',lambda:(sim('ui',a.udid,'content_size',category,name='paywall-set-'+str(i)),category_readback(sim('ui',a.udid,'content_size',name='paywall-read-'+str(i)),category)))
    progress.perform('paywall','open',lambda:flow(OPEN if i==0 else REOPEN,'paywall-open-'+str(i)))
    progress.perform('paywall','capture',lambda:shot('paywall','paywall-'+category,category,VISIBLE,'post-cold'))
    progress.perform('paywall','close-draft',lambda:flow(CLOSE,'paywall-close-draft-'+str(i)))
    (out/('paywall-draft-'+category+'.json')).write_text(json.dumps({'sourceSha':SHA,'sourceTree':TREE,'category':category,'namesRetained':True,'twoRoundControlVisible':True,'aggregatePass':False})+'\n')
  finally:progress.perform('restore','restore-category',lambda:(sim('ui',a.udid,'content_size',original,name='restore-original-category'),category_readback(sim('ui',a.udid,'content_size',name='restored-category'),original)))
  (out/'result.json').write_text(json.dumps({'status':'SUPPLEMENTAL_STOCK_CATEGORY_CAPTURES','aggregatePass':False,'runtimeRNScaleObserved':False,'paywall':'offline-fallback-header-and-draft-only','nativeJoin':'unrun','SE3':'unrun/report-only'})+'\n')
  return 78
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',required=True);p.add_argument('--udid',required=True);p.add_argument('--out',required=True);a=p.parse_args()
 try:sys.exit(run(a))
 except Exception as e:print('BLOCKED: '+str(e),file=sys.stderr);sys.exit(78)
