#!/usr/bin/env python3
"""Compatibility adapter: successful smoke ALWAYS remains incomplete for aggregate gate."""
import importlib.util,json,os,pathlib,subprocess,sys,tempfile,hashlib,shutil,time
from contextlib import contextmanager
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[1]
APP='a073d5761b77f3e01610acebaf5d98f76a920fb5'
def conclude(platform,smoke_ok=False,error=None):
 return {'appSourceSha':APP,'platform':platform,'smokePassed':smoke_ok,'status':'INCOMPLETE_REQUIRED_NATIVE_COVERAGE' if smoke_ok else 'BLOCKED','missing':['required-layout-checkpoints','real-runtime-paywall','native-two-client-Join','geometry-and-independent-review']+(['genuine-initialized-iOS-observer'] if platform=='ios' else []),'aggregatePass':False,'error':error},78

BRANCH='refs/heads/qa/snapscore-a690ef23-android-smoke'
def guard(env):
 required={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_WORKFLOW':'device-layout-gate','GITHUB_REF':BRANCH}
 if any(env.get(k)!=v for k,v in required.items()):raise ValueError('TRUSTED_MANUAL_INTAKE_REQUIRED')

@contextmanager
def isolated_source(out):
 td=tempfile.mkdtemp(prefix='snapscore-frozen-app-')
 try:yield td
 finally:
  original_failure=sys.exc_info()[0] is not None
  cleaned=False
  for attempt in range(3):
   try:shutil.rmtree(td);cleaned=True;break
   except FileNotFoundError:cleaned=True;break
   except OSError:
    if attempt<2:time.sleep(0.2)
  (out/'source-cleanup.json').write_text(json.dumps({'cleaned':cleaned,'attempts':attempt+1,'originalFailurePreserved':original_failure})+'\n')
  if not cleaned and not original_failure:raise RuntimeError('SOURCE_CLEANUP_INCOMPLETE')

def main(platform):
 guard(os.environ) # Before output creation, source retrieval or any device/build call.
 if platform not in ('android','ios'):raise ValueError('unknown platform')
 out=pathlib.Path(os.environ['DEVICE_LAYOUT_OUT'])
 out.mkdir(parents=True,exist_ok=True)
 status=out/(platform+'-adapter-status.json')
 if status.exists():raise ValueError('output already used')
 def command(*a):return subprocess.check_output(a,timeout=30,stderr=subprocess.PIPE).decode().strip()
 # checkout@v4 native jobs are shallow: retrieve only the already-public pinned app object if absent.
 if subprocess.run(['git','-C',str(ROOT),'cat-file','-e',APP+'^{commit}'],capture_output=True).returncode:
  with tempfile.TemporaryDirectory(prefix='snapscore-public-read-') as publichome:
   cleanenv={'PATH':os.environ['PATH'],'HOME':publichome,'GIT_CONFIG_NOSYSTEM':'1','GIT_TERMINAL_PROMPT':'0'}
   subprocess.run(['git','-c','credential.helper=','-c','http.extraHeader=','-C',str(ROOT),'fetch','--no-tags','--depth=1','https://github.com/augsmog/QuickScore.git',APP],env=cleanenv,check=True,timeout=60,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 identity={'harnessHead':command('git','-C',str(ROOT),'rev-parse','HEAD'),'harnessDiffSha256':hashlib.sha256(subprocess.check_output(['git','-C',str(ROOT),'diff','--binary',APP],timeout=30)).hexdigest()}
 ok=False;error=None
 try:
  subprocess.run([sys.executable,str(HERE/'check-source.py')],check=True,timeout=30)
  if platform=='ios':raise ValueError('genuine initialized runtime observer unavailable; no capture attempted')
  cfg=json.loads(pathlib.Path(os.environ['DEVICE_LAYOUT_ANDROID_SMOKE_CONFIG']).read_text()) if os.environ.get('DEVICE_LAYOUT_ANDROID_SMOKE_CONFIG') else None
  # Export clean app independently; never build from harness tree or put source into uploaded output.
  with isolated_source(out) as td:
   command('git','init','-q',td)
   command('git','-C',td,'fetch','--quiet','--depth=1',str(ROOT),APP)
   command('git','-C',td,'checkout','--quiet','--detach',APP)
   if cfg is None:
    sys.path.insert(0,str(HERE/'android'))
    from hosted import execute
    execute(td,out/'android-hosted-smoke-not-gate');ok=True
   else:
    cfg['source']=td;cfg['out']=str(out/'android-smoke-not-gate');cfg.setdefault('expectedScale',1.0)
    modspec=importlib.util.spec_from_file_location('smoke',HERE/'android/smoke.py');mod=importlib.util.module_from_spec(modspec);modspec.loader.exec_module(mod)
    mod.run(cfg);ok=True

 except Exception as e:error=type(e).__name__+': '+str(e)
 receipt,rc=conclude(platform,ok,error);receipt.update(identity)
 status.write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({'status':receipt['status'],'smokePassed':ok,'aggregatePass':False,'exit':rc}))
 return rc
if __name__=='__main__':
 try:sys.exit(main(sys.argv[1]))
 except Exception as e:print('BLOCKED adapter: '+str(e),file=sys.stderr);sys.exit(78)
