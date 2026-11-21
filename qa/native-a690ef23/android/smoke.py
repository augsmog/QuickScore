#!/usr/bin/env python3
"""Local installed-APK smoke; no installs, settings writes, launch or remote calls."""
import argparse,hashlib,json,pathlib,re,subprocess,time,xml.etree.ElementTree as ET
SHA='a690ef23e67a255408028d81e57d40e09778c3eb'
TREE='ba833845c2f2cfbacdecc3ee847e74c4fcfd90b7'
def digest(b):return hashlib.sha256(b).hexdigest()
class ActivityReadbackError(ValueError):
 def __init__(self,reason,blocks=0,targets=0,fields=0):
  self.diagnostic={'reason':reason,'activityBlocks':min(blocks,32),'targetBlocks':min(targets,32),'currentConfigFields':min(fields,32)}
  super().__init__(json.dumps(self.diagnostic,sort_keys=True))
def activity_scale(config,focus,package,identity=False):
 def fail(reason,targets=0,fields=0):raise ActivityReadbackError(reason,len(headers),targets,fields)
 headers=[]
 if len(config)>2000000 or len(focus)>1000000:fail('INPUT_LIMIT')
 def normalized(component):
  pkg,cls=component.split('/',1);return pkg+'/'+(pkg+cls if cls.startswith('.') else cls)
 focused=re.findall(r'mCurrentFocus=Window\{[^\n]*?\s([^\s}]+/[^\s}]+)\}',focus)
 if len(focused)!=1 or focused[0].split('/')[0]!=package:fail('FOREGROUND_TARGET_REQUIRED')
 target=normalized(focused[0])
 headers=list(re.finditer(r'^\s*ACTIVITY ([A-Za-z0-9_.$]+/[A-Za-z0-9_.$]+) [^\n]*$',config,re.M))
 if len(headers)>32:fail('ACTIVITY_BLOCK_LIMIT')
 matches=[];identities=[]
 for i,h in enumerate(headers):
  if normalized(h[1])==target:
   matches.append(config[h.end():headers[i+1].start() if i+1<len(headers) else len(config)]);identities.append(digest(h[0].strip().encode()))
 if len(matches)!=1:fail('TARGET_BLOCK_MISSING_OR_DUPLICATE',len(matches))
 block=matches[0]
 resumed=re.findall(r'mResumed=(true|false)\s+mStopped=(true|false)\s+mFinished=(true|false)',block)
 if resumed!=[('true','false','false')]:fail('TARGET_NOT_UNIQUELY_RESUMED',1)
 fields=re.findall(r'^\s*mCurrentConfig=(.*)$',block,re.M)
 if len(fields)!=1:fail('CURRENT_CONFIG_MISSING_OR_DUPLICATE',1,len(fields))
 value=re.fullmatch(r'\{([0-9]+(?:\.[0-9]+)?)\s[^\r\n]*\}',fields[0])
 if not value:fail('CURRENT_CONFIG_FORMAT_UNSUPPORTED',1,1)
 return identities[0] if identity else float(value[1])
def scale(settings,config,wanted,focus,package):
 if wanted not in (1.,1.3):raise ValueError('unapproved requested scale')
 if not re.fullmatch(r'\s*(?:1(?:\.0+)?|1\.30*)\s*',settings):raise ValueError('missing/unapproved Settings readback')
 value=activity_scale(config,focus,package)
 if abs(float(settings)-wanted)>1e-6 or abs(value-wanted)>1e-6:raise ActivityReadbackError('SETTINGS_ACTIVITY_REQUEST_MISMATCH',fields=1)
 return float(settings)
def scene(xml,focus,package):
 if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.]+',package):raise ValueError('invalid package')
 focused=re.findall(r'mCurrentFocus=Window\{[^\n]*?\s([^\s/]+)/[^\n]*\}',focus)
 if focused!=[package]:raise ValueError('system dialog/wrong or ambiguous focused package')
 start=xml.find('<?xml');start=start if start>=0 else xml.find('<hierarchy')
 end=xml.rfind('</hierarchy>')
 if start<0 or end<0:raise ValueError('missing hierarchy')
 root=ET.fromstring(xml[start:end+12]);ids=set()
 for n in root.iter('node'):
  a=n.attrib
  if a.get('package') not in (package,'com.android.systemui',''):raise ValueError('foreign/system dialog node')
  b=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',a.get('bounds',''))
  if a.get('visible-to-user','true')=='true' and b and int(b[3])>int(b[1]) and int(b[4])>int(b[2]):ids.add(a.get('resource-id','').split(':id/')[-1])
 if not {'home-scroll','home-new-contest'}<=ids or 'new-contest-back' in ids:raise ValueError('wrong/hidden Home scene')
 return sorted(ids)
def run(c):
 def command(args,binary=False):
  b=subprocess.check_output(args,timeout=15,stderr=subprocess.PIPE)
  return b if binary else b.decode()
 def git(*a):return command(['git','-C',c['source'],*a]).strip()
 if git('rev-parse','HEAD')!=SHA or git('rev-parse','HEAD^{tree}')!=TREE or git('status','--porcelain'):raise ValueError('exact clean source required')
 serial=c['serial'];package=c['package'];expected=c.get('expectedScale',1.)
 if not re.fullmatch(r'emulator-\d+',serial):raise ValueError('explicit disposable emulator serial required')
 if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.]+',package):raise ValueError('invalid package')
 adb=lambda *a,**kw:command(['adb','-s',serial,*a],**kw)
 if adb('get-state').strip()!='device':raise ValueError('emulator unavailable')
 apk=pathlib.Path(c['apk']).read_bytes();h=digest(apk);m=json.loads(pathlib.Path(c['buildManifest']).read_text())
 if m.get('sourceSha')!=SHA or m.get('sourceTree')!=TREE or m.get('apkSha256')!=h or m.get('variant')!='release' or m.get('offline') is not True or not re.fullmatch('[a-f0-9]{64}',m.get('recipeSha256','')):raise ValueError('build provenance mismatch')
 paths=adb('shell','pm','path',package).strip().splitlines()
 if len(paths)!=1 or not paths[0].startswith('package:/data/app/'):raise ValueError('single installed APK required')
 installed=paths[0][8:]
 if not re.fullmatch(r'/data/app/[A-Za-z0-9_./=+~-]+\.apk',installed):raise ValueError('unexpected APK path')
 if digest(adb('exec-out','cat',installed,binary=True))!=h:raise ValueError('installed APK mismatch')
 def observe():
  s=adb('shell','settings','get','system','font_scale');a=adb('shell','dumpsys','activity','top');f=adb('shell','dumpsys','window','windows');x=adb('exec-out','uiautomator','dump','/dev/tty')
  ids=scene(x,f,package) # Verify target Home before interpreting any Activity scale.
  return {'timestampMs':int(time.time()*1000),'scale':scale(s,a,expected,f,package),'homeSceneVerified':True,'foregroundActivityVerified':True,'activityIdentitySha256':activity_scale(a,f,package,identity=True),'runtimeRNScale':None}
 before=observe();png=adb('exec-out','screencap','-p',binary=True);after=observe()
 if after['timestampMs']-before['timestampMs']>15000 or before['scale']!=after['scale'] or before['activityIdentitySha256']!=after['activityIdentitySha256']:raise ValueError('capture stale/changed')
 if not png.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('invalid screenshot')
 out=pathlib.Path(c['out']);out.mkdir(exist_ok=False)
 (out/'home.png').write_bytes(png)
 receipt={'sourceSha':SHA,'tree':TREE,'apkSha256':h,'runtimeRNScale':None,'before':before,'after':after,'pngSha256':digest(png),'scope':'OS Settings + foreground Activity configuration; no initialized RN in-process claim','geometryPassed':False,'nativeAcceptance':False}
 (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('config');a=p.parse_args()
 try:run(json.loads(pathlib.Path(a.config).read_text()))
 except Exception as e:raise SystemExit('BLOCKED: '+str(e))
