"""Read-only APK policy diagnostic. Never native/network acceptance."""
import re,subprocess

def policy(manifest,badging):
 result={'declaredCleartext':None,'targetSdk':None,'networkSecurityConfigPresent':None,'defaultCleartextPermitted':None,'effectiveNetworkPolicyVerified':False}
 if len(manifest)>2000000 or len(badging)>1000000:return result
 # AAPT XML tree: only accept a uniquely present application-level policy field.
 apps=re.split(r'^  E: application\b.*$',manifest,flags=re.M)
 if len(apps)!=2:return result
 attrs=[]
 for line in apps[1].splitlines():
  if re.match(r'^  E:',line):break
  if re.match(r'^    A:',line):attrs.append(line)
 result['networkSecurityConfigPresent']=any('android:networkSecurityConfig(' in x for x in attrs)
 fields=[x for x in attrs if 'android:usesCleartextTraffic(' in x]
 if len(fields)==1:
  m=re.search(r'=\(type 0x12\)(0x[0-9a-fA-F]+)\s*$',fields[0])
  if m and int(m[1],16) in (0,0xffffffff):result['declaredCleartext']=bool(int(m[1],16))
 versions=re.findall(r"^targetSdkVersion:'([0-9]{1,3})'$",badging,re.M)
 if len(versions)==1:result['targetSdk']=int(versions[0])
 if not result['networkSecurityConfigPresent'] and len(fields)<=1:
  if result['declaredCleartext'] is not None:result['defaultCleartextPermitted']=result['declaredCleartext']
  elif not fields and result['targetSdk'] is not None:result['defaultCleartextPermitted']=result['targetSdk']<28
 return result

def inspect(aapt,apk):
 try:
  def read(*args):return subprocess.check_output([str(aapt),*args,str(apk)],stderr=subprocess.PIPE,timeout=15).decode()
  # XML member follows APK in aapt's command syntax.
  manifest=subprocess.check_output([str(aapt),'dump','xmltree',str(apk),'AndroidManifest.xml'],stderr=subprocess.PIPE,timeout=15).decode()
  return {'status':'READ','policy':policy(manifest,read('dump','badging'))}
 except Exception:return {'status':'UNAVAILABLE','policy':None}
