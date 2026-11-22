"""Canonical disposable dual boot only; bounded redacted terminal receipt."""
import contextlib,hashlib,io,json,os,pathlib,re,signal,subprocess,sys,time
import two_iphone_preflight as probe
REF='refs/heads/qa/snapscore-hosted-dual-boot-main'
FLOOR=12*(1<<30)
class Discard:
 def write(self,text):return len(text)
 def flush(self):pass

def run():
 expected={'GITHUB_REPOSITORY':'augsmog/QuickScore','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':REF,'GITHUB_JOB':'dual_boot','DEVELOPER_DIR':probe.XCODE}
 if any(os.environ.get(k)!=v for k,v in expected.items()):raise probe.GateError('EXACT_JOB_SCOPE_REQUIRED')
 sha=os.environ.get('GITHUB_SHA','')
 if not re.fullmatch('[0-9a-f]{40}',sha):raise probe.GateError('HARNESS_SHA_REQUIRED')
 tmp,marker=probe.job_context()
 result={'harnessSha':sha,'scope':'disposable-dual-boot-only','nativeAppProof':False,'buildBudgetPass':None,'cleanupAttempted':False,'cleanupVerified':False}
 started=time.monotonic();phase='installed-readbacks'
 original=probe.cleanup
 def cleanup(path,data):
  result['cleanupAttempted']=True
  original(path,data)
  result['cleanupVerified']=True
 try:
  memory=subprocess.run(['/usr/sbin/sysctl','-n','hw.memsize'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=10,check=True)
  if not re.fullmatch(rb'[0-9]{1,20}\s*',memory.stdout):raise probe.GateError('RAM_READBACK_INVALID')
  result['physicalRamBytes']=int(memory.stdout)
  sdk=probe.command('--sdk','iphonesimulator','--show-sdk-version')
  sdkbuild=probe.command('--sdk','iphonesimulator','--show-sdk-build-version')
  if not re.fullmatch('[0-9.]{1,20}',sdk) or not re.fullmatch('[A-Za-z0-9.]{1,32}',sdkbuild):raise probe.GateError('SDK_READBACK_INVALID')
  result['simulatorSdk']={'version':sdk,'build':sdkbuild}
  result['freeBefore']=probe.free_space(tmp,FLOOR,'before probe')
  phase='canonical-dual-boot';probe.cleanup=cleanup
  # Canonical failures can contain private receipt paths: suppress, never publish.
  with contextlib.redirect_stdout(Discard()),contextlib.redirect_stderr(Discard()):
   raw=probe.preflight(tmp,marker,FLOOR,180,False)
  if raw.get('status')!='PASS' or raw.get('disposition')!='deleted-and-verified' or not result['cleanupVerified']:raise probe.GateError('CANONICAL_COMPLETION_REQUIRED')
  result.update(status='PASS',xcode=raw['xcode'],runtime=raw['runtime'],deviceType=raw['device_type'],simultaneousBootVerified=True,bootSeconds={role:raw['devices'][role]['boot_wait_s'] for role in ('host','guest')},freeBothBooted=raw['free_disk_both_booted'])
  phase='post-cleanup-readback';result['freeAfterCleanup']=probe.free_space(tmp,FLOOR,'after cleanup')
 except Exception:
  result.update(status='BLOCKED',failedPhase=phase)
 finally:
  probe.cleanup=original;result['elapsedSeconds']=round(time.monotonic()-started,3)
 return result

def main():
 signal.signal(signal.SIGINT,probe.interrupted);signal.signal(signal.SIGTERM,probe.interrupted)
 try:result=run()
 except Exception:result={'status':'BLOCKED','failedPhase':'host-context','scope':'disposable-dual-boot-only','nativeAppProof':False}
 print(json.dumps(result,sort_keys=True,separators=(',',':')))
 return 0 if result['status']=='PASS' else 78
if __name__=='__main__':sys.exit(main())
