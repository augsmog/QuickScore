"""Narrow sdkmanager provisioning on the existing ephemeral hosted Ubuntu26 runner only."""
import hashlib,json,os,pathlib,re,signal,subprocess,tempfile
PACKAGES={'ndk;27.1.12297006':'ndk/27.1.12297006/source.properties','cmake;3.22.1':'cmake/3.22.1/bin/cmake'}
def host_guard(env,release,sdk):
 expected={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','RUNNER_OS':'Linux','RUNNER_ARCH':'X64','GITHUB_REPOSITORY':'augsmog/QuickScore','ImageOS':'ubuntu26'}
 if any(env.get(k)!=v for k,v in expected.items()) or release.get('ID')!='ubuntu' or release.get('VERSION_ID')!='26.04':raise ValueError('SDK_PROVISION_BLOCKED: requires allowlisted GitHub-hosted Ubuntu26.04 x64 job')
 if sdk!='/usr/local/lib/android/sdk':raise ValueError('SDK_PROVISION_BLOCKED: unexpected SDK root')
 if not re.fullmatch(r'\d{8}\.\d+\.\d+',env.get('ImageVersion','')):raise ValueError('SDK_PROVISION_BLOCKED: missing image version')
def plan(sdk):return [k for k,v in PACKAGES.items() if not (pathlib.Path(sdk)/v).exists()]
def licenses(sdk):
 root=pathlib.Path(sdk)/'licenses'
 if not root.is_dir() or not (root/'android-sdk-license').is_file():raise ValueError('SDK_PROVISION_BLOCKED: existing accepted Android SDK license required')
 if any(p.is_symlink() or not p.is_file() for p in root.iterdir()):raise ValueError('SDK_PROVISION_BLOCKED: ambiguous license entry')
 files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir() if p.is_file() and not p.is_symlink()}
 if not re.search(rb'\b[a-f0-9]{40}\b',(root/'android-sdk-license').read_bytes()):raise ValueError('SDK_PROVISION_BLOCKED: empty/unrecognized existing license receipt')
 return files

def ensure(sdk,out,env):
 root=pathlib.Path(sdk).resolve();release={k:v.strip('"') for k,v in (line.split('=',1) for line in pathlib.Path('/etc/os-release').read_text().splitlines() if '=' in line)}
 host_guard(env,release,str(root))
 java=pathlib.Path(env.get('JAVA_HOME_17_X64','/nonexistent'))
 if not (java/'bin/java').is_file():raise ValueError('SDK_PROVISION_BLOCKED: configured JAVA_HOME_17_X64 unavailable')
 version=subprocess.run([str(java/'bin/java'),'-version'],capture_output=True,timeout=10)
 if version.returncode or not re.search(r'version "17[.]',version.stderr.decode()):raise ValueError('SDK_PROVISION_BLOCKED: configured Java is not17')
 if os.geteuid()==0:raise ValueError('SDK_PROVISION_BLOCKED: ordinary runner user required')
 if any(not (root/x).is_file() for x in ('platforms/android-36/android.jar','build-tools/36.0.0/aapt')):raise ValueError('SDK_PROVISION_BLOCKED: preinstalled SDK36/build-tools36 required')
 before=licenses(root)
 missing=plan(root)
 receipt={'imageOS':env['ImageOS'],'imageVersion':env['ImageVersion'],'requestedPackages':missing,'installedPackages':[],'licenseAcceptancePerformed':False}
 if missing:
  manager=(root/'cmdline-tools/latest/bin/sdkmanager').resolve()
  if not manager.is_relative_to(root/'cmdline-tools') or not manager.is_file() or not os.access(manager,os.X_OK):raise ValueError('SDK_PROVISION_BLOCKED: existing official SDK cmdline-tools/latest/bin/sdkmanager required')
  with tempfile.TemporaryDirectory(prefix='snapscore-sdk-home-') as home:
   clean={'PATH':str(java/'bin')+':'+env.get('PATH','/usr/bin:/bin'),'JAVA_HOME':str(java),'HOME':home,'ANDROID_HOME':str(root),'ANDROID_SDK_ROOT':str(root),'LANG':'C.UTF-8'}
   with (pathlib.Path(out)/'sdkmanager.log').open('wb') as log:
    p=subprocess.Popen([str(manager),'--sdk_root='+str(root),'--install',*missing],env=clean,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    try:rc=p.wait(360)
    except subprocess.TimeoutExpired:
     os.killpg(p.pid,signal.SIGKILL);p.wait();raise RuntimeError('SDK_PROVISION_BLOCKED: sdkmanager360s timeout')
    finally:
     if licenses(root)!=before:raise ValueError('SDK_PROVISION_BLOCKED: license receipts changed unexpectedly')
   if rc or plan(root):raise ValueError('SDK_PROVISION_BLOCKED: package install failed or license not already accepted; no acceptance attempted')
  receipt['installedPackages']=missing
 if licenses(root)!=before:raise ValueError('SDK_PROVISION_BLOCKED: license receipt drift')
 receipt['licenseSha256Before']=before;receipt['licenseSha256After']=licenses(root)
 (pathlib.Path(out)/'sdk-provision.json').write_text(json.dumps(receipt,indent=2)+'\n')
 return str(java)
