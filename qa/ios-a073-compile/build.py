#!/usr/bin/env python3
"""Unsigned synthetic-loopback iOS Release builder. No installs, launches or uploads."""
import argparse,base64,hashlib,json,os,pathlib,platform,plistlib,re,shutil,signal,subprocess,sys,tarfile,tempfile,time
from xml.parsers.expat import ExpatError
import native_policy
SHA='a073d5761b77f3e01610acebaf5d98f76a920fb5'
TREE='3cbda6ddde720b614c0ae3c2bccef7948d805e20'
TEMPLATE_PATH='scoresnap/.env.example'
TEMPLATE_GIT_BLOB='e8fbcc143d5d4356bd96768f8be21fd8a62540b7'
TEMPLATE_SHA256='45e2a51930e8ec397f451e4a62f9b6e1a2777bcf7bc8321d249b254abc9ccf59'
TEMPLATE_BYTES=1258
COMPILE_URL="http://localhost:55439"
COMPILE_KIND="compile-only-no-running-backend"
FLAGS={'CI':'1','EXPO_NO_DOTENV':'1','EXPO_NO_TELEMETRY':'1','EXPO_OFFLINE':'1','SENTRY_DISABLE_AUTO_UPLOAD':'true','EXPO_PUBLIC_SIMULATOR_NO_MLKIT':'1','EXPO_PUBLIC_OFFLINE_MODE':'false','EXPO_PUBLIC_DEMO_MODE':'false','EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING':'true','EXPO_PUBLIC_FEATURE_NATIVE_LINKS':'false','EXPO_PUBLIC_FEATURE_LEAGUES':'false','EXPO_PUBLIC_PRO_ENABLED':'false','EXPO_PUBLIC_FEATURE_COURSE_SEARCH':'true','EXPO_PUBLIC_CAPTCHA_MODE':'off','EXPO_PUBLIC_POSTHOG_ENABLED':'false'}
class Blocked(Exception):pass
def must(x,reason):
 if not x:raise Blocked(reason)
def digest(b):return hashlib.sha256(b).hexdigest()
def read(cmd,env=None):
 r=subprocess.run(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=20)
 must(r.returncode==0 and len(r.stdout)<=1048576,'READBACK_FAILED')
 return r.stdout.decode().strip()
def source(repo):
 g=lambda *a:read(['git','--no-optional-locks','-C',str(repo),*a])
 must(g('rev-parse','HEAD')==SHA and g('rev-parse','HEAD^{tree}')==TREE and not g('status','--porcelain'),'EXACT_CLEAN_SOURCE_REQUIRED')
 return digest((repo/'scoresnap/package-lock.json').read_bytes())
def endpoint(url,key,receipt,compile_only=False):
 must(re.fullmatch(r'http://localhost:([1-9][0-9]{3,4})',url) is not None,'EXACT_LOCALHOST_REQUIRED')
 must(1024<=int(url.rsplit(':',1)[1])<=65535,'PORT_RANGE')
 try:
  parts=key.split('.');p=json.loads(base64.urlsafe_b64decode(parts[1]+'='*(-len(parts[1])%4)))
  ok=len(parts)==3 and p.get('role')=='anon' and not p.get('ref') and p.get('iss') in ('supabase','supabase-demo')
 except Exception:ok=False
 must(ok and len(key)<8192,'SYNTHETIC_ANON_REQUIRED')
 if compile_only:
  must(url==COMPILE_URL and p=={'role':'anon','iss':'supabase-demo'} and parts[0]=='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' and parts[2]==base64.urlsafe_b64encode(bytes(32)).rstrip(b'=').decode(),'COMPILE_FIXTURE_KEY_INVALID')
  must(receipt=={'kind':COMPILE_KIND,'relay_url':url,'anon_sha256':digest(key.encode()),'backend_started':False},'COMPILE_FIXTURE_PROVENANCE_REQUIRED')
 else:
  must(receipt.get('kind')=='disposable-loopback-stack' and receipt.get('relay_url')==url and receipt.get('anon_sha256')==digest(key.encode()) and receipt.get('no_hosted_credentials') is True and receipt.get('no_external_upstreams') is True,'STACK_PROVENANCE_REQUIRED')
def host(env):
 must(platform.system()=='Darwin' and platform.machine()=='arm64','HOSTED_ARM64_MAC_REQUIRED')
 must(all(env.get(k)==v for k,v in {'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REPOSITORY':'augsmog/QuickScore','RUNNER_ENVIRONMENT':'github-hosted','RUNNER_OS':'macOS','RUNNER_ARCH':'ARM64'}.items()),'TRUSTED_HOSTED_CONTEXT_REQUIRED')
def environment(home,path,url,key,developer_dir):
 home.mkdir(mode=0o700)
 for n in ('npm-user','npm-global'):(home/n).write_text('')
 return dict(FLAGS,PATH=path,HOME=str(home),CP_HOME_DIR=str(home/'pods'),NPM_CONFIG_USERCONFIG=str(home/'npm-user'),NPM_CONFIG_GLOBALCONFIG=str(home/'npm-global'),NPM_CONFIG_REGISTRY='https://registry.npmjs.org',LANG='en_US.UTF-8',DEVELOPER_DIR=developer_dir,EXPO_PUBLIC_SUPABASE_URL=url,EXPO_PUBLIC_SUPABASE_ANON_KEY=key,EXPO_PUBLIC_TURNSTILE_BASE_URL=url)
def phase(argv,cwd,env,seconds,floor):
 must(shutil.disk_usage(cwd).free>=floor,'DISK_FLOOR')
 proc=subprocess.Popen(argv,cwd=cwd,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 end=time.monotonic()+seconds
 try:
  while proc.poll() is None:
   must(time.monotonic()<end,'PHASE_TIMEOUT');must(shutil.disk_usage(cwd).free>=floor,'DISK_FLOOR');time.sleep(.25)
  must(proc.returncode==0,'PHASE_FAILED')
 finally:
  if proc.poll() is None:
   os.killpg(proc.pid,signal.SIGTERM)
   try:proc.wait(timeout=3)
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=3)
def checked_git_inventory(repo):
 # Scope to the app tree only: unrelated repository gitlinks are not operands.
 entries=subprocess.run(['git','-C',str(repo),'ls-tree','-r','-z',SHA,'--','scoresnap'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=True,timeout=30).stdout
 must(len(entries)<2097152 and entries.endswith(b'\x00'),'UNSAFE_GIT_INVENTORY')
 expected={}
 for record in entries[:-1].split(b'\x00'):
  meta,name=record.split(b'\t',1)
  path=name.decode('utf-8')
  mode,kind,blob=meta.decode('ascii').split()
  must(mode in ('100644','100755') and kind=='blob' and path not in expected and
       re.fullmatch(r'[0-9a-f]{40}',blob),'UNSAFE_GIT_ENTRY')
  parts=pathlib.PurePosixPath(path).parts
  must(len(parts)>1 and parts[0]=='scoresnap' and '..' not in parts,'UNSAFE_GIT_ENTRY')
  if pathlib.PurePosixPath(path).name.casefold().startswith('.env'):
   must(path==TEMPLATE_PATH,'TRACKED_ENV_NOT_ALLOWED')
   must(mode=='100644' and blob==TEMPLATE_GIT_BLOB,'TEMPLATE_BLOB_MISMATCH')
  expected[path]=blob
 must(TEMPLATE_PATH in expected,'PINNED_TEMPLATE_MISSING_IN_GIT')
 return expected

def archive_blob(body,size,is_template):
 git_hash=hashlib.sha1(usedforsecurity=False)
 git_hash.update(f'blob {size}\0'.encode('ascii'))
 sha256=hashlib.sha256() if is_template else None
 with body:
  count=0
  for chunk in iter(lambda:body.read(1048576),b''):
   count+=len(chunk);git_hash.update(chunk)
   if sha256:sha256.update(chunk)
 must(count==size,'ARCHIVE_BLOB_SIZE_MISMATCH')
 return git_hash.hexdigest(),sha256.hexdigest() if sha256 else None

def plan_archive(repo,dest=None):
 expected=checked_git_inventory(repo)
 with tempfile.TemporaryFile() as f:
  subprocess.run(['git','-C',str(repo),'archive',SHA,'scoresnap'],stdout=f,stderr=subprocess.DEVNULL,check=True,timeout=30);f.seek(0)
  with tarfile.open(fileobj=f) as t:
   total=0; all_names=set(); archive_files=set(); members=[]
   for m in t:
    p=pathlib.PurePosixPath(m.name);total+=m.size
    must(m.name not in all_names and p.as_posix()==m.name and not p.is_absolute() and
         p.parts and p.parts[0]=='scoresnap' and '..' not in p.parts and
         (m.isfile() or m.isdir()) and total<1073741824,'UNSAFE_SOURCE_ARCHIVE')
    all_names.add(m.name)
    is_template=m.name==TEMPLATE_PATH
    if p.name.casefold().startswith('.env'):
     must(is_template and m.isfile(),'TRACKED_ENV_NOT_ALLOWED')
    if m.isfile():
     must(m.name in expected,'UNEXPECTED_ARCHIVE_FILE')
     archive_files.add(m.name)
     if is_template:must(m.size==TEMPLATE_BYTES,'TEMPLATE_ARCHIVE_SIZE_MISMATCH')
     body=t.extractfile(m)
     must(body is not None,'ARCHIVE_FILE_BODY_MISSING')
     git_blob,digest_bytes=archive_blob(body,m.size,is_template)
     must(git_blob==expected[m.name],'ARCHIVE_GIT_BLOB_MISMATCH')
     if is_template:
      must(digest_bytes==TEMPLATE_SHA256,'TEMPLATE_ARCHIVE_SHA256_MISMATCH')
      continue
    members.append(m)
   must(archive_files==expected.keys(),'ARCHIVE_GIT_INVENTORY_MISMATCH')
   if dest is not None:
    dest.mkdir()
    t.extractall(dest,members=members,filter='data')
 inventory=digest(json.dumps(sorted(expected.items()),separators=(',',':')).encode())
 return {'gitInventorySha256':inventory,'verifiedGitArchiveFileCount':len(expected),
         'acceptedFileCount':len(expected)-1,'omitted':[{'path':TEMPLATE_PATH,
          'gitBlob':TEMPLATE_GIT_BLOB,'sha256':TEMPLATE_SHA256,'bytes':TEMPLATE_BYTES,
          'reason':'verified-inert-tracked-dotenv-template'}]}

def export(repo,dest):
 return plan_archive(repo,dest)

def commands(app,dd,compile_only=False):return [
 ('npm',['npm','ci','--no-audit','--no-fund'],app,300),
 ('prebuild',['node','node_modules/expo/bin/cli','prebuild','--platform','ios','--no-install'],app,180),
 ('pods',['pod','install'],app/'ios',300),
 ('release',['xcodebuild','-workspace','SnapScore.xcworkspace','-scheme','SnapScore','-configuration','Release','-destination','generic/platform=iOS Simulator','-derivedDataPath',str(dd),'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO','CODE_SIGN_IDENTITY=',*(['ARCHS=arm64'] if compile_only else []),'build'],app/'ios',1200)]
def compile_plist_bytes(path,app,*,final=False):
 if not path.is_file():
  raise Blocked('FINAL_PLIST_INVALID' if final else 'GENERATED_PLISTS_MISSING')
 # The only writable inputs are the exact generated paths in the scratch app.
 if any(p.is_symlink() for p in (path,*path.parents) if p==app or p.is_relative_to(app)):
  raise Blocked('FINAL_PLIST_INVALID' if final else 'GENERATED_PLIST_PATH_UNSAFE')
 try:
  with path.open('rb') as stream:b=stream.read(1024**2 + 1)
 except OSError as exc:
  raise Blocked('FINAL_PLIST_INVALID' if final else 'GENERATED_PLIST_READ_FAILED') from exc
 must(len(b)<=1024**2,'FINAL_PLIST_INVALID' if final else 'GENERATED_PLIST_INVALID')
 return b

def compile_plist(data,*,final=False):
 try:return plistlib.loads(data)
 except (plistlib.InvalidFileException,ValueError,TypeError,OverflowError,ExpatError) as exc:
  raise Blocked('FINAL_PLIST_INVALID' if final else 'GENERATED_PLIST_INVALID') from exc

def generated_policy(app,compile_only=False):
 ep=app/'ios/SnapScore/Supporting/Expo.plist';ip=app/'ios/SnapScore/Info.plist'
 if compile_only:
  eb=compile_plist_bytes(ep,app);ib=compile_plist_bytes(ip,app)
  try:e,i=native_policy.policy(compile_plist(eb),compile_plist(ib),compile_only=True)
  except native_policy.CompilePolicyError as exc:raise Blocked(str(exc)) from exc
  try:ep.write_bytes(plistlib.dumps(e));ip.write_bytes(plistlib.dumps(i))
  except (OSError,ValueError,TypeError,OverflowError) as exc:raise Blocked('GENERATED_PLIST_WRITE_FAILED') from exc
  ea=compile_plist_bytes(ep,app);ia=compile_plist_bytes(ip,app)
  e_read=compile_plist(ea);i_read=compile_plist(ia)
  try:native_policy.verify(e_read,i_read,compile_only=True)
  except native_policy.CompilePolicyError as exc:raise Blocked('GENERATED_PLIST_WRITE_UNVERIFIED') from exc
  must(e_read==e and i_read==i,'GENERATED_PLIST_WRITE_UNVERIFIED')
  return {'before':{'expo':digest(eb),'info':digest(ib)},
          'after':{'expo':digest(ea),'info':digest(ia)},
          'ats':'stock-local-networking-removed'}
 must(ep.is_file() and ip.is_file(),'GENERATED_PLISTS_MISSING')
 before={n:digest(p.read_bytes()) for n,p in [('expo',ep),('info',ip)]}
 e,i=native_policy.policy(plistlib.loads(ep.read_bytes()),plistlib.loads(ip.read_bytes()))
 ep.write_bytes(plistlib.dumps(e));ip.write_bytes(plistlib.dumps(i))
 return {'before':before,'after':{'expo':digest(ep.read_bytes()),'info':digest(ip.read_bytes())}}
def artifact(app,compile_only=False):
 must(app.is_dir(),'RELEASE_APP_MISSING')
 if compile_only:
  info=compile_plist(compile_plist_bytes(app/'Info.plist',app,final=True),final=True)
  expo=compile_plist(compile_plist_bytes(app/'Expo.plist',app,final=True),final=True)
  try:native_policy.verify(expo,info,compile_only=True)
  except native_policy.CompilePolicyError as exc:raise Blocked(str(exc)) from exc
 else:
  info=plistlib.loads((app/'Info.plist').read_bytes());expo=plistlib.loads((app/'Expo.plist').read_bytes());native_policy.verify(expo,info)
 must(info.get('CFBundleIdentifier')=='com.scoresnap.app' and info.get('CFBundleSupportedPlatforms')==['iPhoneSimulator'],'NOT_TARGET_SIMULATOR_APP')
 must(not (app/'embedded.mobileprovision').exists() and not (app/'_CodeSignature').exists(),'SIGNED_ARTIFACT_REJECTED')
 rows=[];total=0
 for f in sorted(app.rglob('*')):
  must(not f.is_symlink(),'BUNDLE_LINK_REQUIRES_REVIEW')
  if f.is_file():
   total+=f.stat().st_size;must(total<=2147483648,'APP_SIZE_LIMIT')
   h=hashlib.sha256()
   with f.open('rb') as stream:
    for b in iter(lambda:stream.read(1048576),b''):h.update(b)
   rows.append([str(f.relative_to(app)),f.stat().st_size,h.hexdigest()])
 must(rows and (app/'SnapScore').is_file(),'EXECUTABLE_MISSING')
 return {'sha256':digest(json.dumps(rows,separators=(',',':')).encode()),'bytes':total,'files':rows,'executableSha256':digest((app/'SnapScore').read_bytes())}
def build(a):
 host(os.environ);repo=pathlib.Path(a.repo).resolve();lock=source(repo)
 keypath=pathlib.Path(a.anon_file);must(keypath.is_file() and not keypath.is_symlink() and keypath.stat().st_mode&0o077==0 and keypath.stat().st_size<8192,'PRIVATE_KEY_FILE_REQUIRED')
 compile_only=getattr(a,'compile_only',False) is True
 key=keypath.read_text().strip();endpoint(a.relay,key,json.loads(pathlib.Path(a.stack_receipt).read_text()),compile_only)
 out=pathlib.Path(a.out).resolve();must(not out.exists() and not out.is_relative_to(repo),'NEW_EXTERNAL_SCRATCH_REQUIRED')
 must(a.minimum_free_bytes>=12884901888,'MINIMUM_FLOOR_TOO_SMALL')
 must(shutil.disk_usage(out.parent).free>=a.minimum_free_bytes,'DISK_FLOOR')
 out.mkdir(mode=0o700);stage='toolchain';receipt={'source':SHA,'tree':TREE,'nativeAcceptance':False,'status':'BLOCKED'}
 try:
  env=environment(out/'home',os.environ['PATH'],a.relay,key,a.developer_dir)
  if compile_only:
   tmp=out/'home'/'tmp';tmp.mkdir(mode=0o700)
   env.update(TMPDIR=str(tmp),COCOAPODS_DISABLE_STATS='true',GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL='/dev/null')
  expected=[(['node','--version'],'v22.23.5'),(['npm','--version'],'10.9.9'),(['pod','--version'],'1.17.0'),(['ruby','-e','print RUBY_VERSION'],'3.4.12'),(['xcodebuild','-version'],'Xcode 26.4.1\nBuild version 17E202')]
  for cmd,value in expected:must(read(cmd,env)==value,'TOOLCHAIN_MISMATCH')
  must(read(['xcrun','--sdk','iphonesimulator','--show-sdk-version'],env)=='26.4','SIMULATOR_SDK_MISMATCH')
  stage='export';receipt['sourceExport']=export(repo,out/'source');app=out/'source/scoresnap';dd=out/'DerivedData'
  package_hash=digest((app/'package.json').read_bytes())
  receipt['phaseSeconds']={}
  for name,cmd,cwd,budget in (commands(app,dd,True) if compile_only else commands(app,dd)):
   stage=name;start=time.monotonic()
   try:phase(cmd,cwd,env,budget,a.minimum_free_bytes)
   finally:receipt['phaseSeconds'][name]=round(time.monotonic()-start,2)
   must(digest((app/'package-lock.json').read_bytes())==lock and digest((app/'package.json').read_bytes())==package_hash,'PRODUCT_LOCK_CHANGED')
   if name=='prebuild':
    if compile_only:
     stage='generated-policy';policy_start=time.monotonic()
     try:receipt['generatedPolicy']=generated_policy(app,True)
     finally:receipt['phaseSeconds'][stage]=round(time.monotonic()-policy_start,2)
    else:receipt['generatedPolicy']=generated_policy(app)
   if name=='pods':
    pl=app/'ios/Podfile.lock';ml=app/'ios/Pods/Manifest.lock'
    must(pl.is_file() and ml.is_file() and pl.read_bytes()==ml.read_bytes(),'PODS_LOCK_MISMATCH')
    receipt['resolvedPodsSha256']=digest(pl.read_bytes());receipt['resolvedPodsIndependentReviewRequired']=True
  stage='artifact';binary=dd/'Build/Products/Release-iphonesimulator/SnapScore.app';receipt['artifact']=(artifact(binary,True) if compile_only else artifact(binary))
  uuid=read(['xcrun','dwarfdump','--uuid',str(binary/'SnapScore')],env)
  matches=re.findall(r'^UUID: ([0-9A-Fa-f-]{36}) \((arm64)\) ',uuid,re.M);must(len(matches)==1,'BINARY_UUID_UNVERIFIED')
  if compile_only:
   must(read(['/usr/bin/lipo','-archs',str(binary/'SnapScore')],env)=='arm64','BINARY_NOT_ARM64_ONLY')
  receipt['binaryUUID']=matches[0][0];must(source(repo)==lock,'SOURCE_CHANGED')
  receipt.update(status='UNSIGNED_SIMULATOR_RELEASE_BUILT',appRelativePath=str(binary.relative_to(out)),freeBytesAfter=shutil.disk_usage(out).free,packageLockSha256=lock,loopbackOnlyInput=True)
 finally:
  receipt['lastPhase']=stage;(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 return receipt
if __name__=='__main__':
 if sys.argv[1:2]==['verify-export']:
  p=argparse.ArgumentParser(description='Read-only exact Git tree/archive check; does not export files.')
  p.add_argument('--repo',required=True)
  a=p.parse_args(sys.argv[2:])
  try:
   repo=pathlib.Path(a.repo).resolve();source(repo)
   print(json.dumps({'status':'VERIFIED_EXPORT_POLICY','source':SHA,'tree':TREE,**plan_archive(repo)},sort_keys=True))
  except Blocked as e:
   print(json.dumps({'status':'BLOCKED_EXPORT_POLICY','reason':str(e)}));raise SystemExit(78)
  except Exception:
   print(json.dumps({'status':'BLOCKED_EXPORT_POLICY','reason':'GIT_OR_ARCHIVE_ERROR'}));raise SystemExit(78)
  raise SystemExit(0)
 p=argparse.ArgumentParser();p.add_argument('--repo',required=True);p.add_argument('--out',required=True);p.add_argument('--relay',required=True);p.add_argument('--anon-file',required=True);p.add_argument('--stack-receipt',required=True);p.add_argument('--developer-dir',required=True);p.add_argument('--minimum-free-bytes',type=int,required=True)
 try:r=build(p.parse_args());print(json.dumps({'status':r['status'],'source':SHA,'nativeAcceptance':False}))
 except Exception:print(json.dumps({'status':'BLOCKED_BUILD','nativeAcceptance':False}));raise SystemExit(78)
