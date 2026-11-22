"""Strict native TD witness producer. Semantic inputs only; never glyph approval."""
import json,time,pathlib
import android_capture as b
import exercised_flow as f
import paywall_evidence as v

PHASES={'paywall-top':'top','paywall-free':'free','paywall-annual':'td','paywall-disabled':'disabled'}

def project(xml,section):
 root=f.tree(xml.decode('utf8','strict'),b.PACKAGE);nodes=list(root.iter('node'));parents={c:p for p in root.iter() for c in p}
 def labels(n):return {n.get('text',''),n.get('content-desc','')}-set([''])
 def measured(n):
  r=f.box(n);v.require(r is not None,'NATIVE_BOUNDS_INVALID');v.box(list(r));return list(r)
 for n in nodes:
  v.require(f.node_id(n) not in v.WRONG and 'Pro' not in labels(n),'COMPETING_SCENE_OR_MODAL')
 scrolls=[n for n in nodes if n.get('class')=='android.widget.ScrollView' and n.get('scrollable')=='true' and f.box(n)]
 v.require(len(scrolls)==1,'MODAL_SCROLL_OWNER_UNPROVEN');modal=measured(scrolls[0])
 for radio in [n for n in nodes if n.get('class')=='android.widget.RadioButton' and f.box(n)]:
  plans={label for child in radio.iter('node') for label in labels(child) if label in ('Free','Tournament Director')}
  v.require(len(plans)==1,'PLAN_SELECTION_UNPROVEN')
 def ancestors(n):
  yield n
  while n in parents:n=parents[n];yield n
 witnesses=[]
 for label,(role,owner,enabled) in v.WITNESSES.items():
  hits=[n for n in nodes if label in labels(n) and f.box(n)]
  # No substring splitting or collapsing unrelated labels/owners.
  v.require(len(hits)<=1,'UNKNOWN_OR_DUPLICATE_NATIVE_LABEL')
  if not hits:continue
  n=hits[0];bounds=measured(n);chain=list(ancestors(n));v.require(scrolls[0] in chain,'NATIVE_LABEL_OWNERSHIP_UNPROVEN')
  owner_node=None;selected=None
  if owner in ('free-radio','td-radio-selected'):
   radios=[a for a in chain if a.get('class')=='android.widget.RadioButton']
   v.require(len(radios)==1,'PLAN_SELECTION_UNPROVEN');owner_node=radios[0]
   v.require(owner_node.get('checkable')=='true' and owner_node.get('checked') in ('true','false'),'PLAN_SELECTION_UNPROVEN')
   selected=owner_node.get('checked')=='true';v.require(selected==(owner=='td-radio-selected'),'PLAN_SELECTION_UNPROVEN')
   v.require(n.get('class')=='android.widget.TextView','NATIVE_LABEL_ROLE_STATE_UNPROVEN')
  elif role=='button':
   buttons=[a for a in chain if a.get('class')=='android.widget.Button']
   v.require(len(buttons)==1,'NATIVE_LABEL_ROLE_STATE_UNPROVEN');owner_node=buttons[0]
   v.require(owner_node.get('enabled')==str(enabled).lower(),'NATIVE_LABEL_ROLE_STATE_UNPROVEN')
  else:v.require(n.get('class')=='android.widget.TextView','NATIVE_LABEL_ROLE_STATE_UNPROVEN')
  owner_bounds=measured(owner_node) if owner_node is not None else modal
  v.require(v.fits(bounds,owner_bounds) and v.fits(owner_bounds,modal),'NATIVE_LABEL_OWNERSHIP_UNPROVEN')
  row={'label':label,'role':role,'owner':owner,'enabled':enabled,'package':b.PACKAGE,'visible':True,'labelSource':'native-semantic','bounds':bounds,'ownerBounds':owner_bounds}
  if selected is not None:row.update(ownerRole='radio',ownerSelected=selected)
  witnesses.append(row)
 v.require(v.SECTIONS[section]<={n['label'] for n in witnesses},'TOP_ANCHOR_OR_SECTION_NOT_OBSERVED')
 return {'modalBounds':modal,'witnesses':witnesses,'section':section,'semanticValidationOnly':True,'paintedTextProven':False}

def route_started(d,before):
 v.require(before=='round-settings','ORDINARY_START_ROUTE_UNPROVEN')
 prior=json.loads((d.out/'start-viability/receipt.json').read_text());rounds=json.loads((d.out/'stress-eight-rounds/receipt.json').read_text())
 v.require(prior.get('checkpointEvidence',{}).get('enabled') is True and rounds.get('rounds_observation',{}).get('selectedCount')==4,'ORDINARY_START_ROUTE_UNPROVEN')
 for record in (prior,rounds):
  v.require(all(record.get(k)==d.c['binding'][k] for k in ('source_sha','source_tree','apk_sha256')) and record.get('bootIdentitySha256')==d.device.identity(),'EXACT_SOURCE_BUILD_JOB_DRIFT')
 d.td_start={'actionNs':time.monotonic_ns(),'prior':prior}

def route_opened(d):
 d.check_identity();project(d.device.hierarchy(),'top');obs=d.device.observation;p=d.td_start['prior']
 v.require(p['bootIdentitySha256']==d.device.identity() and obs['activityIdentitySha256']==p['osBefore']['activityIdentitySha256'],'CURRENT_MODAL_DEVICE_OR_SCALE_UNPROVEN')
 d.td_route={'mode':'ordinary-ui','fromScene':'round-settings','fromObserved':True,'actionId':'contest-start','actionLabel':'Start','enabled':True,'pressCount':1,'openedScope':'td-paywall-modal','openedObserved':True,'selectedTournament':True,'sourceHasRealDraft':True,'directRouteOrSyntheticFallback':False,'initiatedPurchaseOrRestore':False,'actionNs':d.td_start['actionNs'],'openedNs':time.monotonic_ns(),'deviceSession':p['bootIdentitySha256'],'modalSession':b.digest(str(d.td_start['actionNs']).encode()),'activityIdentitySha256':obs['activityIdentitySha256']}
 (d.out/'td-route.json').write_text(json.dumps(d.td_route)+'\n')
 d.td_modal=True

def shot(d,name):
 section=PHASES[name];d.phase=name
 def projection(xml,obs):
  if not (obs and obs.get('osScale') in (1.,1.3) and obs.get('pixelSize')==[1080,2400] and obs.get('densityDpi')==480 and obs.get('activityIdentitySha256')==d.td_route['activityIdentitySha256'] and obs.get('insets',{}).get('provider')=='aosp-api35-wms-client-insets/v1'):
   raise f.CaptureBoundaryFailure('CURRENT_MODAL_DEVICE_OR_SCALE_UNPROVEN')
  return project(xml,section)
 def check(xml,_):return [tuple(n['bounds']) for n in projection(xml,d.device.observation)['witnesses']]
 try:
  b.capture(d.device,d.c['binding'],name,d.out/name,final_source_check=d.check_identity,scene_check=check,evidence_observer=projection)
 except v.Blocked as e:
  d.report.append({'checkpoint':name,'captured':False,'status':'TD_SEMANTIC_INPUT_BLOCKED','reason':str(e),'paintedTextProven':False})
  if section=='top':raise
  return
 d.report.append({'checkpoint':name,'captured':True,'status':'PAINTED_TEXT_REVIEW_REQUIRED','paintedTextProven':False})

def assemble(root,expected):
 """Post-run only, with external artifact identity; never invent/pin own expectation.
 Caller retains result, independently pins its bytes, then runs unchanged validator CLI.
 """
 root=pathlib.Path(root);packet={'schema':'snapscore-android-td-capture/v1','repo':v.REPO,**{k:expected[k] for k in v.BIND},'scope':'ordinary-free-host-td-offline-fallback','profile':'android-compact','lanes':[]}
 for scale,folder in [('1.000','scale-1.0-continuation'),('1.300','scale-1.3-continuation')]:
  lane=root/folder;route=v.strict_json((lane/'td-route.json').read_bytes());frames=[];covered=set()
  for name,section in PHASES.items():
   path=lane/name/'receipt.json'
   if not path.exists():continue
   r=v.strict_json(path.read_bytes());e=r.get('checkpointEvidence',{});times=r.get('captureTimes',{})
   for key,expected_key in [('source_sha','sourceSha'),('source_tree','sourceTree'),('apk_sha256','apkSha256')]:v.require(r[key]==expected[expected_key],'EXACT_SOURCE_BUILD_JOB_DRIFT')
   v.require(r['source_sha']==expected['integrationHead'] and r['job']['GITHUB_RUN_ID']==expected['runId'] and r['job']['GITHUB_RUN_ATTEMPT']==expected['runAttempt'],'EXACT_SOURCE_BUILD_JOB_DRIFT')
   present={k for k,labels in v.SECTIONS.items() if labels<={n['label'] for n in e.get('witnesses',[])}}
   # A fresh phase was captured, but a status-icon-only repaint adds no section.
   if not present-covered:continue
   frame_id=scale+'-'+name;frame={'frameId':frame_id,'path':folder+'/'+name+'/capture.png','pngSha256':r['screenshot_sha256'],'kind':'original-full-native-screenshot','syntheticFallback':False,'screenshotStartNs':times['screenshotStartNs'],'screenshotEndNs':times['screenshotEndNs']}
   for phase in ('before','after'):
    obs=r['osBefore' if phase=='before' else 'osAfter'];v.require(obs['osScale']==float(scale),'CURRENT_MODAL_DEVICE_OR_SCALE_UNPROVEN')
    frame[phase]={'phase':phase,'frameId':frame_id,'package':b.PACKAGE,'foregroundPackage':b.PACKAGE,'deviceSession':r['bootIdentitySha256'],'modalSession':route['modalSession'],'activityIdentitySha256':obs['activityIdentitySha256'],'scene':'td-paywall-modal','singleCurrentModal':True,'proPlanVisible':False,'nativeHierarchy':True,'physicalSizePx':obs['pixelSize'],'densityDpi':obs['densityDpi'],'settingsScale':scale,'activityScale':scale,'visibleOtherSceneMarkers':[],'observedNs':times[phase+'Ns'],'modalBounds':e['modalBounds'],'witnesses':e['witnesses']}
   frames.append(frame);covered|=present
  packet['lanes'].append({'observedScale':scale,'route':route,'frames':frames})
 # Validate all supplied evidence; this can return only REVIEW_REQUIRED, never PASS.
 result=v.inspect(expected,packet,lambda path,digest:v.pinned(v.path_in(root,path),digest))
 return packet,result

def main():
 import argparse
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--artifact-root',type=pathlib.Path,required=True);p.add_argument('--context',type=pathlib.Path,required=True);p.add_argument('--context-sha256',required=True);a=p.parse_args()
 try:
  expected=v.strict_json(v.pinned(a.context,a.context_sha256));packet,result=assemble(a.artifact_root,expected)
  dest=a.artifact_root/'td-capture.json';v.require(not dest.exists(),'OUTPUT_ALREADY_EXISTS')
  data=(json.dumps(packet,sort_keys=True)+'\n').encode();dest.write_bytes(data)
  result['captureManifestSha256']=v.sha(data);result['externalManifestPinStillRequired']=True
 except (v.Blocked,OSError,KeyError,ValueError) as e:
  result={'status':'BLOCKED','reason':str(e) if isinstance(e,v.Blocked) else 'TD_INPUT_UNAVAILABLE','nativeAcceptance':False,'paintedTextProven':False}
 print(json.dumps(result,sort_keys=True));return 78
if __name__=='__main__':raise SystemExit(main())
