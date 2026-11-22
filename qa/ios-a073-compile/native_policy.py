"""Generate NEW sandbox plist copies; never mutate input/native source or build."""
import argparse,copy,json,pathlib,plistlib,hashlib

def policy(expo,info):
 e=copy.deepcopy(expo);i=copy.deepcopy(info)
 e['EXUpdatesEnabled']=False
 for k in ['EXUpdatesURL','EXUpdatesRequestHeaders','EXUpdatesCodeSigningCertificate','EXUpdatesCodeSigningMetadata']:e.pop(k,None)
 ats=i.get('NSAppTransportSecurity',{})
 if ats.get('NSAllowsArbitraryLoads') or ats.get('NSAllowsArbitraryLoadsForMedia') or ats.get('NSAllowsArbitraryLoadsInWebContent') or ats.get('NSAllowsLocalNetworking') or ats.get('NSExceptionDomains'):raise ValueError('EXISTING_BROAD_OR_UNAUDITED_ATS_POLICY')
 # No new ATS exception: localhost is an unqualified name, not a numeric IP.
 # App/runtime observation remains mandatory; no global local-network opt-out.
 verify(e,i)
 return e,i

def verify(expo,info):
 if expo.get('EXUpdatesEnabled') is not False or any(k in expo for k in ['EXUpdatesURL','EXUpdatesRequestHeaders','EXUpdatesCodeSigningCertificate','EXUpdatesCodeSigningMetadata']):raise ValueError('OTA_POLICY_NOT_DISABLED')
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
