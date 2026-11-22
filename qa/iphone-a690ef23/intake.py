#!/usr/bin/env python3
"""Existing trusted manual intake. Upload only synthetic PNGs and allowlisted receipts."""
import hashlib,json,os,pathlib,re,shutil,subprocess,sys,tempfile,types,uuid
from run import run,SHA,TREE,CATEGORIES,Progress
ROOT=pathlib.Path(__file__).resolve().parents[2]
BRANCH='refs/heads/qa/snapscore-a690ef23-iphone-smoke'
def guard(e):
 required={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'self-hosted','RUNNER_OS':'macOS','GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_WORKFLOW':'device-layout-gate','GITHUB_REF':BRANCH}
 if any(e.get(k)!=v for k,v in required.items()):raise ValueError('TRUSTED_MANUAL_INTAKE_REQUIRED')
def sanitize(receipt,png):
 if receipt.get('sourceSha')!=SHA or receipt.get('sourceTree')!=TREE:raise ValueError('SOURCE_MISMATCH')
 category=receipt.get('categoryBefore')
 if category not in CATEGORIES or receipt.get('categoryAfter')!=category or receipt.get('runtimeRNScale') is not None:raise ValueError('CATEGORY_OR_RUNTIME_CLAIM')
 if receipt.get('scene') not in ['home','setup','add-player','paywall','paywall-free','paywall-td','paywall-disabled'] or receipt.get('nativeAcceptance') is not False or receipt.get('geometryPassed') is not False:raise ValueError('INVALID_ACCEPTANCE')
 if str(receipt.get('scene')).startswith('paywall') and receipt.get('offline') is not True:raise ValueError('OFFLINE_PAYWALL_REQUIRED')
 mode=receipt.get('processMode')
 if mode not in ('warm','cold','post-cold') or receipt.get('coldProcessVerified') is not (mode=='cold'):raise ValueError('PROCESS_MODE_UNVERIFIED')
 h=hashlib.sha256(png).hexdigest()
 if receipt.get('pngSha256')!=h or not png.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('PNG_MISMATCH')
 build=receipt.get('buildSha256','')
 if not re.fullmatch('[a-f0-9]{64}',build):raise ValueError('BUILD_DIGEST_MISSING')
 return {'sourceSha':SHA,'sourceTree':TREE,'buildSha256':build,'scene':receipt['scene'],'observedSimulatorCategory':category,'stockRNReferenceMultiplier':CATEGORIES[category],'runtimeRNScale':None,'pngSha256':h,'processMode':mode,'coldProcessVerified':mode=='cold','deviceModel':'iPhone 16 Pro','offlineSynthetic':True,'catalogEvidence':'offline-no-provider-config; fallback-only' if receipt['scene'].startswith('paywall') else None,'annualTDFallbackPriceObserved':receipt['scene']=='paywall-td','disabledPurchasingObserved':receipt['scene']=='paywall-disabled','purchaseRestore':'unrun','geometryPassed':False,'nativeAcceptance':False,'aggregatePass':False}
def sanitize_draft(r,category):
 if category not in CATEGORIES or type(r.get('namesRetained')) is not bool or r!={'sourceSha':SHA,'sourceTree':TREE,'category':category,'namesRetained':r.get('namesRetained'),'functionalDraftRetained':True,'twoRoundControlVisible':True,'aggregatePass':False}:raise ValueError('DRAFT_RECEIPT_INVALID')
 return {'category':category,'namesRetained':r['namesRetained'],'functionalDraftRetained':True,'twoRoundControlVisible':True}
RUNTIME_ID='com.apple.CoreSimulator.SimRuntime.iOS-26-4'
def select_runtime(inventory):
 # Only typed, bounded iOS tuples may reach public status; never names/paths/errors.
 result={'iosRuntimes':[],'selected':None,'reason':'IOS_RUNTIME_INVENTORY_INVALID'}
 if not isinstance(inventory,dict) or not isinstance(inventory.get('runtimes'),list):return result
 rows=inventory['runtimes']
 if len(rows)>128:result['reason']='IOS_RUNTIME_INVENTORY_LIMIT';return result
 invalid=False
 for row in rows:
  if not isinstance(row,dict):invalid=True;continue
  identifier=row.get('identifier')
  if not isinstance(identifier,str):invalid=True;continue
  if not identifier.startswith('com.apple.CoreSimulator.SimRuntime.iOS-'):continue
  if not re.fullmatch(r'com\.apple\.CoreSimulator\.SimRuntime\.iOS-[0-9]{1,3}(?:-[0-9]{1,3}){1,2}',identifier):invalid=True;continue
  version=row.get('version');available=row.get('isAvailable')
  if not isinstance(version,str) or not re.fullmatch(r'[0-9]{1,3}(?:\.[0-9]{1,3}){1,2}',version):version=None;invalid=True
  if type(available) is not bool:available=None;invalid=True
  result['iosRuntimes'].append({'identifier':identifier,'version':version,'isAvailable':available})
 if len(result['iosRuntimes'])>32:result['iosRuntimes']=[];result['reason']='IOS_RUNTIME_INVENTORY_LIMIT';return result
 if invalid:return result
 def exact_version(version):return version in ('26.4','26.4.0','26.4.1')
 matches=[r for r in result['iosRuntimes'] if r['identifier']==RUNTIME_ID or exact_version(r['version'])]
 if not matches:result['reason']='IOS_26_4_RUNTIME_MISSING'
 elif len(matches)!=1:result['reason']='IOS_26_4_RUNTIME_AMBIGUOUS'
 elif matches[0]['identifier']!=RUNTIME_ID or not exact_version(matches[0]['version']):result['reason']='IOS_26_4_IDENTITY_MISMATCH'
 elif matches[0]['isAvailable'] is not True:result['reason']='IOS_26_4_RUNTIME_UNAVAILABLE'
 else:result.update(selected=RUNTIME_ID,reason='SELECTED')
 return result

def main():
 guard(os.environ) # Must run before any native call, source fetch, output or device mutation.
 for tool in ['xcrun','xcodebuild','node','npm','pod','maestro']:
  if not shutil.which(tool):raise ValueError('REQUIRED_INSTALLED_TOOL_MISSING')
 destination=pathlib.Path(os.environ['DEVICE_LAYOUT_OUT'])/'iphone-smoke-supplemental'
 destination.mkdir(parents=True,exist_ok=False)
 state={'status':'BLOCKED','aggregatePass':False,'captures':0,'runtimeRNScaleObserved':False,'paywall':'unrun','nativeJoin':'unrun','SE3':'unrun/report-only'}
 def cmd(args,timeout=30,env=None):return subprocess.check_output(args,timeout=timeout,stderr=subprocess.PIPE,env=env).decode().strip()
 progress=Progress()
 udid=None
 with tempfile.TemporaryDirectory(prefix='snapscore-private-iphone-') as private:
  private=pathlib.Path(private);capture=private/'capture';name='SnapScore-QA-a690ef23-'+uuid.uuid4().hex[:12]
  try:
   if 'Xcode 26.4.1' not in cmd(['xcodebuild','-version']):raise ValueError('XCODE_VERSION_MISMATCH')
   state['runtimeSelection']={'iosRuntimes':[],'selected':None,'reason':'IOS_RUNTIME_QUERY_FAILED'}
   try:inventory=json.loads(cmd(['xcrun','simctl','list','runtimes','--json']))
   except (ValueError,subprocess.SubprocessError):raise ValueError('IOS_RUNTIME_QUERY_FAILED') from None
   state['runtimeSelection']=select_runtime(inventory)
   if state['runtimeSelection']['selected'] is None:raise ValueError(state['runtimeSelection']['reason'])
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
   udid=cmd(['xcrun','simctl','create',name,'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro',state['runtimeSelection']['selected']])
   if not re.fullmatch('[A-Fa-f0-9-]{36}',udid):udid=None;raise ValueError('INVALID_CREATED_UUID')
   cmd(['xcrun','simctl','boot',udid],60);cmd(['xcrun','simctl','bootstatus',udid,'-b'],180)
   run(types.SimpleNamespace(repo=str(ROOT),udid=udid,out=str(capture),device_name=name,progress=progress))
   state['status']='BLOCKED_OR_PARTIAL_GATE_RED' if progress.categoryFailures else 'SUPPLEMENTAL_CAPTURE_COMPLETE_GATE_RED'
  except Exception as error:
   if re.fullmatch('[A-Z][A-Z0-9_]{1,80}',str(error)):state['failureCode']=str(error)
   else:state['failureCode']='NATIVE_PHASE_OR_SCENE_CHECK_FAILED'
   # Never print arbitrary tool stderr, paths, environment or application text to public logs.
   state['status']='BLOCKED_OR_PARTIAL_GATE_RED'
  finally:
   state['phaseDiagnostic']=progress.receipt()
   # Publish only the twenty-four allowlisted screenshot/receipt pairs that passed screening.
   for category in CATEGORIES:
    for prefix in ['home','home-cold','four-player','add-player','paywall','paywall-free','paywall-td','paywall-disabled']:
     label=prefix+'-'+category;p=capture/(label+'.png');j=capture/(label+'.json')
     if p.is_file() and j.is_file():
      try:
       b=p.read_bytes();clean=sanitize(json.loads(j.read_text()),b)
       expected_scene={'home':'home','home-cold':'home','four-player':'setup','add-player':'add-player','paywall':'paywall','paywall-free':'paywall-free','paywall-td':'paywall-td','paywall-disabled':'paywall-disabled'}[prefix]
       expected_mode={'home':'warm','home-cold':'cold','four-player':'post-cold','add-player':'post-cold','paywall':'post-cold','paywall-free':'post-cold','paywall-td':'post-cold','paywall-disabled':'post-cold'}[prefix]
       if clean['scene']!=expected_scene or clean['processMode']!=expected_mode or clean['observedSimulatorCategory']!=category:raise ValueError('CAPTURE_LABEL_MISMATCH')
       (destination/(label+'.png')).write_bytes(b);(destination/(label+'.json')).write_text(json.dumps(clean,indent=2)+'\n');state['captures']+=1
      except Exception:state['status']='RECEIPT_REJECTED_GATE_RED'
   state['addPlayerChecks']=[]
   for category in CATEGORIES:
    action=capture/('add-player-action-'+category+'.json')
    if action.is_file():
     try:
      r=json.loads(action.read_text())
      if r=={'sourceSha':SHA,'sourceTree':TREE,'category':category,'fourPlayerCheckpointPreserved':True,'fifthPlayerVisibleAfterTap':True,'aggregatePass':False}:state['addPlayerChecks'].append({'category':category,'fifthPlayerVisibleAfterTap':True,'geometryPassed':False})
      else:state['status']='RECEIPT_REJECTED_GATE_RED'
     except Exception:state['status']='RECEIPT_REJECTED_GATE_RED'
   state['paywallSections']=[]
   from pricing import SECTIONS,SECTION_PHASES
   for category in CATEGORIES:
    section_file=capture/('paywall-sections-'+category+'.json')
    if section_file.is_file():
     try:
      r=json.loads(section_file.read_text())
      if r.get('sourceSha')!=SHA or r.get('sourceTree')!=TREE or r.get('category')!=category or r.get('aggregatePass') is not False:raise ValueError('SECTION_RECEIPT_INVALID')
      rows=r['sections']
      if len(rows)!=3 or [v['section'] for v in rows]!=list(SECTIONS):raise ValueError('SECTION_RECEIPT_INVALID')
      for row in rows:
       expected={'section':row['section'],'status':'captured'} if row.get('status')=='captured' else {'section':row['section'],'status':'unavailable','reason':'SECTION_VISIBILITY_OR_STATE_UNVERIFIED','step':row.get('step')}
       if row.get('status')!='captured' and row.get('step') not in SECTION_PHASES:raise ValueError('SECTION_RECEIPT_INVALID')
       if row!=expected:raise ValueError('SECTION_RECEIPT_INVALID')
       if row['status']=='captured' and not (destination/(row['section']+'-'+category+'.json')).is_file():raise ValueError('SECTION_CAPTURE_MISSING')
      state['paywallSections'].append({'category':category,'sections':rows})
     except Exception:state['status']='RECEIPT_REJECTED_GATE_RED'
   state['paywallDraftChecks']=[]
   for category in CATEGORIES:
    draft=capture/('paywall-draft-'+category+'.json')
    if draft.is_file():
     try:
      r=json.loads(draft.read_text())
      state['paywallDraftChecks'].append(sanitize_draft(r,category))
     except Exception:state['status']='RECEIPT_REJECTED_GATE_RED'
   state['paywall']='offline-fallback-header-and-draft-only' if len(state['paywallDraftChecks'])==3 else 'unrun-or-partial'
   if udid:
    for action in ['shutdown','delete']:
     try:cmd(['xcrun','simctl',action,udid],60)
     except Exception:state['cleanupIncomplete']=True
   (destination/'status.json').write_text(json.dumps(state,indent=2)+'\n')
 print(json.dumps(state));return 78
if __name__=='__main__':
 try:sys.exit(main())
 except Exception:print('IPHONE_SMOKE_BLOCKED_PREFLIGHT; aggregate remains red',file=sys.stderr);sys.exit(78)
