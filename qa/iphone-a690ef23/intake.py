#!/usr/bin/env python3
"""Existing trusted manual intake. Upload only synthetic PNGs and allowlisted receipts."""
import hashlib,json,os,pathlib,re,shutil,subprocess,sys,tempfile,types,uuid
from run import run,SHA,TREE,CATEGORIES
ROOT=pathlib.Path(__file__).resolve().parents[2]
BRANCH='refs/heads/qa/snapscore-a690ef23-iphone-smoke'
def guard(e):
 required={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'self-hosted','RUNNER_OS':'macOS','GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_WORKFLOW':'device-layout-gate','GITHUB_REF':BRANCH}
 if any(e.get(k)!=v for k,v in required.items()):raise ValueError('TRUSTED_MANUAL_INTAKE_REQUIRED')
def sanitize(receipt,png):
 if receipt.get('sourceSha')!=SHA or receipt.get('sourceTree')!=TREE:raise ValueError('SOURCE_MISMATCH')
 category=receipt.get('categoryBefore')
 if category not in CATEGORIES or receipt.get('categoryAfter')!=category or receipt.get('runtimeRNScale') is not None:raise ValueError('CATEGORY_OR_RUNTIME_CLAIM')
 if receipt.get('scene') not in ['home','setup'] or receipt.get('nativeAcceptance') is not False or receipt.get('geometryPassed') is not False:raise ValueError('INVALID_ACCEPTANCE')
 h=hashlib.sha256(png).hexdigest()
 if receipt.get('pngSha256')!=h or not png.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('PNG_MISMATCH')
 build=receipt.get('buildSha256','')
 if not re.fullmatch('[a-f0-9]{64}',build):raise ValueError('BUILD_DIGEST_MISSING')
 return {'sourceSha':SHA,'sourceTree':TREE,'buildSha256':build,'scene':receipt['scene'],'observedSimulatorCategory':category,'stockRNReferenceMultiplier':CATEGORIES[category],'runtimeRNScale':None,'pngSha256':h,'deviceModel':'iPhone 16 Pro','offlineSynthetic':True,'geometryPassed':False,'nativeAcceptance':False,'aggregatePass':False}
def main():
 guard(os.environ) # Must run before any native call, source fetch, output or device mutation.
 for tool in ['xcrun','xcodebuild','node','npm','pod','maestro']:
  if not shutil.which(tool):raise ValueError('REQUIRED_INSTALLED_TOOL_MISSING')
 destination=pathlib.Path(os.environ['DEVICE_LAYOUT_OUT'])/'iphone-smoke-supplemental'
 destination.mkdir(parents=True,exist_ok=False)
 state={'status':'BLOCKED','aggregatePass':False,'captures':0,'runtimeRNScaleObserved':False,'paywall':'unrun','nativeJoin':'unrun','SE3':'unrun/report-only'}
 def cmd(args,timeout=30,env=None):return subprocess.check_output(args,timeout=timeout,stderr=subprocess.PIPE,env=env).decode().strip()
 udid=None
 with tempfile.TemporaryDirectory(prefix='snapscore-private-iphone-') as private:
  private=pathlib.Path(private);capture=private/'capture';name='SnapScore-QA-a690ef23-'+uuid.uuid4().hex[:12]
  try:
   if 'Xcode 26.4.1' not in cmd(['xcodebuild','-version']):raise ValueError('XCODE_VERSION_MISMATCH')
   runtime=[r for r in json.loads(cmd(['xcrun','simctl','list','runtimes','--json']))['runtimes'] if r.get('isAvailable') is True and r.get('version')=='26.4' and r.get('identifier','').startswith('com.apple.CoreSimulator.SimRuntime.iOS-')]
   if len(runtime)!=1:raise ValueError('INSTALLED_IOS_26_4_RUNTIME_REQUIRED')
   # Retrieve only fixed public app object when native checkout is shallow; no credential route.
   if subprocess.run(['git','-C',str(ROOT),'cat-file','-e',SHA+'^{commit}'],capture_output=True).returncode:
    publichome=private/'git-home';publichome.mkdir()
    clean={'PATH':os.environ['PATH'],'HOME':str(publichome),'GIT_CONFIG_NOSYSTEM':'1','GIT_TERMINAL_PROMPT':'0'}
    cmd(['git','-c','credential.helper=','-c','http.extraHeader=','-C',str(ROOT),'fetch','--no-tags','--depth=1','https://github.com/augsmog/QuickScore.git',SHA],60,clean)
   if cmd(['git','-C',str(ROOT),'status','--porcelain','--untracked-files=no']):raise ValueError('DIRTY_HARNESS_CHECKOUT')
   changed=cmd(['git','-C',str(ROOT),'diff',SHA,'--name-only']).splitlines()
   if any(not(p.startswith('qa/iphone-a690ef23/') or p in ['scoresnap/e2e/device-layout/scripts/run-ios-sim.sh','scoresnap/e2e/device-layout/lib/native-scripts.test.mjs']) for p in changed):raise ValueError('UNEXPECTED_APP_OR_WORKFLOW_CHANGE')
   if cmd(['git','-C',str(ROOT),'rev-parse',SHA+'^{tree}'])!=TREE:raise ValueError('APP_TREE_MISMATCH')
   state['harnessSha']=cmd(['git','-C',str(ROOT),'rev-parse','HEAD'])
   # Never select/erase an existing device. Mutate and delete only this invocation's created UUID.
   udid=cmd(['xcrun','simctl','create',name,'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro',runtime[0]['identifier']])
   if not re.fullmatch('[A-Fa-f0-9-]{36}',udid):udid=None;raise ValueError('INVALID_CREATED_UUID')
   cmd(['xcrun','simctl','boot',udid],60);cmd(['xcrun','simctl','bootstatus',udid,'-b'],180)
   run(types.SimpleNamespace(repo=str(ROOT),udid=udid,out=str(capture),device_name=name))
   state['status']='SUPPLEMENTAL_CAPTURE_COMPLETE_GATE_RED'
  except Exception as error:
   if re.fullmatch('[A-Z][A-Z0-9_]{1,80}',str(error)):state['failureCode']=str(error)
   else:state['failureCode']='NATIVE_PHASE_OR_SCENE_CHECK_FAILED'
   # Never print arbitrary tool stderr, paths, environment or application text to public logs.
   state['status']='BLOCKED_OR_PARTIAL_GATE_RED'
  finally:
   # Publish only the six allowlisted screenshot/receipt pairs that passed screening.
   for category in CATEGORIES:
    for prefix in ['home','four-player']:
     label=prefix+'-'+category;p=capture/(label+'.png');j=capture/(label+'.json')
     if p.is_file() and j.is_file():
      try:
       b=p.read_bytes();clean=sanitize(json.loads(j.read_text()),b)
       (destination/(label+'.png')).write_bytes(b);(destination/(label+'.json')).write_text(json.dumps(clean,indent=2)+'\n');state['captures']+=1
      except Exception:state['status']='RECEIPT_REJECTED_GATE_RED'
   if udid:
    for action in ['shutdown','delete']:
     try:cmd(['xcrun','simctl',action,udid],60)
     except Exception:state['cleanupIncomplete']=True
   (destination/'status.json').write_text(json.dumps(state,indent=2)+'\n')
 print(json.dumps(state));return 78
if __name__=='__main__':
 try:sys.exit(main())
 except Exception:print('IPHONE_SMOKE_BLOCKED_PREFLIGHT; aggregate remains red',file=sys.stderr);sys.exit(78)
