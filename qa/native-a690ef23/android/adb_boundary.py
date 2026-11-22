"""Private QA-only ADB evidence. The exact disposable emulator is never replaced."""
import contextlib, hashlib, json, pathlib, re, subprocess, time, os, selectors
from decimal import Decimal

FONT=('shell','settings')
STATE=('get-state',)
BOOT=('shell','cat','/proc/sys/kernel/random/boot_id')
READY=('shell','getprop','sys.boot_completed')
EMU=('shell','getprop','ro.boot.qemu')
SAFE_ERRORS={
 'adb: device offline':'DEVICE_OFFLINE',
 'error: device offline':'DEVICE_OFFLINE',
 'adb: no devices/emulators found':'DEVICE_NOT_FOUND',
 'error: no devices/emulators found':'DEVICE_NOT_FOUND',
}
UUID=re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',re.I)
NUM=re.compile(r'[0-9]{1,2}(?:\.[0-9]{1,10})?')
REASONS={'ADB_EMULATOR_OWNERSHIP_UNVERIFIED','ADB_EMULATOR_BOOT_ID_CHANGED_OR_UNREADABLE',
 'FONT_VALUE_UNVERIFIED','FONT_READBACK_UNVERIFIED','ADB_EMULATOR_TRANSPORT_UNVERIFIED',
 'ADB_EMULATOR_OFFLINE_AT_POST_INSTALL','FONT_DRIFT_SINCE_PREFLIGHT','EXACT_CLEAN_SOURCE_UNVERIFIED',
 'EXACT_INSTALLED_PACKAGE_UNVERIFIED','EXACT_INSTALLED_APK_UNVERIFIED','ADB_OUTPUT_BOUND_EXCEEDED'}

def operation(args):
 if args in (STATE,BOOT,READY,EMU):return {STATE:'device-state',BOOT:'boot-identity',READY:'boot-completed',EMU:'emulator-property'}[args]
 if args==(*FONT,'get','system','font_scale'):return 'font-read'
 if len(args)==6 and args[:5]==(*FONT,'put','system','font_scale') and NUM.fullmatch(args[5]):return 'font-write'
 if args[:3]==('shell','pm','path'):return 'installed-package-path'
 if args[:2]==('exec-out','cat'):return 'installed-apk-bytes'
 return 'other-adb'

def classified(error):
 if isinstance(error,subprocess.TimeoutExpired):return 'ADB_TIMEOUT'
 v=getattr(error,'stderr',None) or b''
 if isinstance(v,bytes):v=v[:180].decode('ascii','replace')
 v=v.strip()
 if v in SAFE_ERRORS:return SAFE_ERRORS[v]
 if re.fullmatch(r"(?:adb|error): device 'emulator-\d+' not found",v):return 'DEVICE_NOT_FOUND'
 if re.search(r'Permission denial|SecurityException|permission denied',v,re.I):return 'DEVICE_PERMISSION_DENIED'
 return 'ADB_COMMAND_FAILED'

def font_equal(a,b):
 return bool(NUM.fullmatch(a) and NUM.fullmatch(b) and Decimal(a)==Decimal(b))

def error_info(error):
 info={'errorType':type(error).__name__}
 if isinstance(error,(subprocess.CalledProcessError,subprocess.TimeoutExpired)):info['reason']=classified(error)
 elif str(error) in REASONS:info['reason']=str(error)
 return info

def bounded_read(argv,env,timeout,limit=1048576,hash_only=False):
 # Drain stdout/stderr concurrently; bound time and bytes. Kill only this child.
 proc=subprocess.Popen(argv,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 sel=selectors.DefaultSelector();sel.register(proc.stdout,selectors.EVENT_READ,'out');sel.register(proc.stderr,selectors.EVENT_READ,'err')
 deadline=time.monotonic()+timeout;out=bytearray();err=bytearray();size=0;digest=hashlib.sha256()
 try:
  while sel.get_map():
   remaining=deadline-time.monotonic()
   if remaining<=0:raise subprocess.TimeoutExpired('ADB_READ',timeout)
   for key,_ in sel.select(min(.1,remaining)):
    chunk=os.read(key.fileobj.fileno(),65536)
    if not chunk:sel.unregister(key.fileobj);continue
    if key.data=='err':
     if len(err)+len(chunk)>4096:raise ValueError('ADB_OUTPUT_BOUND_EXCEEDED')
     err.extend(chunk)
    else:
     size+=len(chunk)
     if size>limit:raise ValueError('ADB_OUTPUT_BOUND_EXCEEDED')
     if hash_only:digest.update(chunk)
     else:out.extend(chunk)
  rc=proc.wait(timeout=max(.01,deadline-time.monotonic()))
  if rc:raise subprocess.CalledProcessError(rc,'ADB_READ',stderr=bytes(err))
  if hash_only:
   if not size:raise ValueError('EXACT_INSTALLED_APK_UNVERIFIED')
   return digest.hexdigest()
  return bytes(out)
 finally:
  sel.close()
  if proc.poll() is None:proc.kill();proc.wait(timeout=3)
  proc.stdout.close();proc.stderr.close()

class Boundary:
 def __init__(self,adb,serial,env,out):
  if not re.fullmatch(r'emulator-\d+',serial):raise ValueError('ADB_EMULATOR_OWNERSHIP_UNVERIFIED')
  self.adb,self.serial,self.env=adb,serial,env
  self.receipt=pathlib.Path(out)/'adb-scale-boundary.json'
  self.boot=None;self.original=None;self.phase='prebuild-admission';self.rows=[]
  self.primary=None;self.cleanup=[];self.postinstall=None
 def save(self):
  p=self.receipt.with_suffix('.tmp')
  p.write_text(json.dumps({'status':'BLOCKED' if self.primary or any(not e['restored'] for e in self.cleanup) else 'OBSERVATIONS_ONLY',
   'nativeAcceptance':False,'firstFailure':self.primary,'scaleRestores':self.cleanup,
   'postInstall':self.postinstall,'adbObservations':self.rows},indent=2)+'\n')
  p.replace(self.receipt)
 def log(self,args,stdout=None,error=None):
  args=tuple(args); op=operation(args)
  if op=='other-adb' and error is None:return
  row={'stage':self.phase,'operation':op}
  if error is not None:
   row.update(reason=classified(error),exitCode=getattr(error,'returncode',None))
   # Only retain exact common diagnostic literals for narrow allowlisted
   # operations. Never write raw argv, paths, boot ID, APK, XML, or activity output.
   if op in ('device-state','font-read','font-write','boot-completed','emulator-property'):
    stderr=getattr(error,'stderr',None)
    if isinstance(stderr,bytes) and len(stderr)<=180:
     line=stderr.decode('ascii','replace').strip()
     if line in SAFE_ERRORS:row['stderr']=line
    stdout=getattr(error,'stdout',None)
  if isinstance(stdout,bytes) and len(stdout)<=32:
   value=stdout.decode('ascii','replace').strip()
   if ((op in ('font-read','font-write') and (not value or NUM.fullmatch(value))) or
       (op=='device-state' and value in ('device','offline','unknown','bootloader','recovery')) or
       (op in ('boot-completed','emulator-property') and value in ('0','1'))):
    row['stdout']=value
  if len(self.rows)<80:self.rows.append(row)
  self.save()
 def record_failure(self,error):
  if self.primary is None:self.primary={'stage':self.phase,**error_info(error)}
  self.save()
 def checked(self,fn,*args):
  try:return fn(*args)
  except (subprocess.CalledProcessError,subprocess.TimeoutExpired):
   # The detailed redacted receipt already has each phase. Do not let the
   # adapter's generic exception serializer expose the failing argv.
   raise ValueError('ANDROID_ADB_BOUNDARY_BLOCKED; see adb-scale-boundary.json') from None
 def run(self,*args,timeout=5,binary=False):
  try: raw=bounded_read([self.adb,'-s',self.serial,*args],self.env,timeout)
  except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as error:
   self.log(args,error=error);raise
  self.log(args,stdout=raw)
  return raw if binary else raw.decode().strip()
 def installed_digest(self,path):
  args=('exec-out','cat',path)
  try:return bounded_read([self.adb,'-s',self.serial,*args],self.env,15,limit=536870912,hash_only=True)
  except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as error:
   self.log(args,error=error);raise
 def prove_owner(self,initial=False):
  if self.run(*STATE)!='device' or self.run(*READY)!='1' or self.run(*EMU)!='1':
   raise ValueError('ADB_EMULATOR_OWNERSHIP_UNVERIFIED')
  boot=self.run(*BOOT)
  if not UUID.fullmatch(boot) or (not initial and boot!=self.boot):
   raise ValueError('ADB_EMULATOR_BOOT_ID_CHANGED_OR_UNREADABLE')
  if initial:self.boot=boot
 def font(self,value=None):
  if value is not None:
   if not NUM.fullmatch(value):raise ValueError('FONT_VALUE_UNVERIFIED')
   self.prove_owner()
   self.run(*FONT,'put','system','font_scale',value)
  actual=self.run(*FONT,'get','system','font_scale')
  if not NUM.fullmatch(actual) or (value is not None and not font_equal(value,actual)):
   raise ValueError('FONT_READBACK_UNVERIFIED')
  return actual
 @contextlib.contextmanager
 def restore_guard(self,stage,original):
  primary=None
  try:yield
  except BaseException as error:
   primary=error;self.record_failure(error);raise
  finally:
   self.phase=stage
   clean={'stage':stage,'restored':False}
   try:
    self.font(original)
    clean['restored']=True
   except Exception as error:
    clean.update(error_info(error))
    if primary is None:self.record_failure(error);raise
   finally:
    self.cleanup.append(clean);self.save()
 def prebuild(self):
  try:
   self.phase='prebuild-ownership';self.prove_owner(initial=True)
   self.phase='prebuild-font-original';self.original=self.font()
   with self.restore_guard('prebuild-font-restore',self.original):
    for value in ('1.0','1.3'):
     self.phase='prebuild-font-'+value;self.font(value)
  except Exception as error:self.record_failure(error);raise
 def post_install(self,source,source_sha,source_tree,package,apk_sha):
  self.phase='post-install-device-health';attempts=0;deadline=time.monotonic()+12;prior=None
  try:
   while attempts<5 and time.monotonic()<deadline:
    attempts+=1
    try:
     state=self.run(*STATE,timeout=min(2.0,max(.1,deadline-time.monotonic())))
    except (subprocess.CalledProcessError,subprocess.TimeoutExpired) as error:
     if classified(error) not in ('DEVICE_OFFLINE','DEVICE_NOT_FOUND','ADB_TIMEOUT'):raise
     if prior is None:prior=error
    else:
     if state=='device':break
     if state!='offline':raise ValueError('ADB_EMULATOR_TRANSPORT_UNVERIFIED')
    time.sleep(min(1.0,max(0,deadline-time.monotonic())))
   else:
    if prior is not None:raise prior
    raise ValueError('ADB_EMULATOR_OFFLINE_AT_POST_INSTALL')
   self.phase='post-install-ownership';self.prove_owner()
   self.phase='post-install-font-original'
   if not font_equal(self.original,self.font()):raise ValueError('FONT_DRIFT_SINCE_PREFLIGHT')
   self.phase='post-install-source'
   def git(*args):return subprocess.check_output(['git','-C',str(source),*args],timeout=7,stderr=subprocess.PIPE).decode().strip()
   if git('rev-parse','HEAD')!=source_sha or git('rev-parse','HEAD^{tree}')!=source_tree or git('status','--porcelain'):
    raise ValueError('EXACT_CLEAN_SOURCE_UNVERIFIED')
   self.phase='post-install-apk'
   lines=self.run('shell','pm','path',package).splitlines()
   if len(lines)!=1 or not re.fullmatch(r'package:/data/app/[A-Za-z0-9_./=+~-]+\.apk',lines[0]):
    raise ValueError('EXACT_INSTALLED_PACKAGE_UNVERIFIED')
   if self.installed_digest(lines[0][8:])!=apk_sha:
    raise ValueError('EXACT_INSTALLED_APK_UNVERIFIED')
   self.postinstall={'attempts':attempts,'sameBoot':True,'originalScaleVerified':True,
                     'sourceAndInstalledApkVerified':True}
   self.save()
  except Exception as error:
   self.postinstall={'attempts':attempts,'sameBoot':None,'sourceAndInstalledApkVerified':False}
   self.record_failure(error);raise
