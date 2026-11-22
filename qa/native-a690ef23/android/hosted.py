"""Exact-source disposable Android build/install/smoke; never a full gate pass."""
import contextlib,hashlib,json,os,pathlib,re,shutil,signal,subprocess,time,sys
from adb_boundary import Boundary
from smoke import run as smoke
from provision import ensure
from transport import inspect as inspect_transport
GRADLE_JVM='-Xmx3072m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8'
# The hosted job still has its independent 30-minute workflow hard stop.
GRADLE_RELEASE_TIMEOUT_S=1200
GRADLE_PROGRESS_INTERVAL_S=30
GRADLE_TASK_RE=re.compile(rb'^> Task (:[A-Za-z0-9_.:\-\[\]]{1,180})(?: (?:UP-TO-DATE|FROM-CACHE|NO-SOURCE|SKIPPED|FAILED))?$')
def gradle_args():
 return ['bash','./gradlew',':app:assembleRelease','-PreactNativeArchitectures=x86_64','-Pandroid.builder.sdkDownload=false','--no-daemon','--no-build-cache','--max-workers=2','--no-parallel','-Dorg.gradle.jvmargs='+GRADLE_JVM]
def memory_budget(raw):
 match=re.search(r'^MemAvailable:\s+(\d+) kB$',raw,re.M)
 if not match or int(match[1])<8*1024*1024:raise ValueError('ANDROID_BUILD_MEMORY_BUDGET_UNAVAILABLE')
 return {'heapMiB':3072,'metaspaceMiB':1024,'maxWorkers':2,'parallel':False,'minimumAvailableMiB':8192}
def release_progress(log_path,receipt_path):
 def emit(status,elapsed,timeout):
  tasks=[]
  try:
   with log_path.open('rb') as f:
    size=f.seek(0,2)
    f.seek(max(0,size-65536))
    if size>65536:f.readline() # discard possible partial first record
    for line in f.read(65536).splitlines():
     task=GRADLE_TASK_RE.fullmatch(line.strip())
     if task:tasks.append(task[1].decode('ascii'))
   evidence={'phase':'gradle-release','status':status,'elapsedSeconds':round(elapsed,1),
             'timeoutSeconds':timeout,'recentTasks':tasks[-8:]}
   # Avoid partially written receipts if the workflow itself is interrupted.
   temp=receipt_path.with_suffix('.tmp')
   temp.write_text(json.dumps(evidence)+'\n')
   temp.replace(receipt_path)
   print('android-build: '+json.dumps(evidence),flush=True)
  except OSError:
   print('android-build: progress receipt unavailable',flush=True)
 return emit

def run_process(args,env,cwd,log,timeout,progress=None):
 p=subprocess.Popen(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 # Non-monitored commands retain the original single wait and owned-group cleanup.
 if progress is None:
  try:return p.wait(timeout)
  except subprocess.TimeoutExpired:
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   p.wait(timeout=10)
   raise
 started=time.monotonic()
 while True:
  remaining=max(0,timeout-(time.monotonic()-started))
  try:rc=p.wait(min(remaining,GRADLE_PROGRESS_INTERVAL_S))
  except subprocess.TimeoutExpired as error:
   elapsed=time.monotonic()-started
   if elapsed<timeout:
    if progress:progress('running',elapsed,timeout)
    continue
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   try:p.wait(timeout=10)
   finally:
    if progress:progress('timeout',elapsed,timeout)
   raise subprocess.TimeoutExpired(args,timeout) from error
  if progress:progress('completed' if rc==0 else 'failed',time.monotonic()-started,timeout)
  return rc
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
 try:cmd(gradle_args(),'gradle-release',GRADLE_RELEASE_TIMEOUT_S,app/'android')
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
 boundary=Boundary(tools['adb'],serial,env,out)
 boundary.checked(boundary.prebuild)
 def cmd(args,phase,timeout=30,cwd=app):
  log_path=out/(phase+'.log')
  progress=release_progress(log_path,out/'gradle-progress.json') if phase=='gradle-release' else None
  with log_path.open('wb') as log:
   try:rc=run_process(args,env,cwd,log,timeout,progress)
   except subprocess.TimeoutExpired:raise RuntimeError(phase+' timed out') from None
   if rc:raise RuntimeError(phase+' failed; see phase log')
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
 manifest={'sourceSha':'a073d5761b77f3e01610acebaf5d98f76a920fb5','sourceTree':'3cbda6ddde720b614c0ae3c2bccef7948d805e20','apkSha256':h,'variant':'release','offline':True,'recipeSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'lockSha256':lock,'nodeVersion':nodeversion,'javaVersion':javaversion.strip(),'flags':{k:v for k,v in env.items() if k.startswith('EXPO_')},'nativeAcceptance':False}
 manifestpath=out/'build.json';manifestpath.write_text(json.dumps(manifest,indent=2)+'\n')
 (out/'apk-transport.json').write_text(json.dumps({'sourceSha':manifest['sourceSha'],'sourceTree':manifest['sourceTree'],'apkSha256':h,'aggregatePass':False,**inspect_transport(pathlib.Path(sdk)/'build-tools/36.0.0/aapt',apk)},indent=2)+'\n')
 cmd([tools['adb'],'-s',serial,'install','-r',str(apk)],'install',60)
 boundary.checked(boundary.post_install,source,manifest['sourceSha'],manifest['sourceTree'],package,h)
 return boundary.checked(run_scales,boundary.run,package,{'source':str(source),'serial':serial,'package':package,'apk':str(apk),'buildManifest':str(manifestpath)},out,h,boundary)

@contextlib.contextmanager
def restore_scale(adb,original):
 primary=None
 try:yield
 except BaseException as error:primary=error;raise
 finally:
  try:adb('shell','settings','put','system','font_scale',original)
  except Exception:
   if primary is None:raise

def run_scales(adb,package,base,out,apk_hash,boundary=None):
 from checkpoints import journey,SupplementalJourneyBlocked
 # No reset of persisted app data: ordinary process cold-start and verified Home
 # are required afresh before any next-scale supplemental action.
 original=boundary.original if boundary else adb('shell','settings','get','system','font_scale')
 if not re.fullmatch(r'\d+(?:\.\d+)?',original):raise ValueError('cannot safely restore original font scale')
 results=[];failures=[]
 with boundary.restore_guard('capture-font-restore',original) if boundary else restore_scale(adb,original):
  for value in [1.0,1.3]:
   if boundary:
    boundary.phase='capture-font-'+str(value);boundary.font(str(value))
    boundary.phase='capture-launch-'+str(value)
   else:adb('shell','settings','put','system','font_scale',str(value))
   adb('shell','am','force-stop',package)
   adb('shell','monkey','-p',package,'-c','android.intent.category.LAUNCHER','1')
   cfg={**base,'expectedScale':value,'out':str(out/('scale-'+str(value)))}
   if boundary:
    boundary.phase='home-admission-'+str(value);cfg['_adb_observe']=boundary.log
   # Fatal Home/provenance failures are outside the supplemental catch.
   smoke(cfg)
   results.append(value)
   for lane in ('join','wizard'):
    lane_cfg={**cfg,'out':str(out/('scale-'+str(value)+'-'+lane))}
    if boundary:boundary.phase='capture-'+lane+'-'+str(value)
    if lane=='wizard':
     # Cold process only; never clear data. A fresh authenticated Home capture
     # rechecks source/APK/foreground/scale before the independent wizard attempt.
     adb('shell','am','force-stop',package)
     adb('shell','monkey','-p',package,'-c','android.intent.category.LAUNCHER','1')
     smoke(lane_cfg)
    try:journey(lane_cfg,lane=lane)
    except SupplementalJourneyBlocked as error:
     failures.append({'scale':value,'lane':lane,'phase':error.phase,'reason':error.reason,'status':'BLOCKED'})

 (out/'smoke-summary.json').write_text(json.dumps({'observedScales':results,'apkSha256':apk_hash,'supplementalFailures':failures,'aggregatePass':False,'runtimePaywall':False,'nativeJoin':False},indent=2)+'\n')
 if failures:raise ValueError('SUPPLEMENTAL_JOURNEY_INCOMPLETE')
 return results
