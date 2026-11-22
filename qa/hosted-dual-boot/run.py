"""Read-only exact Intel simulator catalog shape; never creates or boots anything."""
import json,os,re,signal,subprocess,sys,time
import two_iphone_preflight as probe
REF='refs/heads/qa/snapscore-hosted-dual-boot-intel'
FLOOR=12*(1<<30)
TRANSPORT_MAX_NS=30_000_000_000
EXPECTED_SDK=("26.4", "23E252")
INTEL_RAM_BYTES=14_000_000_000
INTEL_LOGICAL_CPUS=4

def transport_admission():
 # Same host clock across Python >=3.10 processes on macOS, not shell wall time.
 raw=os.environ.get('SNAPSCORE_DUAL_BOOT_STARTED_NS','')
 if not re.fullmatch('[0-9]{1,20}',raw):raise probe.GateError('transport stamp invalid','TRANSPORT_BUDGET_INVALID')
 elapsed=time.monotonic_ns()-int(raw)
 if elapsed<0:raise probe.GateError('transport stamp invalid','TRANSPORT_BUDGET_INVALID')
 if elapsed>TRANSPORT_MAX_NS:raise probe.GateError('transport duration exceeded','TRANSPORT_BUDGET_EXHAUSTED')

HELP_SECONDS=5
JSON_CAP=1_000_000
HELP_CAP=65_536
SCOPE='intel-simulator-catalog-shape-only'


class DuplicateKey(ValueError):
 pass


def unique_pairs(pairs):
 result={}
 for key,value in pairs:
  if key in result:
   raise DuplicateKey
  result[key]=value
 return result


def bucket(n):
 if n==0:return '0'
 if n==1:return '1'
 if n<=4:return '2-4'
 if n<=16:return '5-16'
 if n<=probe.DEVICE_SCOPE_LIMIT:return '17-256'
 return '>256'


def reject_nonjson_constant(_):
 raise ValueError


def selected_shape(raw):
 # All result values are fixed enums, bounded buckets, or booleans. No key, value, path or ID escapes.
 info={'classification':'JSON_INVALID','topLevelDevicesOnly':None,'runtimeGroupCount':None,
       'targetGroupPresent':None,'targetRowCount':None,'foreignGroupHasRows':None}
 if len(raw)>JSON_CAP:
  return dict(info,classification='JSON_OVERSIZE')
 try:doc=json.loads(raw,object_pairs_hook=unique_pairs,parse_constant=reject_nonjson_constant)
 except DuplicateKey:return dict(info,classification='JSON_DUPLICATE_KEY')
 except (ValueError,RecursionError):return info
 if not isinstance(doc,dict) or set(doc)!={'devices'}:
  return dict(info,classification='TOP_LEVEL_UNEXPECTED',topLevelDevicesOnly=False)
 info['topLevelDevicesOnly']=True
 groups=doc['devices']
 if not isinstance(groups,dict):return dict(info,classification='DEVICES_NOT_GROUPED')
 info['runtimeGroupCount']=bucket(len(groups))
 info['targetGroupPresent']=probe.RUNTIME in groups
 info['foreignGroupHasRows']=any(isinstance(v,list) and len(v)>0 for k,v in groups.items() if k!=probe.RUNTIME)
 if not groups:return dict(info,classification='EMPTY_GROUP_MAP')
 if not info['targetGroupPresent']:return dict(info,classification='TARGET_GROUP_ABSENT')
 rows=groups[probe.RUNTIME]
 if isinstance(rows,list):info['targetRowCount']=bucket(len(rows))
 if len(groups)!=1:return dict(info,classification='EXTRA_GROUPS_RETURNED')
 if not isinstance(rows,list):return dict(info,classification='TARGET_ROWS_NOT_ARRAY')
 if len(rows)>probe.DEVICE_SCOPE_LIMIT:return dict(info,classification='TARGET_ROW_LIMIT_EXCEEDED')
 if not rows:return dict(info,classification='TARGET_GROUP_EMPTY')
 seen=set()
 for row in rows:
  if not isinstance(row,dict):return dict(info,classification='TARGET_ROW_NOT_OBJECT')
  uid,name,state=(row.get(k) for k in ('udid','name','state'))
  if not isinstance(uid,str) or not probe.UUID_RE.fullmatch(uid):
   return dict(info,classification='TARGET_UUID_CASE_DRIFT' if isinstance(uid,str) and
               probe.UUID_RE.fullmatch(uid.upper()) else 'TARGET_UUID_INVALID')
  if uid in seen:return dict(info,classification='TARGET_UUID_DUPLICATE')
  seen.add(uid)
  if not all(isinstance(x,str) and 0<len(x)<=512 for x in (name,state)):
   return dict(info,classification='TARGET_NAME_OR_STATE_INVALID')
 return dict(info,classification='TARGET_GROUP_VALID_NONEMPTY')


def help_shape(raw):
 info={'classification':'HELP_USAGE_UNRECOGNIZED','genericSearchAdvertised':None,
       'availableFilterAdvertised':None,'explicitRuntimeIdentifierAdvertised':None}
 if len(raw)>HELP_CAP:return dict(info,classification='HELP_OVERSIZE')
 # The runtime on this exact Xcode is the authority. Take only a recognized usage line;
 # arbitrary examples, aliases or free-form strings never become proof or output.
 lines=[' '.join(s.strip().lower().split()) for s in raw.splitlines()]
 matches=[line for line in lines if re.match(r'^(?:usage:\s*)?simctl list(?:\s|$)',line)]
 if len(matches)!=1 or not all(k in matches[0] for k in ('devices','devicetypes','runtimes')):
  return info
 line=matches[0]
 return dict(info,classification='HELP_USAGE_OBSERVED',
             genericSearchAdvertised=bool(re.search(r'\bsearch[ -]term\b',line)),
             availableFilterAdvertised=bool(re.search(r'\bavailable\b',line)),
             explicitRuntimeIdentifierAdvertised=bool(re.search(r'\bruntime[ -](?:identifier|id)\b',line)))


def elapsed(start):return round(max(0.0,time.monotonic()-start),3)


def assess(d):
 budget=probe.catalog_budget()
 probe.validate_catalog_pins(d,budget)
 d.at('catalog-runtime-devices')
 started=time.monotonic()
 try:
  # This exact selected device read runs once before help; help cannot warm it.
  raw=probe.command('simctl','list','-j','devices',probe.RUNTIME,
                    timeout=budget(probe.CATALOG_DEVICE_SECONDS))
  selected_elapsed=elapsed(started)
  selected=selected_shape(raw)
 except (probe.GateError,OSError) as e:
  if getattr(e,'code',None)=='INTERRUPTED':raise
  selected_elapsed=elapsed(started)
  selected={'classification':probe.reason(e,d.stage)['code']}
 selected['elapsedSeconds']=selected_elapsed

 d.at('catalog-help-list')
 started=time.monotonic()
 try:
  raw_help=probe.command('simctl','help','list',timeout=budget(HELP_SECONDS),help_text=True)
  help_elapsed=elapsed(started)
  help_info=help_shape(raw_help)
 except (probe.GateError,OSError) as e:
  if getattr(e,'code',None)=='INTERRUPTED':raise
  help_elapsed=elapsed(started)
  help_info={'classification':probe.reason(e,d.stage)['code']}
 help_info['elapsedSeconds']=help_elapsed
 return {'catalogPinsVerified':True,'selectedList':selected,'helpList':help_info}

def run():
 expected={'GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':REF,'GITHUB_JOB':'dual_boot','DEVELOPER_DIR':probe.XCODE}
 if any(os.environ.get(k)!=v for k,v in expected.items()):raise probe.GateError('EXACT_JOB_SCOPE_REQUIRED','HOST_SCOPE')
 sha=os.environ.get('GITHUB_SHA','')
 if not re.fullmatch('[0-9a-f]{40}',sha):raise probe.GateError('HARNESS_SHA_REQUIRED','HOST_SCOPE')
 tmp,_=probe.job_context()
 d=probe.Diagnostic()
 result={'harnessSha':sha,'scope':SCOPE,'nativeAppProof':False,'buildBudgetPass':None,
         'catalogPinsVerified':False,'deviceMutationsRequested':False,'capacityQualified':False,
         'runnerLabel':probe.HOST_LABEL,'processorArchitecture':probe.HOST_ARCH}
 started=time.monotonic();phase='installed-readbacks'
 try:
  d.at('transport-admission');transport_admission()
  d.at('memory-readback')
  try:memory=subprocess.run(['/usr/sbin/sysctl','-n','hw.memsize','hw.logicalcpu'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=10,check=True)
  except subprocess.TimeoutExpired as e:raise probe.GateError('memory unavailable','COMMAND_TIMEOUT') from e
  except subprocess.CalledProcessError as e:raise probe.GateError('memory unavailable','COMMAND_NONZERO') from e
  profile=re.fullmatch(rb'([0-9]{1,20})\n([0-9]{1,3})\s*',memory.stdout)
  if not profile:raise probe.GateError('memory/CPU readback invalid','MEMORY_READBACK_INVALID')
  result['physicalRamBytes'],result['logicalCpuCount']=map(int,profile.groups())
  if result['physicalRamBytes']<INTEL_RAM_BYTES or result['logicalCpuCount']<INTEL_LOGICAL_CPUS:
   raise probe.GateError('standard Intel capacity profile mismatch','INTEL_CAPACITY_PROFILE_MISMATCH')
  d.at('sdk-readback')
  sdk=probe.command('--sdk','iphonesimulator','--show-sdk-version')
  sdkbuild=probe.command('--sdk','iphonesimulator','--show-sdk-build-version')
  if not re.fullmatch('[0-9.]{1,20}',sdk) or not re.fullmatch('[A-Za-z0-9.]{1,32}',sdkbuild):raise probe.GateError('SDK_READBACK_INVALID','SDK_READBACK_INVALID')
  result['simulatorSdk']={'version':sdk,'build':sdkbuild}
  if (sdk,sdkbuild)!=EXPECTED_SDK:raise probe.GateError('simulator SDK pin mismatch','SDK_MISMATCH')
  d.at('disk-before')
  result['freeBefore']=probe.free_space(tmp,FLOOR,'before probe')
  phase='catalog-shape-only'
  result.update(assess(d))
  result.update(status='BLOCKED',disposition='DIAGNOSTIC_ONLY_NO_BOOT_OR_CAPACITY_PROOF')
 except Exception as e:
  d.record_primary(e)
  result.update(status='BLOCKED',failedPhase=phase)
 finally:
  result.update(d.fields());result['elapsedSeconds']=elapsed(started)
  result['bootStrategy']='none-shape-only'
 return result

def main():
 signal.signal(signal.SIGINT,probe.interrupted);signal.signal(signal.SIGTERM,probe.interrupted)
 try:result=run()
 except Exception as e:
  d=probe.Diagnostic();d.record_primary(e)
  result={'status':'BLOCKED','failedPhase':'host-context','scope':SCOPE,'nativeAppProof':False,'deviceMutationsRequested':False,
          'capacityQualified':False,'catalogPinsVerified':False,**d.fields(),'bootStrategy':'none-shape-only'}
 print(json.dumps(result,sort_keys=True,separators=(',',':')))
 return 78
if __name__=='__main__':sys.exit(main())
