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
 'DISABLED_STATE_UNOBSERVED','PLAYER_PAIR_UNVERIFIED','PLAYER_FOCUS_UNVERIFIED','PLAYER_CARD_LOWER_EDGE_CLIPPED',
})
def navigation_reason(error):
 return str(error) if type(error) is ValueError and str(error) in NAVIGATION_REASONS else None


HEADER='Run the game. We do the math.'
MISSING='Contest not found on this device. Offline codes work only in the organizer’s browser.'
SCENES={
 'entry':('join-dismiss','local-join-limitation'),
 'entry-invalid':('join-dismiss','local-join-limitation'),
 'setup-initial':('contest-step-setup','contest-footer','new-contest-back'),
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

FIND='Find contest'
BUTTON_ROLES={'android.widget.Button','android.view.View','android.view.ViewGroup'}
DIAGNOSTIC_ROLES=BUTTON_ROLES|{'android.widget.TextView','android.widget.EditText',
 'android.widget.FrameLayout','android.widget.LinearLayout','android.widget.ScrollView'}

def parents_of(root):return {c:p for p in root.iter() for c in p}

def contained(inner,outer):
 return bool(inner and outer and outer[0]<=inner[0] and outer[1]<=inner[1]
             and inner[2]<=outer[2] and inner[3]<=outer[3])

def visible_button(n):
 return (bool(box(n)) and n.get('class') in BUTTON_ROLES
         and n.get('enabled')=='true' and n.get('clickable')=='true')

def find_button(root):
 hits=matches(root,FIND,'text')
 actions=[n for n in hits if visible_button(n)]
 if len(actions)!=1 or len(hits) not in (1,2):raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
 target=actions[0]
 if len(hits)==1:return target
 label=next(n for n in hits if n is not target)
 # The only supported alias: the label of the same Pressable, not two visual
 # buttons even if their rectangles are identical. The archive did not include XML.
 if (target.get('content-desc')!=FIND or label.get('text')!=FIND
     or label.get('class')!='android.widget.TextView' or label.get('clickable')!='false'
     or label.get('package')!=target.get('package') or not contained(box(label),box(target))):
  raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
 parents=parents_of(root)
 a=parents.get(label)
 while a is not None and a is not target:
  if a.get('clickable')!='false' or not contained(box(label),box(a)) or not contained(box(a),box(target)):
   raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
  a=parents.get(a)
 if a is not target:raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
 return target

def role_observation(root,n,anchor=None):
 parents=parents_of(root)
 def safe(k):
  return {'role':k.get('class') if k.get('class') in DIAGNOSTIC_ROLES else 'other',
          'clickable':k.get('clickable') if k.get('clickable') in ('true','false') else None,
          'enabled':k.get('enabled') if k.get('enabled') in ('true','false') else None,
          'boundsPx':box(k)}
 path=[];a=parents.get(n)
 for _ in range(4):
  if a is None or a.tag!='node':break
  path.append({**safe(a),'isAnchor':a is anchor})
  if a is anchor:break
  a=parents.get(a)
 return {**safe(n),'parentPath':path}

def join_candidates(root):
 hits=matches(root,FIND,'text')
 return [{'labelAsText':n.get('text')==FIND,'labelAsDescription':n.get('content-desc')==FIND,
          **role_observation(root,n,next((m for m in hits if m is not n),None))}
         for n in hits[:2]]

def join_form(root,filled=False):
 if filled:
  code=one(root,'AAAAAA','input');name=one(root,'QAGuest','input')
  if code.get('text')!='AAAAAA' or name.get('text')!='QAGuest':
   raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
 else:
  code=one(root,'Join code','input');name=one(root,'Display name','input')
 if code is name or code.get('enabled')!='true' or name.get('enabled')!='true':
  raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
 return find_button(root)

def scene_node(root,key,kind='id'):
 return find_button(root) if kind=='text' and key==FIND else one(root,key,kind)

def selector_counts(root,name):
 if name not in SCENES:raise ValueError('UNKNOWN_CHECKPOINT')
 return [{'role':key,'kind':kind,'matches':min(len(matches(root,key,kind)),2)}
         for kind,keys in [('id',SCENES[name]),('text',TEXTS.get(name,()))] for key in keys]

def name_edit(n):
 return (bool(box(n)) and n.get('class')=='android.widget.EditText'
         and not n.get('resource-id','').split(':id/')[-1].startswith('player-handicap-')
         and not n.get('content-desc','').startswith('Handicap for '))

def node_id(n):return n.get('resource-id','').split(':id/')[-1]

def overlap(a,b):
 return bool(a and b and max(a[0],b[0])<min(a[2],b[2]) and max(a[1],b[1])<min(a[3],b[3]))

def player_pair(root,index,value,package,counts,*,after_verified_tap=False):
 """No XML-parent hypothesis: prove the exact name and independent HCP semantics."""
 k='contest-player-'+str(index)
 cards=matches(root,k)
 counts.update({'cardMatches':min(len(cards),3),'sceneBounds':0,'competingCards':0,
  'sameAppEdit':0,'visibleAppEdit':0,'inCardEdit':0,'inGuardedBounds':0,
  'nameExactlyMatches':0,'hcpIdExactlyMatches':0,'hcpLabelExactlyMatches':0,
  'hcpExactlyMatches':0,'nestedEdits':0,'focusedEdit':0,'cardAtLowerClip':0,
  'nonconflictingClip':0,'focusedAppEdit':0,'focusedClipAccepted':0})
 try:
  validate(root,'setup-initial')
  if len(cards)!=1:raise ValueError('PLAYER_PAIR_UNVERIFIED')
  card=cards[0];setup=one(root,'contest-step-setup');scroll=one(root,'contest-scroll');footer=one(root,'contest-footer')
 except ValueError:raise ValueError('PLAYER_PAIR_UNVERIFIED') from None
 cb=box(card);sb=box(setup);vb=box(scroll);fb=box(footer)
 counts['sceneBounds']=int(bool(package) and all(n.get('package')==package for n in (card,setup,scroll,footer))
                          and scroll.get('scrollable')=='true' and contained(cb,sb) and contained(cb,vb))
 other_cards=[n for n in root.iter('node') if n is not card and re.fullmatch(r'contest-player-[0-9]+',node_id(n))]
 counts['competingCards']=min(3,sum(overlap(cb,box(n)) for n in other_cards))
 lower=min(sb[3],vb[3],fb[1])
 counts['cardAtLowerClip']=int(cb[1]<lower==cb[3])
 all_edits=[n for n in root.iter('node') if n.get('package')==package and n.get('class')=='android.widget.EditText']
 visible=[n for n in all_edits if box(n)]
 inside=[n for n in visible if contained(box(n),cb)]
 safe=[n for n in inside if contained(box(n),sb) and contained(box(n),vb) and box(n)[3]<=fb[1]
       and n.get('enabled')=='true' and n.get('focusable')=='true']
 counts.update({'sameAppEdit':min(len(all_edits),16),'visibleAppEdit':min(len(visible),16),
  'inCardEdit':min(len(inside),3),'inGuardedBounds':min(len(safe),3),
  'nestedEdits':min(len([n for n in card.iter('node') if n in visible]),3),
  'focusedEdit':min(sum(n.get('focused')=='true' for n in safe),3),
  'focusedAppEdit':min(sum(n.get('focused')=='true' for n in all_edits),3)})
 label='Player '+str(index+1)+' name'
 full_name=lambda n:n.get('text')==value
 empty_name=lambda n:(n.get('text')==label or
                      (n.get('text')=='' and label in (n.get('hint'),n.get('content-desc'))))
 def named(n):return name_edit(n) and (empty_name(n) if value is None else full_name(n))
 names=[n for n in safe if named(n)]
 exact_id='player-handicap-'+(value or '')
 exact_label='Handicap for '+(value or 'player')
 def hcp(n):
  rid=node_id(n);desc=n.get('content-desc','')
  # Either exact source-backed field is sufficient; a contradictory exported
  # HCP alias cannot be silently dropped to make the other predicate pass.
  return (rid==exact_id or desc==exact_label) and (not rid.startswith('player-handicap-') or rid==exact_id) and (not desc.startswith('Handicap for ') or desc==exact_label)
 allowances=[n for n in safe if hcp(n)]
 counts.update({'nameExactlyMatches':min(len(names),3),
  'hcpIdExactlyMatches':min(sum(node_id(n)==exact_id for n in safe),3),
  'hcpLabelExactlyMatches':min(sum(n.get('content-desc')==exact_label for n in safe),3),
  'hcpExactlyMatches':min(len(allowances),3)})
 # Only an exact card at the lower clipping edge with no ambiguous or
 # contradictory visible semantics can justify one navigation gesture.
 known=[n for n in inside if named(n) or hcp(n)]
 partial_names=[n for n in known if named(n)]
 partial_hcp=[n for n in known if hcp(n)]
 pending_clip=(counts['sceneBounds'] and not counts['competingCards'] and counts['cardAtLowerClip']
               and len(safe)<2 and 0<len(known)==len(inside)<=2
               and len(partial_names)<=1 and len(partial_hcp)<=1
               and len(partial_names)+len(partial_hcp)==len(inside)
               and all(n.get('enabled')=='true' and n.get('focusable')=='true' for n in known)
               and all(n in safe or box(n)[3]>lower for n in known)
               and not (len(known)==2 and overlap(box(known[0]),box(known[1]))))
 counts['nonconflictingClip']=int(bool(pending_clip))
 if pending_clip:
  # This is NOT a general single-field lookup or another reveal. It is only
  # the post-tap continuation of a separately proven blank name + HCP pair.
  if (after_verified_tap and value is None and index in (1,2,3) and
      len(inside)==len(safe)==len(names)==1 and not allowances and
      counts['focusedAppEdit']==1 and names[0].get('focused')=='true'):
   counts['focusedClipAccepted']=1
   return names[0]
  raise ValueError('PLAYER_CARD_LOWER_EDGE_CLIPPED')
 if (not counts['sceneBounds'] or counts['competingCards'] or len(inside)!=2 or len(safe)!=2 or
     len(names)!=1 or len(allowances)!=1 or names[0] is allowances[0] or
     overlap(box(names[0]),box(allowances[0]))):
  raise ValueError('PLAYER_PAIR_UNVERIFIED')
 return names[0]

def player_card(label):
 m=re.fullmatch(r'Player ([234]) name',label)
 return 'contest-player-'+str(int(m[1])-1) if m else None

def footer_check(root,n):
 footer=one(root,'contest-footer')
 relation=any(k is n for k in footer.iter('node')) and n is not footer
 enclosed=contained(box(n),box(footer))
 return {'targetDescendsFooter':relation,'targetInFooterBounds':enclosed,
         'targetEnabled':n.get('enabled')=='true','targetClickable':n.get('clickable')=='true',
         'targetBoundsPx':box(n),'footerBoundsPx':box(footer)}

def diagnostic_guard(xml,focus,package):
 target_focus(focus,package)
 root=tree(xml,package)
 # Foreground-only capture is never a scene acceptance. Require app nodes;
 # global default-display and Activity/scale/source/APK checks remain in capture.
 if not any(n.get('package')==package and box(n) for n in root.iter('node')):
  raise CaptureBoundaryFailure('NO_VISIBLE_APP_CONTENT')
 return []


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
 for text in TEXTS.get(name,()):scene_node(root,text,'text')
 if name in ('entry','entry-invalid'):join_form(root,filled=name=='entry-invalid')
 if name=='paywall-disabled':
  n=one(root,'Currently unavailable','text')
  # Android may expose disabled state on a containing Pressable; require explicit
  # false on that node or its ancestor, never infer it from copy/color.
  parents={c:p for p in root.iter() for c in p}
  while n is not None and n.get('enabled')!='false':n=parents.get(n)
  if n is None:raise ValueError('DISABLED_STATE_UNOBSERVED')
 return True

class Driver:
 def __init__(self,c):self.c=c;self.phase='entry';self.report=[];self.out=pathlib.Path(c['out']+'-continuation');self.out.mkdir(exist_ok=False);self.reason=None;self.observations=[];self.hostName=None;self.diagnostic=None;self.joinTapped=False
 def adb(self,*args):return subprocess.check_output(['adb','-s',self.c['serial'],*args],timeout=15,stderr=subprocess.PIPE).decode()
 def read(self):
  from smoke import read_focus
  try:
   target_focus(read_focus(self.adb),self.c['package'])
   return tree(self.adb('exec-out','uiautomator','dump','/dev/tty'),self.c['package'])
  except Exception:raise CaptureBoundaryFailure('FOREGROUND_OR_HIERARCHY_BOUNDARY_FAILED') from None
 def seek(self,key,kind='id',direction='down'):
  for attempt in range(9):
   root=self.read()
   if kind=='text' and key==FIND:return root,find_button(root)
   found=matches(root,key,kind)
   roles={'home-join-code':'home-join','home-new-contest':'home-new-contest','contest-step-setup':'setup-scene','contest-player-0':'host-card','Player 2 name':'guest-player-input'}
   if key in roles and hasattr(self,'observations'):
    self.observations.append({'checkpoint':'lookup','selectors':[{'role':roles[key],'kind':kind,'matches':min(len(found),2)}]})
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
  footer=matches(root,'contest-footer')
  if key in ('contest-continue','contest-start'):
   check=footer_check(root,n)
   self.observations.append({'checkpoint':'footer-control','control':key,**check})
   if not check['targetDescendsFooter'] or not check['targetInFooterBounds']:
    raise ValueError('CONTROL_BEHIND_FOOTER')
   if not check['targetEnabled'] or not check['targetClickable']:raise ValueError('CONTROL_DISABLED')
  elif n.get('enabled')=='false':raise ValueError('CONTROL_DISABLED')
  if footer and key not in ('contest-continue','contest-start') and b>box(footer[0])[1]:raise ValueError('CONTROL_BEHIND_FOOTER')
  self.adb('shell','input','tap',str((l+r)//2),str((t+b)//2));time.sleep(.3)
 def fill(self,label,value):
  permitted={'Join code':'AAAAAA','Display name':'QAGuest','Player 2 name':'QAGuest',
             'Player 3 name':'QAThree','Player 4 name':'QAFour'}
  if label not in permitted or value!=permitted[label]:raise ValueError('NON_SYNTHETIC_INPUT')
  roles={'Join code':'join-code-input','Display name':'guest-display-input','Player 2 name':'guest-player-input','Player 3 name':'third-player-input','Player 4 name':'fourth-player-input'}
  card=player_card(label)
  if card:
   index=int(card.rsplit('-',1)[1])
   root,_=self.seek(card)
   field=self.player_field_reveal(root,index,None,'name-before-edit')
   l,t,r,b=box(field)
   self.adb('shell','input','tap',str((l+r)//2),str((t+b)//2))
   # Take a fresh native hierarchy after this proved tap. The IME can
   # squeeze the HCP under the footer; its visibility never authorizes typing.
   fresh=self.read()
   if not re.search(r'\bmInputShown=true\b',self.adb('shell','dumpsys','input_method')):
    raise ValueError('KEYBOARD_DISMISSAL_UNVERIFIED')
   observed={'checkpoint':'name-after-focus','playerIndex':index,'playerPredicates':{}}
   self.observations.append(observed)
   counts=observed['playerPredicates']
   focused=player_pair(fresh,index,None,self.c['package'],counts,after_verified_tap=True)
   # No stable product ID exists for the name yet. Match the exact already
   # selected field's resource-id (even when empty) and horizontal anchor.
   # IME can move Y, but cannot substitute another card or field.
   same_field=(focused.get('resource-id','')==field.get('resource-id','') and
               (box(focused)[0],box(focused)[2])==(l,r))
   observed['sameNameAnchor']=same_field
   if not same_field or focused.get('focused')!='true' or counts['focusedAppEdit']!=1:
    raise ValueError('PLAYER_FOCUS_UNVERIFIED')
  else:
   root,field=self.seek(label,'input')
   if field.get('enabled')!='true' or field.get('text','') not in ('',label):
    raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
   self.observations.append({'checkpoint':'input','selectors':[{'role':roles[label],'kind':'input','matches':min(len(matches(root,label,'input')),2)}]})
   self.tap(label,'input')
  self.adb('shell','input','text',value)
  if not re.search(r'\bmInputShown=true\b',self.adb('shell','dumpsys','input_method')):
   raise ValueError('KEYBOARD_DISMISSAL_UNVERIFIED')
  self.adb('shell','input','keyevent','4');time.sleep(.3)
  root=self.read()
  if card:self.player_field_reveal(root,index,value,'name-after-edit')
  elif one(root,value,'input').get('text')!=value:raise ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
 def verify_join_values(self):
  join_form(self.read(),filled=True)
 def guard(self,root,name):
  proof={'checkpoint':name,'selectors':selector_counts(root,name)}
  if name in ('entry','entry-invalid'):proof['findContestCandidates']=join_candidates(root)
  self.observations.append(proof)
  validate(root,name)
 def join_diagnostic(self):
  if not self.joinTapped or self.phase!='join-destination':raise CaptureBoundaryFailure('DIAGNOSTIC_NOT_AFTER_JOIN_TAP')
  cfg={**self.c,'out':str(self.out/'join-unidentified'),'_scene':diagnostic_guard,
       '_checkpoint':'join-unidentified','_diagnostic_only':True}
  try:capture(cfg)
  except Exception:raise CaptureBoundaryFailure('DIAGNOSTIC_CAPTURE_BOUNDARY_FAILED') from None
  self.diagnostic={'scene':'UNIDENTIFIED','captured':True,'sceneVerified':False,'geometryPassed':False,'nativeAcceptance':False}
 def player_field(self,root,index,value,checkpoint):
  # Only fixed role/index labels and redacted, bounded predicate counts persist.
  observation={'checkpoint':checkpoint,'playerIndex':index,'playerPredicates':{}}
  self.observations.append(observation)
  return player_pair(root,index,value,self.c['package'],observation['playerPredicates'])
 def player_field_reveal(self,root,index,value,checkpoint):
  try:return self.player_field(root,index,value,checkpoint)
  except ValueError as error:
   if str(error)!='PLAYER_CARD_LOWER_EDGE_CLIPPED':raise
  # Exactly one guarded scroll and one new dump. Never scroll on a visible
  # semantic contradiction; never use this while restoring focus after a tap.
  self.scroll('down',root)
  return self.player_field(self.read(),index,value,checkpoint+'-after-reveal')
 def prepare_host(self,root=None):
  self.player_field(self.read() if root is None else root,0,'Golfer','host-prefill')
  self.hostName='Golfer' # Exact readback above. No taps or edits on host path.
 def verify_draft_name(self,index,value):
  root,_=self.seek('contest-player-'+str(index))
  self.player_field_reveal(root,index,value,'draft-name-retained')
 def shot(self,name):
  self.phase=name
  root=self.read();self.guard(root,name)
  def guard(xml,focus,package):
   target_focus(focus,package);validate(tree(xml,package),name);return []
  cfg={**self.c,'out':str(self.out/name),'_scene':guard,'_checkpoint':name}
  try:capture(cfg)
  except Exception:raise CaptureBoundaryFailure('CONTINUATION_CAPTURE_BOUNDARY_FAILED') from None
  # Bounds are observed accessibility bounds, not painted glyph geometry or dp.
  targets=list(SCENES[name])+list(TEXTS.get(name,()))
  bounds={str(i):box(scene_node(root,k,'id' if k in SCENES[name] else 'text')) for i,k in enumerate(targets)}
  self.report.append({'checkpoint':name,'captured':True,'observedBoundsPx':bounds,'geometryPassed':False,'visualReviewRequired':True})
 def save(self,status):
  captured=[r['checkpoint'] for r in self.report if r.get('captured')]
  (self.out/'continuation.json').write_text(json.dumps({'sourceSha':self.c_source(),'status':status,'phase':self.phase,'reason':self.reason,'blockedAfterCapture':status=='BLOCKED' and bool(captured or self.diagnostic),'capturedCheckpoints':captured,'selectorObservations':self.observations,'diagnosticCapture':self.diagnostic,'checkpoints':self.report,'aggregatePass':False,'runtimeRNScale':None,'nativeJoin':False,'catalog':'offline-fallback-no-provider','blocked':['online-host-approval-binding-score-reconnect','initialized-RN-scale','independent-geometry-review']},indent=2)+'\n')
 def c_source(self):
  from smoke import SHA
  return SHA

def journey(c,lane='all'):
 if lane not in ('all','join','wizard'):raise ValueError('UNKNOWN_LANE')
 d=Driver(c)
 try:
  if lane in ('all','join'):
   d.phase='join-home-lookup';d.seek('home-join-code')
   d.phase='join-home-tap';d.tap('home-join-code');d.joinTapped=True
   d.phase='join-destination';d.guard(d.read(),'entry')
   d.shot('entry')
   d.phase='join-invalid';d.fill('Join code','AAAAAA');d.fill('Display name','QAGuest')
   d.verify_join_values()
   d.tap(FIND,'text')
   d.seek(MISSING,'text');d.shot('entry-invalid');d.tap('join-dismiss')
   if lane=='join':
    d.save('CAPTURED_SUPPLEMENTAL_ONLY');return
  d.phase='setup-tap';d.tap('home-new-contest')
  d.phase='setup-scene';d.seek('contest-step-setup');d.guard(d.read(),'setup-initial')
  d.shot('setup-initial')
  d.phase='host-prefill';d.seek('contest-player-0');d.prepare_host()
  d.phase='guest-entry';d.fill('Player 2 name','QAGuest')
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
  d.tap('new-contest-back');d.verify_draft_name(0,d.hostName)
  for index,name in [(1,'QAGuest'),(2,'QAThree'),(3,'QAFour')]:
   d.verify_draft_name(index,name)
  d.seek('rounds-2',direction='up');validate(d.read(),'rounds')
  d.report.append({'checkpoint':'draft-retained','verified':True})
  d.tap('new-contest-back');d.save('CAPTURED_SUPPLEMENTAL_ONLY')
 except Exception as error:
  if d.phase=='join-destination' and navigation_reason(error):
   try:d.join_diagnostic()
   except CaptureBoundaryFailure:
    d.reason='FATAL_BOUNDARY_OR_UNCLASSIFIED';d.save('BLOCKED');raise
  d.reason=navigation_reason(error) or 'FATAL_BOUNDARY_OR_UNCLASSIFIED'
  d.save('BLOCKED')
  if isinstance(error,CaptureBoundaryFailure):raise
  if navigation_reason(error):raise SupplementalJourneyBlocked(d.phase,d.reason) from None
  raise
