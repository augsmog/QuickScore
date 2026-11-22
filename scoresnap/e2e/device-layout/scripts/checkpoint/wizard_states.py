"""Visible source-bound wizard controls. No state inference from taps."""
from collections import Counter
import pathlib
import exercised_flow as f
import android_capture as b
import rounds_paint as paint

def source_policy(repo):
 s=(pathlib.Path(repo)/'scoresnap/app/contest/new.tsx').read_text();t=(pathlib.Path(repo)/'scoresnap/src/ui/theme.ts').read_text()
 for text in ['testID="team-mode"','value={hasTeams}','testID={`player-team-${player.name}-${t.id}`}','backgroundColor: isActive ? COLORS.primary : COLORS.surfaceHighest']:
  if s.count(text)!=1:raise b.Failure('wizard-state-source')
 if 'surfaceHighest: "#E7EEE6"' not in t or 'primary: "#175C3A"' not in t:raise b.Failure('wizard-state-palette')

def visible(root,node):
 f.validate(root,'setup-initial');scope=f.one(root,'contest-scroll');footer=f.one(root,'contest-footer');r=f.box(node)
 if node.get('package')!=b.PACKAGE or node.get('enabled')!='true' or not r or not f.contained(r,f.box(scope)) or r[3]>f.box(footer)[1]:raise b.Failure('wizard-state-visibility')
 return r

def team(root,wanted):
 n=f.one(root,'team-mode');visible(root,n)
 if n.get('class')!='android.widget.Switch' or n.get('checkable')!='true' or n.get('checked')!=str(wanted).lower():raise b.Failure('team-state-unobserved')
 label=f.one(root,'Team Mode','text');visible(root,label)
 return n

def chips(root,index,name,selected):
 counts={};field=f.player_pair(root,index,name,b.PACKAGE,counts)
 card=f.one(root,'contest-player-'+str(index));cb=f.box(card)
 nodes=[f.one(root,'player-team-'+name+'-'+v) for v in ('A','B')]
 for n in nodes:
  r=visible(root,n)
  if not f.contained(r,cb) or n.get('clickable')!='true':raise b.Failure('team-chip-scope')
  state=n.get('selected')
  # false on both can mean RN has not exported selected state; paint is mandatory.
  if state=='true' and n is not nodes[0 if selected=='A' else 1]:raise b.Failure('team-chip-native-conflict')
 hcp=f.one(root,'player-handicap-'+name);visible(root,hcp)
 if hcp.get('text')!='0':raise b.Failure('hcp-zero-unobserved')
 return nodes,field,hcp

def painted(png,bounds,selected):
 w,h,pixel=paint.pixels(png)
 for i,(l,t,r,bot) in enumerate(bounds):
  if not 0<=l<r<=w or not 0<=t<bot<=h:raise b.Failure('chip-frame')
  color=paint.PRIMARY if i==(0 if selected=='A' else 1) else (231,238,230)
  if Counter(pixel(x,y) for x in range(l,r) for y in range(t,bot))[color] <= (r-l)*(bot-t)/2:raise b.Failure('chip-paint-unobserved')
 return selected

def capture_team(d,wanted):
 name='teams-on' if wanted else 'teams-off';d.phase=name
 def check(xml,_):return [f.box(team(f.tree(xml.decode(),b.PACKAGE),wanted))]
 b.capture(d.device,d.c['binding'],name,d.out/name,final_source_check=d.check_identity,scene_check=check,
   evidence_observer=lambda xml,o:{'kind':'team-state/v1','checked':wanted})
 d.report.append({'checkpoint':name,'captured':True,'geometryPassed':False})

def enable_teams(d):
 source_policy(d.c['repo']);d.seek('team-mode');capture_team(d,False)
 d.tap('team-mode');capture_team(d,True)

def assign_capture(d,index,name,selected,*,tap=True,prefix="player-state-"):
 d.seek('contest-player-'+str(index),direction='up' if index==0 else 'down');d.player_field_reveal(d.read(),index,name,'team-player')
 # Ordinary exact interactive chip, no direct state edit.
 if tap:d.tap('player-team-'+name+'-'+selected)
 checkpoint=prefix+str(index);d.phase=checkpoint
 def check(xml,_):
  nodes,field,hcp=chips(f.tree(xml.decode(),b.PACKAGE),index,name,selected)
  return [f.box(n) for n in [*nodes,field,hcp]]
 def observe(xml,png,binding):
  nodes,_,_=chips(f.tree(xml.decode(),b.PACKAGE),index,name,selected)
  painted(png,[f.box(n) for n in nodes],selected)
  return {'selectedTeam':selected,'playerIndex':index,'hcpValue':0,'method':'exact-chip-fill','pngSha256':b.digest(png),'hierarchySha256':b.digest(xml)}
 b.capture(d.device,d.c['binding'],checkpoint,d.out/checkpoint,final_source_check=d.check_identity,scene_check=check,image_observer=observe)
 d.report.append({'checkpoint':checkpoint,'captured':True,'geometryPassed':False})

def stress_top(d,*,prefix="stress"):
 d.seek('tournament-toggle',direction='up');d.phase=prefix+'-eight-rounds'
 def rounds(xml,_):
  root=f.tree(xml.decode(),b.PACKAGE);_,controls=f.tournament_controls(root,b.PACKAGE,True,{})
  return [f.box(n) for n in controls]
 b.capture(d.device,d.c['binding'],d.phase,d.out/d.phase,final_source_check=d.check_identity,scene_check=rounds,
   image_observer=lambda xml,png,binding:paint.observe(xml,png,binding,4))
 d.seek('team-mode');d.seek('8 ready','text');d.phase=prefix+'-eight-teams'
 def check(xml,_):
  root=f.tree(xml.decode(),b.PACKAGE);switch=team(root,True)
  ready=f.one(root,'8 ready','text');visible(root,ready)
  return [f.box(switch),f.box(ready)]
 # Only scrolling between retained-state snapshots, never app-state mutation.
 b.capture(d.device,d.c['binding'],d.phase,d.out/d.phase,final_source_check=d.check_identity,scene_check=check,
   evidence_observer=lambda xml,o:{'kind':'stress-top/v1','readyPlayers':8,'teams':True})
 d.report.append({'checkpoint':d.phase,'captured':True,'geometryPassed':False})
