"""Offline ordinary UI continuation. No links, fixtures, purchases or acceptance claims.

Uses existing adb/UIAutomator only. XML and tool output stay in memory; receipts
contain allowlisted checkpoint names and bounds, never raw UI/device data.
"""
import json,pathlib,re,subprocess,time,xml.etree.ElementTree as ET
from smoke import run as capture, target_focus

class SupplementalJourneyBlocked(ValueError):
 def __init__(self,phase,reason='NAVIGATION_BLOCKED'):
  self.phase=phase;self.reason=reason
  super().__init__('ANDROID_CONTINUATION_BLOCKED:'+phase)

class CaptureBoundaryFailure(ValueError):pass

NAVIGATION_REASONS=frozenset({
 'CONTROL_MISSING_OR_AMBIGUOUS','AMBIGUOUS_CONTROL','CONTROL_UNREACHABLE',
 'SCROLL_REGION_AMBIGUOUS','SCROLL_REGION_OCCLUDED','CONTROL_DISABLED',
 'CONTROL_BEHIND_FOOTER','WRONG_SCENE','WRONG_STEP','KEYBOARD_DISMISSAL_UNVERIFIED',
 'DISABLED_STATE_UNOBSERVED',
})
def navigation_reason(error):
 return str(error) if type(error) is ValueError and str(error) in NAVIGATION_REASONS else None


HEADER='Run the game. We do the math.'
MISSING='Contest not found on this device. Offline codes work only in the organizer’s browser.'
SCENES={
 'entry':('join-dismiss','local-join-limitation'),
 'entry-invalid':('join-dismiss','local-join-limitation'),
 'setup':('contest-step-setup','contest-footer'),
 'rounds':('contest-step-setup','contest-footer','rounds-2','rounds-3','rounds-4'),
 'players-end':('contest-step-setup','contest-footer'),
 'games':('contest-step-gamemodes','contest-footer'),
 'round-settings':('contest-step-round-settings','contest-footer'),
 'paywall-top':('paywall-close',),
 'paywall-free':(), 'paywall-annual':(), 'paywall-disabled':(),
}
TEXTS={'entry':('Join with code','Find contest'), 'entry-invalid':('Find contest',MISSING),
 'rounds':('NUMBER OF ROUNDS',), 'players-end':('+ ADD PLAYER',),
 'paywall-top':(HEADER,), 'paywall-free':('Free','Current plan'),
 'paywall-annual':('Tournament Director','$79.99/year'),
 'paywall-disabled':('Currently unavailable','Renews yearly. Cancel anytime.')}

def tree(raw,package):
 start=raw.find('<hierarchy');end=raw.rfind('</hierarchy>')
 if start<0 or end<0 or len(raw)>2000000:raise ValueError('HIERARCHY_UNAVAILABLE')
 root=ET.fromstring(raw[start:end+12])
 for node in root.iter('node'):
  if node.get('package','') not in (package,'com.android.systemui',''):raise ValueError('FOREIGN_SCENE')
 return root

def box(node):
 m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',node.get('bounds',''))
 if not m or node.get('visible-to-user','true')!='true':return None
 b=tuple(map(int,m.groups()))
 return b if b[2]>b[0] and b[3]>b[1] else None

def matches(root,key,kind='id'):
 def match(n):
  if kind=='id':return n.get('resource-id','').split(':id/')[-1]==key
  if kind=='input':return n.get('class')=='android.widget.EditText' and (n.get('content-desc')==key or n.get('text')==key or n.get('hint')==key)
  return n.get('text')==key or n.get('content-desc')==key
 return [n for n in root.iter('node') if box(n) and match(n)]

def one(root,key,kind='id'):
 found=matches(root,key,kind)
 if len(found)!=1:raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
 return found[0]

def validate(root,name):
 if name not in SCENES:raise ValueError('UNKNOWN_CHECKPOINT')
 ids={n.get('resource-id','').split(':id/')[-1] for n in root.iter('node') if box(n)}
 if 'home-new-contest' in ids:raise ValueError('WRONG_SCENE')
 if name.startswith('paywall'):
  if ids.intersection({'join-dismiss','contest-footer','new-contest-back'}):raise ValueError('WRONG_SCENE')
 elif name.startswith('entry'):
  if ids.intersection({'contest-footer','paywall-close'}):raise ValueError('WRONG_SCENE')
 else:
  if ids.intersection({'join-dismiss','paywall-close'}):raise ValueError('WRONG_SCENE')
  expected=next(i for i in SCENES[name] if i.startswith('contest-step-'))
  if any(i.startswith('contest-step-') and i!=expected for i in ids):raise ValueError('WRONG_STEP')
 for key in SCENES[name]:one(root,key)
 for text in TEXTS.get(name,()):one(root,text,'text')
 if name=='paywall-disabled':
  n=one(root,'Currently unavailable','text')
  # Android may expose disabled state on a containing Pressable; require explicit
  # false on that node or its ancestor, never infer it from copy/color.
  parents={c:p for p in root.iter() for c in p}
  while n is not None and n.get('enabled')!='false':n=parents.get(n)
  if n is None:raise ValueError('DISABLED_STATE_UNOBSERVED')
 return True

class Driver:
 def __init__(self,c):self.c=c;self.phase='entry';self.report=[];self.out=pathlib.Path(c['out']+'-continuation');self.out.mkdir(exist_ok=False);self.reason=None
 def adb(self,*args):return subprocess.check_output(['adb','-s',self.c['serial'],*args],timeout=15,stderr=subprocess.PIPE).decode()
 def read(self):
  from smoke import read_focus
  try:
   target_focus(read_focus(self.adb),self.c['package'])
   return tree(self.adb('exec-out','uiautomator','dump','/dev/tty'),self.c['package'])
  except Exception:raise CaptureBoundaryFailure('FOREGROUND_OR_HIERARCHY_BOUNDARY_FAILED') from None
 def seek(self,key,kind='id',direction='down'):
  for attempt in range(9):
   root=self.read();found=matches(root,key,kind)
   if len(found)>1:raise ValueError('AMBIGUOUS_CONTROL')
   if found:return root,found[0]
   if attempt==8:break
   self.scroll(direction,root)
  raise ValueError('CONTROL_UNREACHABLE')
 def scroll(self,direction,root=None):
  root=root if root is not None else self.read()
  scrolls=[n for n in root.iter('node') if n.get('scrollable')=='true' and box(n)]
  if len(scrolls)!=1:raise ValueError('SCROLL_REGION_AMBIGUOUS')
  l,t,r,b=box(scrolls[0]);foot=matches(root,'contest-footer')
  if foot:b=min(b,box(foot[0])[1])
  if b-t<120:raise ValueError('SCROLL_REGION_OCCLUDED')
  x=(l+r)//2;y1=t+(b-t)*3//4;y2=t+(b-t)//4
  if direction=='up':y1,y2=y2,y1
  self.adb('shell','input','swipe',str(x),str(y1),str(x),str(y2),'400');time.sleep(.3)
 def tap(self,key,kind='id',direction='down'):
  root,n=self.seek(key,kind,direction)
  for attempt in range(8):
   foot=matches(root,'contest-footer')
   if not foot or key in ('contest-continue','contest-start','new-contest-back') or box(n)[3]<=box(foot[0])[1]:break
   self.scroll('down',root);root,n=self.seek(key,kind,direction)
  l,t,r,b=box(n)
  if n.get('enabled')=='false':raise ValueError('CONTROL_DISABLED')
  footer=matches(root,'contest-footer')
  if footer and key not in ('contest-continue','contest-start') and b>box(footer[0])[1]:raise ValueError('CONTROL_BEHIND_FOOTER')
  self.adb('shell','input','tap',str((l+r)//2),str((t+b)//2));time.sleep(.3)
 def fill(self,label,value):
  if value not in ('QAGuest','QAThree','QAFour','AAAAAA'):raise ValueError('NON_SYNTHETIC_INPUT')
  self.tap(label,'input')
  self.adb('shell','input','text',value)
  ime=self.adb('shell','dumpsys','input_method')
  if not re.search(r'\bmInputShown=true\b',ime):raise ValueError('KEYBOARD_DISMISSAL_UNVERIFIED')
  self.adb('shell','input','keyevent','4');time.sleep(.3)
  one(self.read(),value,'input')
 def shot(self,name):
  self.phase=name
  root=self.read();validate(root,name)
  def guard(xml,focus,package):
   target_focus(focus,package);validate(tree(xml,package),name);return []
  cfg={**self.c,'out':str(self.out/name),'_scene':guard,'_checkpoint':name}
  try:capture(cfg)
  except Exception:raise CaptureBoundaryFailure('CONTINUATION_CAPTURE_BOUNDARY_FAILED') from None
  # Bounds are observed accessibility bounds, not painted glyph geometry or dp.
  targets=list(SCENES[name])+list(TEXTS.get(name,()))
  bounds={str(i):box(one(root,k,'id' if k in SCENES[name] else 'text')) for i,k in enumerate(targets)}
  self.report.append({'checkpoint':name,'captured':True,'observedBoundsPx':bounds,'geometryPassed':False,'visualReviewRequired':True})
 def save(self,status):
  (self.out/'continuation.json').write_text(json.dumps({'sourceSha':self.c_source(),'status':status,'phase':self.phase,'reason':self.reason,'checkpoints':self.report,'aggregatePass':False,'runtimeRNScale':None,'nativeJoin':False,'catalog':'offline-fallback-no-provider','blocked':['online-host-approval-binding-score-reconnect','initialized-RN-scale','independent-geometry-review']},indent=2)+'\n')
 def c_source(self):
  from smoke import SHA
  return SHA

def journey(c,lane='all'):
 if lane not in ('all','join','wizard'):raise ValueError('UNKNOWN_LANE')
 d=Driver(c)
 try:
  if lane in ('all','join'):
   d.phase='join-home-lookup';d.seek('home-join-code')
   d.phase='join-home-tap';d.tap('home-join-code')
   d.phase='join-destination';validate(d.read(),'entry')
   d.shot('entry')
   d.phase='join-invalid';d.fill('Join code','AAAAAA');d.fill('Display name','QAGuest');d.tap('Find contest','text')
   d.seek(MISSING,'text');d.shot('entry-invalid');d.tap('join-dismiss')
   if lane=='join':
    d.save('CAPTURED_SUPPLEMENTAL_ONLY');return
  d.phase='setup-enter';d.tap('home-new-contest');d.seek('contest-player-0')
  host=one(d.read(),'contest-player-0');one(host,'Golfer','input')
  d.fill('Player 2 name','QAGuest')
  for number,name in [(3,'QAThree'),(4,'QAFour')]:
   d.phase='add-player';d.tap('+ ADD PLAYER','text')
   d.seek('contest-player-'+str(number-1));d.fill('Player '+str(number)+' name',name)
  d.shot('setup')
  d.phase='round-toggle';d.tap('tournament-toggle',direction='up');d.seek('rounds-2');d.shot('rounds')
  d.tap('rounds-2')
  # Reach end deliberately, preserve separate pre/end screenshots for rule 2.
  d.phase='players-end';d.seek('+ ADD PLAYER','text');d.shot('players-end')
  d.tap('contest-continue');d.shot('games')
  d.tap('contest-continue');d.shot('round-settings')
  d.phase='paywall-enter';d.tap('contest-start');d.seek('paywall-close');d.shot('paywall-top')
  for name,key in [('paywall-free','Free'),('paywall-annual','$79.99/year'),('paywall-disabled','Currently unavailable')]:
   d.phase=name
   try:d.seek(key,'text');d.shot(name)
   except CaptureBoundaryFailure:raise
   except (ValueError,subprocess.SubprocessError):
    d.report.append({'checkpoint':name,'captured':False,'status':'SECTION_NOT_SAFELY_OBSERVED','geometryPassed':False})
  d.phase='paywall-close';d.tap('paywall-close',direction='up')
  validate(d.read(),'round-settings');d.tap('new-contest-back');validate(d.read(),'games')
  d.tap('new-contest-back');d.seek('contest-player-0');one(one(d.read(),'contest-player-0'),'Golfer','input')
  for index,name in [(1,'QAGuest'),(2,'QAThree'),(3,'QAFour')]:
   d.seek('contest-player-'+str(index));one(one(d.read(),'contest-player-'+str(index)),name,'input')
  d.seek('rounds-2',direction='up');validate(d.read(),'rounds')
  d.report.append({'checkpoint':'draft-retained','verified':True})
  d.tap('new-contest-back');d.save('CAPTURED_SUPPLEMENTAL_ONLY')
 except Exception as error:
  d.reason=navigation_reason(error) or 'FATAL_BOUNDARY_OR_UNCLASSIFIED'
  d.save('BLOCKED')
  if isinstance(error,CaptureBoundaryFailure):raise
  if navigation_reason(error):raise SupplementalJourneyBlocked(d.phase,d.reason) from None
  raise
