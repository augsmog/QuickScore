# Exact parser extraction from 5c81df701b8f9fc116d4470c8eb4d2fa82995e45. OS only.
import re,json,hashlib
def digest(b):return hashlib.sha256(b).hexdigest()
class ActivityReadbackError(ValueError):
 def __init__(self,reason,blocks=0,targets=0,fields=0):
  self.diagnostic={'reason':reason,'activityBlocks':min(blocks,32),'targetBlocks':min(targets,32),'currentConfigFields':min(fields,32)}
  super().__init__(json.dumps(self.diagnostic,sort_keys=True))
class FocusReadbackError(ActivityReadbackError):
 def __init__(self,reason,fields=0,targets=0,foreign=0,displays=0):
  self.diagnostic={'reason':reason,'focusFields':min(fields,32),'targetFocusMatches':min(targets,32),'foreignFocusMatches':min(foreign,32),'displayBlocks':min(displays,32)}
  ValueError.__init__(self,json.dumps(self.diagnostic,sort_keys=True))
def top_display(windows):
 if len(windows)>1000000:raise FocusReadbackError('FOCUS_INPUT_LIMIT')
 values=re.findall(r'^ *mTopFocusedDisplayId=([0-9]+) *$',windows,re.M)
 if values!=['0']:raise FocusReadbackError('TOP_DEFAULT_DISPLAY_NOT_UNIQUE')
 return values[0]
def read_focus(adb):
 # WMS windows owns the global top ID; DisplayContent owns per-display focus.
 before=top_display(adb('shell','dumpsys','window','windows'))
 displays=adb('shell','dumpsys','window','displays')
 after=top_display(adb('shell','dumpsys','window','windows'))
 if before!=after:raise FocusReadbackError('TOP_DISPLAY_CHANGED')
 return 'mTopFocusedDisplayId='+before+'\n'+displays
def target_focus(focus,package):
 if len(focus)>1000000:raise FocusReadbackError('FOCUS_INPUT_LIMIT')
 top=top_display(focus)
 # AOSP API35 DisplayContent.dump: one default display, never choose among displays.
 displays=list(re.finditer(r'^ *Display: mDisplayId=([0-9]+)(?: \(organized\))? *$',focus,re.M))
 if len(displays)!=1 or displays[0][1]!=top:raise FocusReadbackError('DEFAULT_DISPLAY_NOT_UNIQUE',displays=len(displays))
 if 'mCurrentFocus=' in focus[:displays[0].end()]:raise FocusReadbackError('FOCUS_OUTSIDE_DISPLAY',displays=1)
 fields=re.findall(r'mCurrentFocus=([^\r\n]*)',focus)
 matches=re.findall(r'mCurrentFocus=Window\{[^\n]*?\s([^\s}]+/[^\s}]+)\}',focus)
 targets=[m for m in matches if m.split('/')[0]==package]
 foreign=len(matches)-len(targets)
 if len(fields)!=1 or len(matches)!=1 or len(targets)!=1:
  reason='FOCUS_AMBIGUOUS' if len(fields)>1 or len(matches)>1 else 'FOCUS_FOREIGN' if foreign else 'FOCUS_MISSING_OR_UNSUPPORTED'
  raise FocusReadbackError(reason,len(fields),len(targets),foreign,1)
 return matches[0]
def activity_scale(config,focus,package,identity=False):
 def fail(reason,targets=0,fields=0):raise ActivityReadbackError(reason,len(headers),targets,fields)
 headers=[]
 if len(config)>2000000 or len(focus)>1000000:fail('INPUT_LIMIT')
 def normalized(component):
  pkg,cls=component.split('/',1);return pkg+'/'+(pkg+cls if cls.startswith('.') else cls)
 target=normalized(target_focus(focus,package))
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
