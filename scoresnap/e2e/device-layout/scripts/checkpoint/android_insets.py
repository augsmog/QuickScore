"""API35 read-only WMS + app ViewRoot InsetsState. Strict full-screen subset.
No raw dumps, titles, source IDs or input values are returned/persisted.
"""
import re,hashlib
import os_scale
class InsetsError(ValueError):
 def __init__(self,reason): self.reason='insets-'+reason;super().__init__(self.reason)
def need(ok,reason):
 if not ok:raise InsetsError(reason)
def one(pattern,text,reason,flags=re.M):
 values=re.findall(pattern,text,flags);need(len(values)==1,reason);return values[0]
def component(s):
 p,c=s.split('/');return p+'/'+(p+c if c.startswith('.') else c)
def section(text,label):
 lines=text.splitlines();positions=[i for i,l in enumerate(lines) if l.strip()==label];need(len(positions)==1,'state-section')
 i=positions[0];indent=len(lines[i])-len(lines[i].lstrip());end=i+1
 while end<len(lines) and (not lines[end].strip() or len(lines[end])-len(lines[end].lstrip())>indent):end+=1
 return '\n'.join(lines[i+1:end])
RECT=r'\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]'
def frame(values,size,empty=False):
 r=tuple(map(int,values));l,t,rr,b=r;w,h=size
 need(0<=l<=rr<=w and 0<=t<=b<=h and (empty or (l<rr and t<b)),'frame-shape');return r
def state(text,size):
 s=section(text,'InsetsState');w,h=size
 display=one(r'^\s*mDisplayFrame=Rect\((\d+), (\d+) - (\d+), (\d+)\)\s*$',s,'display-frame')
 need(tuple(map(int,display))==(0,0,w,h),'display-viewport')
 cutout=one(r'^\s*mDisplayCutout=(.*)$',s,'cutout')
 safe=one(r'insets=Rect\((\d+), (\d+) - (\d+), (\d+)\)',cutout,'cutout-insets')
 waterfall=one(r'waterfall=Insets\{left=(\d+), top=(\d+), right=(\d+), bottom=(\d+)\}',cutout,'waterfall')
 need(all(int(v)==0 for v in safe+waterfall),'cutout-unsupported')
 bounds=one(r'boundingRect=\{Bounds=\[(.*?)\]\}',cutout,'cutout-bounds')
 need(bounds==', '.join(['Rect(0, 0 - 0, 0)']*4),'cutout-bounds-unsupported')
 source_lines=[l.strip() for l in s.splitlines() if 'InsetsSource' in l];need(0<len(source_lines)<=32,'sources')
 sources={};ids=set()
 pattern=r'InsetsSource id=([0-9a-f]+) type=(\w+) frame='+RECT+r'(?: visibleFrame='+RECT+r')? visible=(true|false) flags=([A-Z_|]*) sideHint=(NONE|LEFT|TOP|RIGHT|BOTTOM|UNKNOWN) boundingRects=(null|\[\])'
 for line in source_lines:
  m=re.fullmatch(pattern,line);need(m is not None,'source-format');v=m.groups();sid,kind=v[:2]
  need(sid not in ids,'duplicate-source');ids.add(sid)
  need(kind in ('statusBars','navigationBars','ime','systemGestures','mandatorySystemGestures','tappableElement','displayCutout','captionBar'),'source-type')
  r=frame(v[2:6],size,True);visible=v[10]=='true';flags=v[11];side=v[12]
  need(v[6] is None or frame(v[6:10],size,True)==r,'visible-frame-conflict')
  need(flags in ('','SUPPRESS_SCRIM'),'source-flags')
  if kind in ('displayCutout','captionBar'):need(not visible and r==(0,0,0,0),'special-source-unsupported')
  if kind in ('statusBars','navigationBars','ime'):
   need(kind not in sources,'duplicate-type');sources[kind]={'frame':list(r),'visible':visible,'side':side}
 need(set(sources)=={'statusBars','navigationBars','ime'},'required-sources')
 return sources

def observe(windows,focus,activity,size,density):
 for text in (windows,focus,activity):need(isinstance(text,str) and len(text)<=2_000_000,'input-limit')
 need(len(size)==2 and all(type(v)==int and 1<=v<=10000 for v in size),'viewport')
 need(type(density)==int and 1<=density<=1000,'density')
 target=os_scale.target_focus(focus,'com.scoresnap.app')
 need(os_scale.top_display(windows)=='0','display')
 focused=one(r'mCurrentFocus=Window\{([0-9a-f]+) u\d+ ([\w.$]+/[\w.$]+)\}',focus,'focused-window')
 need(component(focused[1])==component(target),'target-focus')
 headers=list(re.finditer(r'^\s*Window #\d+ Window\{([0-9a-f]+) u\d+ ([^\n}]+)\}:\s*$',windows,re.M))
 matching=[(i,m) for i,m in enumerate(headers) if '/' in m[2] and m[2].split('/')[0]=='com.scoresnap.app' and component(m[2])==component(target)]
 need(len(matching)==1,'app-window-count');i,m=matching[0];need(m[1]==focused[0],'window-identity')
 block=windows[m.end():headers[i+1].start() if i+1<len(headers) else len(windows)]
 need(one(r'^\s*mDisplayId=(\d+)\b',block,'window-display')=='0','window-display')
 for key in ('isOnScreen','isVisible'):need(one(r'^\s*'+key+r'=(true|false)\s*$',block,key)=='true','window-hidden')
 parts=one(r'^\s*Frames: parent='+RECT+r' display='+RECT+r' frame='+RECT+r' last='+RECT+r' insetsChanged=(true|false)\s*$',block,'window-frames')
 w,h=size;need(frame(parts[8:12],size)==(0,0,w,h) and frame(parts[12:16],size)==(0,0,w,h) and parts[16]=='false','nonfull-or-changing-window')
 need(not re.search(r'm(?:HScale|VScale|GlobalScale)=(?!1(?:\.0)?(?:\s|$))',block),'scaled-window')
 # Exact client activity checked independently by the existing resumed/config parser.
 activity_id=os_scale.activity_scale(activity,focus,'com.scoresnap.app',identity=True)
 hs=list(re.finditer(r'^\s*ACTIVITY ([\w.$]+/[\w.$]+) [^\n]*$',activity,re.M))
 matches=[(i,m) for i,m in enumerate(hs) if component(m[1])==component(target)];need(len(matches)==1,'activity-count')
 i,m=matches[0];client=activity[m.end():hs[i+1].start() if i+1<len(hs) else len(activity)]
 need(len(re.findall(r'^\s*ViewRoot:\s*$',client,re.M))==1,'viewroot-count')
 root=section(client,'ViewRoot:')
 for key,wanted in [('mAdded','true'),('mRemoved','false'),('mStopped','false'),('mPausedForTransition','false'),('mTraversalScheduled','false'),('mReportNextDraw','false')]:
  need(one(r'^\s*'+key+r'=(true|false)\s*$',root,key)==wanted,'client-transition')
 need(one(r'^\s*mIsPredictiveBackImeHideAnimInProgress=(true|false)\s*$',client,'ime-animation')=='false','ime-animation')
 server=state(focus,size);local=state(client,size);need(server==local,'server-client-conflict')
 safe={k:0 for k in ('left','top','right','bottom')}
 for kind in ('statusBars','navigationBars'):
  s=local[kind];l,t,r,b=s['frame']
  if not s['visible']:continue
  need(l<r and t<b,'visible-empty')
  edges=[]
  if l==0 and r==w and t==0 and b<h:edges.append(('top',b))
  if l==0 and r==w and b==h and t>0:edges.append(('bottom',h-t))
  if t==0 and b==h and l==0 and r<w:edges.append(('left',r))
  if t==0 and b==h and r==w and l>0:edges.append(('right',w-l))
  need(len(edges)==1,'nonedge-source');edge,value=edges[0]
  need(s['side'] in ('UNKNOWN',edge.upper()),'side-conflict');safe[edge]=max(safe[edge],value)
 ime=local['ime'];l,t,r,b=ime['frame']
 if ime['visible']:need(l==0 and r==w and 0<t<b==h and ime['side'] in ('BOTTOM','UNKNOWN'),'floating-ime')
 return {'provider':'aosp-api35-wms-client-insets/v1','displayId':0,'windowIdentitySha256':hashlib.sha256(focused[0].encode()).hexdigest(),'activityIdentitySha256':activity_id,'pixelSize':size,'densityDpi':density,'sources':local,'safeArea':{k:v/(density/160) for k,v in safe.items()},'keyboard':{'visible':ime['visible'],'framePx':ime['frame'] if ime['visible'] else None},'policy':'visible-edge-system-bars;zero-cutout;fullscreen-stable;ime-separate','style':'bar-opacity-and-app-consumption-unobserved'}
