"""Generate NEW sandbox plist copies; never mutate input/native source or build."""
import argparse,copy,json,pathlib,plistlib,hashlib

class CompilePolicyError(ValueError):
 pass

ATS_KEY='NSAppTransportSecurity'
ARBITRARY='NSAllowsArbitraryLoads'
LOCAL='NSAllowsLocalNetworking'


def policy(expo,info,*,compile_only=False):
 if compile_only and (type(expo) is not dict or type(info) is not dict):
  raise CompilePolicyError('GENERATED_PLIST_INVALID')
 e=copy.deepcopy(expo);i=copy.deepcopy(info)
 e['EXUpdatesEnabled']=False
 for k in ['EXUpdatesURL','EXUpdatesRequestHeaders','EXUpdatesCodeSigningCertificate','EXUpdatesCodeSigningMetadata']:e.pop(k,None)
 if compile_only:
  ats=i.get(ATS_KEY)
  # Exact official SDK54 template shape only. Reject integers, extra keys and
  # every alternative instead of normalizing an unaudited generated plist.
  if (type(ats) is not dict or set(ats)!={ARBITRARY,LOCAL}
      or ats[ARBITRARY] is not False or ats[LOCAL] is not True):
   raise CompilePolicyError('GENERATED_ATS_POLICY_UNEXPECTED')
  del ats[LOCAL]
  verify(e,i,compile_only=True)
  return e,i
 ats=i.get('NSAppTransportSecurity',{})
 if ats.get('NSAllowsArbitraryLoads') or ats.get('NSAllowsArbitraryLoadsForMedia') or ats.get('NSAllowsArbitraryLoadsInWebContent') or ats.get('NSAllowsLocalNetworking') or ats.get('NSExceptionDomains'):raise ValueError('EXISTING_BROAD_OR_UNAUDITED_ATS_POLICY')
 # No new ATS exception: localhost is an unqualified name, not a numeric IP.
 # App/runtime observation remains mandatory; no global local-network opt-out.
 verify(e,i)
 return e,i

def verify(expo,info,*,compile_only=False):
 if compile_only and (type(expo) is not dict or type(info) is not dict):
  raise CompilePolicyError('FINAL_PLIST_INVALID')
 if expo.get('EXUpdatesEnabled') is not False or any(k in expo for k in ['EXUpdatesURL','EXUpdatesRequestHeaders','EXUpdatesCodeSigningCertificate','EXUpdatesCodeSigningMetadata']):
  if compile_only:raise CompilePolicyError('FINAL_OTA_POLICY_INVALID')
  raise ValueError('OTA_POLICY_NOT_DISABLED')
 if compile_only:
  ats=info.get(ATS_KEY)
  if type(ats) is not dict or set(ats)!={ARBITRARY} or ats[ARBITRARY] is not False:
   raise CompilePolicyError('FINAL_ATS_POLICY_INVALID')
  return
 a=info.get('NSAppTransportSecurity',{})
 if any(a.get(k) for k in ['NSAllowsArbitraryLoads','NSAllowsArbitraryLoadsForMedia','NSAllowsArbitraryLoadsInWebContent','NSAllowsLocalNetworking','NSExceptionDomains']):raise ValueError('ATS_POLICY_NOT_NARROW')

def main():
 p=argparse.ArgumentParser();p.add_argument('--expo-plist',required=True);p.add_argument('--info-plist',required=True);p.add_argument('--out',required=True);a=p.parse_args()
 epath=pathlib.Path(a.expo_plist);ipath=pathlib.Path(a.info_plist)
 eb=epath.read_bytes();ib=ipath.read_bytes();e,i=policy(plistlib.loads(eb),plistlib.loads(ib))
 out=pathlib.Path(a.out);out.mkdir(mode=0o700,exist_ok=False)
 for name,obj in [('Expo.plist',e),('Info.plist',i)]: (out/name).write_bytes(plistlib.dumps(obj))
 h=lambda b:hashlib.sha256(b).hexdigest()
 (out/'policy-receipt.json').write_text(json.dumps({'policy':'offline-OTA-disabled; no new ATS relaxation; localhost-only plan','original':{'Expo.plist':h(eb),'Info.plist':h(ib)},'generated':{n:h((out/n).read_bytes()) for n in ['Expo.plist','Info.plist']},'native_applied':False,'runtime_tested':False},indent=2)+'\n')
if __name__=='__main__':main()
