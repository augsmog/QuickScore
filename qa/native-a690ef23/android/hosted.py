"""Exact-source disposable Android build/install/smoke; never a full gate pass."""
import hashlib,json,os,pathlib,re,shutil,signal,subprocess,time,sys
from smoke import run as smoke
from provision import ensure
GRADLE_JVM='-Xmx3072m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8'
def gradle_args():
 return ['bash','./gradlew',':app:assembleRelease','-PreactNativeArchitectures=x86_64','-Pandroid.builder.sdkDownload=false','--no-daemon','--no-build-cache','--max-workers=2','--no-parallel','-Dorg.gradle.jvmargs='+GRADLE_JVM]
def memory_budget(raw):
 match=re.search(r'^MemAvailable:\s+(\d+) kB$',raw,re.M)
 if not match or int(match[1])<8*1024*1024:raise ValueError('ANDROID_BUILD_MEMORY_BUDGET_UNAVAILABLE')
 return {'heapMiB':3072,'metaspaceMiB':1024,'maxWorkers':2,'parallel':False,'minimumAvailableMiB':8192}
def run_process(args,env,cwd,log,timeout):
 p=subprocess.Popen(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:return p.wait(timeout)
 except subprocess.TimeoutExpired:
  try:os.killpg(p.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  p.wait(timeout=10)
  raise
REQ=['platforms/android-36/android.jar','build-tools/36.0.0/aapt','ndk/27.1.12297006/source.properties','cmake/3.22.1/bin/cmake']
def preflight(sdk,tools,devices):
 missing=[t for t in ['node','npm','java','adb'] if not tools.get(t)]
 missing += [p for p in REQ if not (pathlib.Path(sdk)/p).exists()]
 serials=re.findall(r'^(emulator-\d+)\s+device$',devices,re.M)
 if len(serials)!=1:missing.append('exactly one booted disposable emulator')
 if missing:raise ValueError('ANDROID_PREFLIGHT_MISSING: '+', '.join(missing))
 return serials[0]
def clean_npm_configs(home):
 # Distinct empty files avoid npm double-loading and inherited account config.
 paths={key:pathlib.Path(home)/name for key,name in [('NPM_CONFIG_USERCONFIG','npm-user.rc'),('NPM_CONFIG_GLOBALCONFIG','npm-global.rc')]}
 for path in paths.values():
  with path.open('x'):pass
  path.chmod(0o600)
 return {key:str(path) for key,path in paths.items()}
def build_release(app,out,env,cmd):
 budget=memory_budget(pathlib.Path('/proc/meminfo').read_text())
 (out/'build-resource-budget.json').write_text(json.dumps(budget)+'\n')
 try:cmd(gradle_args(),'gradle-release',1000,app/'android')
 finally:
  # --stop sees only daemons registered in this invocation's private GRADLE_USER_HOME.
  cleanup_ok=False
  try:
   with (out/'gradle-stop.log').open('wb') as log:
    cleanup_ok=run_process(['bash','./gradlew','--stop'],env,app/'android',log,30)==0
  except Exception:pass
  (out/'gradle-cleanup.json').write_text(json.dumps({'isolatedHomeOnly':True,'stopSucceeded':cleanup_ok})+'\n')
  if not cleanup_ok and sys.exc_info()[0] is None:raise RuntimeError('GRADLE_CLEANUP_INCOMPLETE')
def execute(source,out):
 source=pathlib.Path(source);out=pathlib.Path(out);app=source/'scoresnap';out.mkdir(parents=True,exist_ok=True)
 tools={t:shutil.which(t) for t in ['node','npm','java','adb']};sdk=os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME') or '/nonexistent'
 java_home=ensure(sdk,out,os.environ)
 tools['java']=str(pathlib.Path(java_home)/'bin/java')
 devices=subprocess.check_output([tools['adb'],'devices'],timeout=15).decode() if tools['adb'] else ''
 serial=preflight(sdk,tools,devices)
 nodeversion=subprocess.check_output([tools['node'],'--version'],timeout=10).decode().strip()
 javaversion=subprocess.run([tools['java'],'-version'],capture_output=True,timeout=10).stderr.decode()
 if not nodeversion.startswith('v22.') or not re.search(r'version "17[.]',javaversion):raise ValueError('ANDROID_PREFLIGHT_MISSING: Node22 and Java17 required')
 package=json.loads((app/'app.json').read_text())['expo']['android']['package']
 if not re.fullmatch('[A-Za-z][A-Za-z0-9_.]+',package):raise ValueError('invalid package')
 existing=subprocess.run([tools['adb'],'-s',serial,'shell','pm','path',package],capture_output=True,timeout=15)
 if existing.stdout.strip():raise ValueError('ANDROID_PREFLIGHT_MISSING: fresh disposable emulator without existing target app required')

 # Do not inherit account credentials, npmrc, Gradle init scripts, or product environment.
 home=source/'.git/test-home';home.mkdir();env={k:os.environ[k] for k in ['PATH','JAVA_HOME','LANG','TMPDIR'] if k in os.environ}
 env.update(JAVA_HOME=java_home,HOME=str(home),ANDROID_HOME=sdk,ANDROID_SDK_ROOT=sdk,GRADLE_USER_HOME=str(home/'gradle'),CI='1',EXPO_NO_TELEMETRY='1',EXPO_OFFLINE='1',SENTRY_DISABLE_AUTO_UPLOAD='true',EXPO_PUBLIC_SIMULATOR_NO_MLKIT='1',EXPO_PUBLIC_OFFLINE_MODE='true',EXPO_PUBLIC_DEMO_MODE='false',EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING='true',EXPO_PUBLIC_FEATURE_LEAGUES='false',EXPO_PUBLIC_FEATURE_NATIVE_LINKS='false')
 env.update(clean_npm_configs(home))
 def cmd(args,phase,timeout=30,cwd=app):
  with (out/(phase+'.log')).open('wb') as log:
   try:rc=run_process(args,env,cwd,log,timeout)
   except subprocess.TimeoutExpired:raise RuntimeError(phase+' timed out') from None
   if rc:raise RuntimeError(phase+' failed; see phase log')
 def adb(*args):return subprocess.check_output([tools['adb'],'-s',serial,*args],timeout=30,env=env).decode().strip()
 # Reuse source lockfile; no dependency/version edits. Standard public dependency resolution only.
 lock=hashlib.sha256((app/'package-lock.json').read_bytes()).hexdigest()
 cmd([tools['npm'],'ci','--no-audit','--no-fund'], 'npm-ci',300)
 cmd([tools['node'],str(app/'node_modules/expo/bin/cli'),'prebuild','--platform','android','--no-install'],'expo-prebuild',180)
 build_release(app,out,env,cmd)
 if hashlib.sha256((app/'package-lock.json').read_bytes()).hexdigest()!=lock:raise ValueError('lockfile changed')
 dirty=subprocess.check_output(['git','-C',str(source),'diff','--name-only']).decode().strip()
 if dirty:raise ValueError('prebuild changed tracked source/build inputs: '+dirty)
 apks=list((app/'android/app/build/outputs/apk/release').glob('*.apk'))
 if len(apks)!=1:raise ValueError('exactly one Release APK required')
 apk=apks[0];h=hashlib.sha256(apk.read_bytes()).hexdigest()
 package=json.loads((app/'app.json').read_text())['expo']['android']['package']
 if not re.fullmatch('[A-Za-z][A-Za-z0-9_.]+',package):raise ValueError('invalid package')
 manifest={'sourceSha':'a690ef23e67a255408028d81e57d40e09778c3eb','sourceTree':'ba833845c2f2cfbacdecc3ee847e74c4fcfd90b7','apkSha256':h,'variant':'release','offline':True,'recipeSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'lockSha256':lock,'nodeVersion':nodeversion,'javaVersion':javaversion.strip(),'flags':{k:v for k,v in env.items() if k.startswith('EXPO_')},'nativeAcceptance':False}
 manifestpath=out/'build.json';manifestpath.write_text(json.dumps(manifest,indent=2)+'\n')
 cmd([tools['adb'],'-s',serial,'install','-r',str(apk)],'install',60)
 # No fixtures or permission grants. Offline app completes onboarding through existing product behavior.
 original=adb('shell','settings','get','system','font_scale')
 if not re.fullmatch(r'\d+(?:\.\d+)?',original):raise ValueError('cannot safely restore original font scale')
 results=[]
 try:
  for value in [1.0,1.3]:
   adb('shell','settings','put','system','font_scale',str(value))
   adb('shell','am','force-stop',package)
   adb('shell','monkey','-p',package,'-c','android.intent.category.LAUNCHER','1')
   cfg={'source':str(source),'serial':serial,'package':package,'apk':str(apk),'buildManifest':str(manifestpath),'expectedScale':value,'out':str(out/('scale-'+str(value)))}
   # Bounded readiness wait; no synthetic selector/data substitution or dialog dismissal.
   last=None
   for attempt in range(6):
    try:smoke(cfg);last=None;break
    except Exception as e:last=e;time.sleep(2)
   if last:raise RuntimeError('scale '+str(value)+' failed: '+str(last))
   results.append(value)
 finally:adb('shell','settings','put','system','font_scale',original)
 (out/'smoke-summary.json').write_text(json.dumps({'observedScales':results,'apkSha256':h,'aggregatePass':False,'runtimePaywall':False,'nativeJoin':False},indent=2)+'\n')
 return results
