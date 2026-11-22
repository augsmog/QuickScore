"""Existing Android gate intake; real build/capture attempt, always incomplete until geometry admission."""
import json,os,pathlib,re,shutil,signal,subprocess,tempfile
import android_capture as b
import flow_adapter as flow
import os_scale
import android_insets
import sdk_offline_provision
import offline_apk
SHA=re.compile('[0-9a-f]{40}')
REQ=['platforms/android-36/android.jar','build-tools/36.0.0/aapt','ndk/27.1.12297006/source.properties','cmake/3.22.1/bin/cmake']

def read(args,cwd=None):
    try:return subprocess.check_output(args,cwd=cwd,stderr=subprocess.DEVNULL,timeout=25).decode().strip()
    except (OSError,subprocess.SubprocessError,UnicodeError):raise b.Failure('readback') from None

def ingress(repo,env,event):
    if env.get('GITHUB_ACTIONS')!='true' or env.get('RUNNER_ENVIRONMENT')!='github-hosted' or env.get('RUNNER_OS')!='Linux' or env.get('GITHUB_REPOSITORY')!='augsmog/QuickScore':raise b.Failure('hosted-context')
    sha=read(['git','rev-parse','HEAD'],repo);tree=read(['git','rev-parse','HEAD^{tree}'],repo)
    if not SHA.fullmatch(sha) or not SHA.fullmatch(tree) or sha!=env.get('GITHUB_SHA') or read(['git','status','--porcelain'],repo):raise b.Failure('checkout-identity')
    if read(['git','remote','get-url','origin'],repo)!='https://github.com/augsmog/QuickScore.git':raise b.Failure('same-repository')
    receipt={'checkoutSha':sha,'checkoutTree':tree,'event':env.get('GITHUB_EVENT_NAME'),'prHead':None,'prBase':None}
    if receipt['event']=='pull_request':
        pr=event.get('pull_request',{})
        for side in ('head','base'):
            obj=pr.get(side,{})
            if obj.get('repo',{}).get('full_name')!='augsmog/QuickScore' or not SHA.fullmatch(obj.get('sha','')):raise b.Failure('same-repo-pr')
            receipt['pr'+side.title()]=obj['sha']
        if env.get('GITHUB_REF')!=f"refs/pull/{event.get('number')}/merge":raise b.Failure('pr-ref')
        parents=read(['git','show','-s','--format=%P','HEAD'],repo).split()
        if parents!=[receipt['prBase'],receipt['prHead']]:raise b.Failure('pr-parent-binding')
    elif receipt['event']!='workflow_dispatch':raise b.Failure('event')
    return receipt

def command(args,env,cwd,phase,seconds,logs):
    # Exact 5c81 owned process-group timeout semantics; private logs never uploaded.
    with (logs/(phase+'.log')).open('wb') as log:
        p=subprocess.Popen(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:rc=p.wait(seconds)
        except subprocess.TimeoutExpired:
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            p.wait(timeout=10);raise b.Failure(phase+'-timeout') from None
        if rc:raise b.Failure(phase)

def build(repo,src,private,identity):
    sdk=pathlib.Path(os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME') or '/nonexistent')
    try:sdk_offline_provision.ensure(sdk,private,os.environ)
    except (ValueError,RuntimeError,OSError,subprocess.SubprocessError):raise b.Failure('sdk-provision-blocked') from None
    if any(not (sdk/p).exists() for p in REQ):raise b.Failure('exact-sdk36-ndk27-cmake322-missing')
    java=os.environ.get('JAVA_HOME_17_X64') or os.environ.get('JAVA_HOME')
    if not java or not pathlib.Path(java,'bin/java').is_file():raise b.Failure('java17-missing')
    v=subprocess.run([str(pathlib.Path(java,'bin/java')),'-version'],capture_output=True,timeout=10)
    if b'"17.' not in v.stderr or not read(['node','--version']).startswith('v22.'):raise b.Failure('node22-java17')
    home=private/'home';home.mkdir();logs=private/'logs';logs.mkdir()
    env={'PATH':str(pathlib.Path(java,'bin'))+':'+os.environ['PATH'],'HOME':str(home),'JAVA_HOME':java,'ANDROID_HOME':str(sdk),'ANDROID_SDK_ROOT':str(sdk),'GRADLE_USER_HOME':str(home/'gradle'),'CI':'1','EXPO_OFFLINE':'1','EXPO_NO_TELEMETRY':'1','SENTRY_DISABLE_AUTO_UPLOAD':'true','EXPO_PUBLIC_SIMULATOR_NO_MLKIT':'1','EXPO_PUBLIC_OFFLINE_MODE':'true','EXPO_PUBLIC_DEMO_MODE':'false'}
    # Keep sharing/links/Leagues/store flags at SOURCE defaults, unlike old smoke.
    for key,name in [('NPM_CONFIG_USERCONFIG','npm-user.rc'),('NPM_CONFIG_GLOBALCONFIG','npm-global.rc')]:
        p=home/name;p.write_text('');env[key]=str(p)
    command(['git','clone','--shared','--no-checkout',str(repo),str(src)],env,private,'source-copy',60,logs)
    command(['git','checkout','--detach',identity['checkoutSha']],env,src,'source-checkout',60,logs)
    app=src/'scoresnap'
    command(['npm','ci','--no-audit','--no-fund'],env,app,'npm-ci',300,logs)
    command(['node',str(app/'node_modules/expo/bin/cli'),'prebuild','--platform','android','--no-install'],env,app,'prebuild',180,logs)
    overlay_hash=offline_apk.overlay(app/'android')
    command(['bash','./gradlew',':app:assembleRelease','-PreactNativeArchitectures=x86_64','-Pandroid.builder.sdkDownload=false','--no-daemon','--no-build-cache','--max-workers=2','--no-parallel','-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8'],env,app/'android','gradle-release',1200,logs)
    if read(['git','status','--porcelain'],src):raise b.Failure('build-mutated-source')
    apks=list((app/'android/app/build/outputs/apk/release').glob('*.apk'))
    if len(apks)!=1:raise b.Failure('release-apk-count')
    apk=apks[0]
    network=offline_apk.verify_permissions(read([str(sdk/'build-tools/36.0.0/aapt'),'dump','permissions',str(apk)]),b.PACKAGE)
    network['generatedOverlaySha256']=overlay_hash
    (private/'offline-apk.json').write_text(json.dumps(network))
    apk=apks[0];binding={'source_sha':identity['checkoutSha'],'source_tree':identity['checkoutTree'],'apk_sha256':b.digest(apk.read_bytes()),'pixel_size':[1080,2400]}
    return apk,binding,{'offlineNetwork':network,'sdkProvision':json.loads((private/'sdk-provision.json').read_text()),'recipeSha256':b.digest(pathlib.Path(__file__).read_bytes()),'lockSha256':b.digest((app/'package-lock.json').read_bytes()),'qaProfile':{k:v for k,v in env.items() if k.startswith('EXPO_')},'variant':'Release','apkBytes':apk.stat().st_size}

class ObservedDevice(b.Android):
    def __init__(self,serial,wanted):super().__init__(serial,b.PACKAGE+'/.MainActivity');self.wanted=wanted
    def foreground(self):
        super().foreground()
        adb=lambda *args:self.run(*args).decode('utf8','strict')
        focus=os_scale.read_focus(adb)
        settings=adb('shell','settings','get','system','font_scale');config=adb('shell','dumpsys','activity','top')
        value=os_scale.scale(settings,config,self.wanted,focus,b.PACKAGE)
        self.observation={'osScale':value,'activityIdentitySha256':os_scale.activity_scale(config,focus,b.PACKAGE,identity=True),'runtimeRNScale':None}
        size=adb('shell','wm','size').strip();density=adb('shell','wm','density').strip()
        if not re.fullmatch(r'Physical size: \d+x\d+(?:\nOverride size: \d+x\d+)?',size) or not re.fullmatch(r'Physical density: \d+(?:\nOverride density: \d+)?',density):raise b.Failure('geometry-display-readback')
        self.observation['pixelSize']=[int(v) for v in size.split(': ')[-1].split('x')]
        self.observation['densityDpi']=int(density.split(': ')[-1])
        try:
            inset=android_insets.observe(adb('shell','dumpsys','window','windows'),focus,config,self.observation['pixelSize'],self.observation['densityDpi'])
        except android_insets.InsetsError as e:raise b.Failure(e.reason) from None
        self.observation['insets']=inset
        self.observation['safeArea']=inset['safeArea']

# Scale-verified device is supplied throughout flow, not merely on launch.
class GateDriver(flow.BoundDriver):
    def __init__(self,c):
        super().__init__(c)
        self.device=ObservedDevice(c['serial'],c['wanted']);self.check_identity()

def execute(repo,out,env,event):
    identity=ingress(repo,env,event);flow.source_selectors(repo)
    devices=read(['adb','devices']);serials=re.findall(r'^(emulator-\d+)\s+device$',devices,re.M)
    if len(serials)!=1:raise b.Failure('single-emulator-required')
    serial=serials[0];device=b.Android(serial,b.PACKAGE+'/.MainActivity');boot=device.identity()
    if device.run('shell','pm','path',b.PACKAGE).strip():raise b.Failure('fresh-target-required')
    original=device.run('shell','settings','get','system','font_scale').decode().strip()
    if not re.fullmatch(r'\d+(?:\.\d+)?',original):raise b.Failure('original-scale-unreadable')
    original_size=device.run('shell','wm','size').decode().strip()
    original_density=device.run('shell','wm','density').decode().strip()
    if not re.fullmatch(r'Physical size: \d+x\d+(?:\nOverride size: \d+x\d+)?',original_size) or not re.fullmatch(r'Physical density: \d+(?:\nOverride density: \d+)?',original_density):raise b.Failure('viewport-unreadable')
    out.mkdir(parents=True,exist_ok=False);summary={'source':identity,'status':'INCOMPLETE','geometry':'UNRUN','keyboard':'UNPROVEN','visualReview':'UNRUN','onlineJoin':'UNRUN','initializedRNScale':None,'captures':[]}
    primary=None;binding=None
    try:
        device.run('shell','wm','size','1080x2400');device.run('shell','wm','density','480')
        if not device.run('shell','wm','size').decode().strip().endswith('1080x2400') or not device.run('shell','wm','density').decode().strip().endswith('480'):raise b.Failure('compact-viewport-readback')
        with tempfile.TemporaryDirectory(prefix='snapscore-native-',dir=env['RUNNER_TEMP']) as tmp:
            private=pathlib.Path(tmp);src=private/'source';apk,binding,recipe=build(repo,src,private,identity)
            summary['build']={**binding,**recipe}
            device.run('install',str(apk))
            if device.identity()!=boot or device.installed()!=binding['apk_sha256']:raise b.Failure('install-identity')
            for wanted in (1.,1.3):
                device.run('shell','settings','put','system','font_scale',str(wanted))
                device.run('shell','am','force-stop',b.PACKAGE)
                device.run('shell','am','start','-W','-n',b.PACKAGE+'/.MainActivity')
                observed=ObservedDevice(serial,wanted)
                c={'repo':str(src),'apk':str(apk),'binding':binding,'serial':serial,'package':b.PACKAGE,'wanted':wanted,'out':str(out/('scale-'+str(wanted)))}
                check=lambda:b.verify_inputs(src,apk,binding)
                b.capture(observed,binding,'home',out/('home-'+str(wanted)),final_source_check=check)
                flow.flow.journey(c,lane='wizard',driver_class=GateDriver)
                summary['captures'].append({'osScale':wanted,'status':'SUPPLEMENTAL_ONLY'})
    except Exception as e:
        primary=e.phase if isinstance(e,b.Failure) else 'build-or-capture-failed'
    finally:
        try:
            if device.identity()!=boot:raise b.Failure('restore-device-changed')
            device.run('shell','settings','put','system','font_scale',original)
            if device.run('shell','settings','get','system','font_scale').decode().strip()!=original:raise b.Failure('restore-readback')
            for key,value in [('size',original_size),('density',original_density)]:
                override=value.split('Override '+key+': ')
                device.run('shell','wm',key,override[1] if len(override)==2 else 'reset')
                if device.run('shell','wm',key).decode().strip()!=value:raise b.Failure('restore-viewport')
        except Exception:summary['restore']='FAILED'
        else:summary['restore']='VERIFIED'
        if binding is not None:
            try:
                producer=pathlib.Path(__file__).with_name('geometry_output.mjs')
                inputs=out/'geometry-input.json'
                inputs.write_text(json.dumps({'binding':binding,'source':identity,'job':{k:env.get(k) for k in ('GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB')}}))
                result=subprocess.run(['node',str(producer),str(out),str(inputs)],capture_output=True,timeout=60)
                summary['geometry']='PASS' if result.returncode==0 else 'FAILED'
                summary['geometryReceipt']='geometry-result.json'
            except Exception:summary['geometry']='PRODUCER_FAILED'
        summary['failure']=primary or ('REQUIRED_GEOMETRY_VALIDATION_FAILED' if summary['geometry']!='PASS' else 'KEYBOARD_RUNTIME_REVIEW_JOIN_UNPROVEN')
        (out/'result.json').write_text(json.dumps(summary,indent=2)+'\n')
    return 1 # No blanket native success from supplemental screenshots.

def main():
    repo=pathlib.Path(__file__).resolve().parents[5]
    try:
        env=os.environ;event=json.loads(pathlib.Path(env['GITHUB_EVENT_PATH']).read_text())
        out=pathlib.Path(env['DEVICE_LAYOUT_OUT'])/'android-compact'
        return execute(repo,out,env,event)
    except Exception as e:
        print(json.dumps({'status':'INCOMPLETE','reason':e.phase if isinstance(e,b.Failure) else 'intake-input','nativeAcceptance':False}));return 1
if __name__=='__main__':raise SystemExit(main())
