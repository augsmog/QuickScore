"""Read-only APK policy diagnostic. Never native/network acceptance."""
import re,subprocess

def policy(manifest,badging):
 result={'declaredCleartext':None,'targetSdk':None,'networkSecurityConfigPresent':None,'defaultCleartextPermitted':None,'effectiveNetworkPolicyVerified':False}
 if len(manifest)>2000000 or len(badging)>1000000 or '***' in manifest:return result
 versions=re.findall(r"^targetSdkVersion:'([0-9]{1,3})'$",badging,re.M)
 if len(versions)==1:result['targetSdk']=int(versions[0])
 # AAPT namespaces increment depth too; derive application/attribute indentation.
 # Require one manifest and one direct application child, never a nested lookalike.
 elements=[]
 for i,line in enumerate(manifest.splitlines()):
  m=re.fullmatch(r'( *)E: ([A-Za-z0-9_:.-]+)(?: \(line=[0-9]+\))? *',line)
  if m:elements.append((i,len(m[1]),m[2]))
 roots=[e for e in elements if e[2]=='manifest'];apps=[e for e in elements if e[2]=='application']
 if len(roots)!=1 or len(apps)!=1:return result
 root,app=roots[0],apps[0]
 if app[0]<=root[0] or app[1]!=root[1]+2:return result
 stack=[];parent=None
 for e in elements:
  while stack and stack[-1][1]>=e[1]:stack.pop()
  if e==app:parent=stack[-1] if stack else None;break
  stack.append(e)
 if parent!=root:return result
 attrs=[]
 for line in manifest.splitlines()[app[0]+1:]:
  if re.match(r'^ *E:',line):break
  m=re.match(r'^( *)A:',line)
  if m:
   if len(m[1])!=app[1]+2:return result
   attrs.append(line)
 result['networkSecurityConfigPresent']=any('android:networkSecurityConfig(' in x for x in attrs)
 fields=[x for x in attrs if 'android:usesCleartextTraffic(' in x]
 if len(fields)==1:
  m=re.search(r'=\(type 0x12\)(0x[0-9a-fA-F]+)(?: \(Raw: "(true|false)"\))?\s*$',fields[0])
  if m and int(m[1],16) in (0,0xffffffff) and (m[2] is None or (m[2]=='true')==bool(int(m[1],16))):result['declaredCleartext']=bool(int(m[1],16))
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
