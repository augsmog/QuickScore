"""Staged disposable dual boot only; bounded redacted terminal receipt."""
import contextlib,json,os,re,signal,subprocess,sys,time
import two_iphone_preflight as probe
REF='refs/heads/qa/snapscore-dual-boot-short-selector-nov25'
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

class Discard:
 def write(self,text):return len(text)
 def flush(self):pass

def run():
 expected={'GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':REF,'GITHUB_JOB':'dual_boot','DEVELOPER_DIR':probe.XCODE}
 if any(os.environ.get(k)!=v for k,v in expected.items()):raise probe.GateError('EXACT_JOB_SCOPE_REQUIRED','HOST_SCOPE')
 sha=os.environ.get('GITHUB_SHA','')
 if not re.fullmatch('[0-9a-f]{40}',sha):raise probe.GateError('HARNESS_SHA_REQUIRED','HOST_SCOPE')
 tmp,marker=probe.job_context()
 d=probe.Diagnostic()
 result={'harnessSha':sha,'scope':'disposable-dual-boot-only','nativeAppProof':False,'buildBudgetPass':None,
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
  phase='canonical-dual-boot'
  # Canonical failures can contain private receipt paths: suppress, never publish.
  with contextlib.redirect_stdout(Discard()),contextlib.redirect_stderr(Discard()):
   raw=probe.preflight(tmp,marker,FLOOR,probe.BOOT_SHARED_SECONDS,False,d)
  d.at('completion')
  if raw.get('status')!='PASS' or raw.get('disposition')!='deleted-and-verified' or not d.cleanup_verified or not d.dual_boot_verified:raise probe.GateError('CANONICAL_COMPLETION_REQUIRED','COMPLETION_UNVERIFIED')
  result.update(status='PASS',xcode=raw['xcode'],runtime=raw['runtime'],deviceType=raw['device_type'],bootSeconds={role:raw['devices'][role]['boot_wait_s'] for role in ('host','guest')},freeBothBooted=raw['free_disk_both_booted'])
  phase='post-cleanup-readback';d.at('disk-after-cleanup');result['freeAfterCleanup']=probe.free_space(tmp,FLOOR,'after cleanup')
 except Exception as e:
  d.record_primary(e)
  result.update(status='BLOCKED',failedPhase='owned-cleanup' if isinstance(e,probe.CleanupError) else phase)
 finally:
  result.update(d.fields());result['elapsedSeconds']=round(time.monotonic()-started,3)
 return result

def main():
 signal.signal(signal.SIGINT,probe.interrupted);signal.signal(signal.SIGTERM,probe.interrupted)
 try:result=run()
 except Exception as e:
  d=probe.Diagnostic();d.record_primary(e)
  result={'status':'BLOCKED','failedPhase':'host-context','scope':'disposable-dual-boot-only','nativeAppProof':False,**d.fields()}
 print(json.dumps(result,sort_keys=True,separators=(',',':')))
 return 0 if result['status']=='PASS' else 78
if __name__=='__main__':sys.exit(main())
