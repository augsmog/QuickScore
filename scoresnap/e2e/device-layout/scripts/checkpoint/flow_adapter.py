"""Source-bound ordinary wizard adapter of exact 5c81df7 exercised navigation.
No entrypoint/flags changes; missing main selectors stop before device access.
"""
import argparse,json,pathlib,re
import android_capture as boundary
import exercised_flow as flow
import rounds_paint
import wizard_states
import td_capture

REQUIRED={
 'scoresnap/app/contest/new.tsx':('contest-scroll','contest-footer','contest-player-'),
 'scoresnap/app/paywall.tsx':('paywall-close',),
}
def source_selectors(repo):
    for path,keys in REQUIRED.items():
        text=(pathlib.Path(repo)/path).read_text()
        for key in keys:
            # This is only a preflight, never scene proof. Runtime selectors must
            # still be observed in the correct hierarchy by the exercised code.
            if not re.search(r'testID\s*=\s*(?:["\']|\{`)' + re.escape(key),text):
                raise boundary.Failure('source-selector-'+key.rstrip('-'))

class BoundDriver(flow.Driver):
    def __init__(self,c):
        source_selectors(c['repo']);rounds_paint.source_policy(c['repo']);boundary.verify_inputs(c['repo'],c['apk'],c['binding'])
        self.device=boundary.Android(c['serial'],boundary.PACKAGE+'/.MainActivity')
        self.boot=self.device.identity()
        self.check_identity(c)
        boundary.scene(self.device.hierarchy(),'home')
        super().__init__(c)
    def check_identity(self,c=None):
        c=c or self.c
        rounds_paint.source_policy(c['repo'])
        boundary.verify_inputs(c['repo'],c['apk'],c['binding'])
        if self.device.identity()!=self.boot or self.device.installed()!=c['binding']['apk_sha256']:
            raise flow.CaptureBoundaryFailure('IDENTITY_CHANGED')
        self.device.foreground()
    def adb(self,*args):
        self.check_identity()
        # Navigation only: exact existing UI taps, bounded swipes, synthetic text,
        # keyboard operations. Never permit launch/reset/settings/service actions.
        if args!=('shell','dumpsys','input_method') and (len(args)<3 or args[:2]!=('shell','input') or args[2] not in ('tap','swipe','text','keyevent')):
            raise flow.CaptureBoundaryFailure('COMMAND_NOT_NAVIGATION')
        result=self.device.run(*args)
        self.check_identity()
        return result.decode('utf8','strict')
    def read(self):
        self.check_identity()
        return flow.tree(self.device.hierarchy().decode('utf8','strict'),boundary.PACKAGE)
    def enable_teams(self):wizard_states.enable_teams(self)
    def assign_player_state(self,index,name,selected):wizard_states.assign_capture(self,index,name,selected)
    def stress_eight_top(self):wizard_states.stress_top(self)
    def select_rounds_sequence(self):
        for count in (2,3,4):
            self.phase='rounds-select-'+str(count)
            root=self.read(); proof={}
            _,controls=flow.tournament_controls(root,boundary.PACKAGE,True,proof)
            target=controls[count-1] # heading, then 2/3/4; never a free coordinate
            l,t,r,b=flow.box(target)
            self.adb('shell','input','tap',str((l+r)//2),str((t+b)//2))
            observed={};flow.tournament_controls(self.read(),boundary.PACKAGE,True,observed)
            if observed.get('observedSelectedRoundCount') not in (None,count):
                raise flow.CaptureBoundaryFailure('ROUND_SELECTION_UNOBSERVED_OR_MISMATCH')
            self.shot_round_state(count)
    def shot_round_state(self,count):
        # Preserve independent files for 3/4; scene is still the existing rounds.
        self.phase='rounds-'+str(count)
        def check(xml,_):
            root=flow.tree(xml.decode('utf8','strict'),boundary.PACKAGE);proof={}
            flow.validate(root,'rounds')
            _,controls=flow.tournament_controls(root,boundary.PACKAGE,True,proof)
            if proof.get('observedSelectedRoundCount') not in (None,count):
                raise flow.CaptureBoundaryFailure('ROUND_SELECTION_UNOBSERVED_OR_MISMATCH')
            return [flow.box(n) for n in controls]
        boundary.capture(self.device,self.c['binding'],self.phase,self.out/self.phase,
            final_source_check=self.check_identity,scene_check=check,
            image_observer=lambda xml,png,b: rounds_paint.observe(xml,png,b,count))
        self.report.append({'checkpoint':self.phase,'captured':True,'selectedCount':count,'geometryPassed':False})
    def shot(self,name):
        if name in td_capture.PHASES:return td_capture.shot(self,name)
        self.phase=name
        def check(xml,checkpoint):
            root=flow.tree(xml.decode('utf8','strict'),boundary.PACKAGE)
            self.guard(root,checkpoint)
            return [flow.box(flow.scene_node(root,k,'id' if k in flow.SCENES[checkpoint] else 'text'))
                    for k in (*flow.SCENES[checkpoint],*flow.TEXTS.get(checkpoint,()))]
        try:
            boundary.capture(self.device,self.c['binding'],name,self.out/name,
                final_source_check=self.check_identity,scene_check=check)
        except Exception:raise flow.CaptureBoundaryFailure('CHECKPOINT_BOUNDARY_FAILED') from None
        self.report.append({'checkpoint':name,'captured':True,'geometryPassed':False})
    def capture_name_keyboard(self,index,value,anchor,resource_id):
        self.phase='name-keyboard'
        def proof(xml,observation):
            return keyboard_proof(xml,observation,index,value,anchor,resource_id)
        def check(xml,_):
            return [tuple(proof(xml,self.device.observation)['fieldFramePx'])]
        try:
            boundary.capture(self.device,self.c['binding'],'name-keyboard',self.out/'name-keyboard',
                final_source_check=self.check_identity,scene_check=check,evidence_observer=proof)
        except Exception:raise flow.CaptureBoundaryFailure('KEYBOARD_CHECKPOINT_BOUNDARY_FAILED') from None
        self.report.append({'checkpoint':'name-keyboard','captured':True,'geometryPassed':False})
    def verify_keyboard_dismissed(self,root,index,value):
        self.check_identity()
        observation=self.device.observation
        if observation.get('insets',{}).get('keyboard',{}).get('visible') is not False:
            raise flow.CaptureBoundaryFailure('KEYBOARD_DISMISSAL_UNVERIFIED')
        flow.player_pair(root,index,value,boundary.PACKAGE,{})
        flow.footer_action(root,'setup',boundary.PACKAGE,{})
        self.keyboardDismissed=True
        self.report.append({'checkpoint':'name-keyboard-dismissed','verified':True,'continueControlVerified':True})
    def advance_footer(self,before):
        if before=='setup' and not getattr(self,'keyboardDismissed',False):
            raise flow.CaptureBoundaryFailure('KEYBOARD_DISMISSAL_UNVERIFIED')
        if before=='setup':
            self.check_identity()
            if self.device.observation.get('insets',{}).get('keyboard',{}).get('visible') is not False:
                raise flow.CaptureBoundaryFailure('KEYBOARD_DISMISSAL_UNVERIFIED')
        if before=='round-settings':td_capture.route_started(self,before)
        super().advance_footer(before)
        if before=='round-settings':td_capture.route_opened(self)
        if before=='setup':self.report.append({'checkpoint':'setup-continue-destination','verified':True})
    def capture_start_viability(self):
        self.phase='start-viability'
        def check(xml,_):
            root=flow.tree(xml.decode(),boundary.PACKAGE)
            return [flow.box(flow.footer_action(root,'round-settings',boundary.PACKAGE,{}))]
        boundary.capture(self.device,self.c['binding'],self.phase,self.out/self.phase,
            final_source_check=self.check_identity,scene_check=check,
            evidence_observer=lambda xml,o:{'kind':'start-enabled/v1','enabled':True,'completion':'UNPROVEN'})
        self.report.append({'checkpoint':'Start','status':'VIABLE_CONTROL_ONLY','completion':'UNPROVEN_FREE_TD_PAYWALL'})
    def tap(self,key,kind='id',direction='down'):
        if getattr(self,'td_modal',False) and key!='paywall-close':
            raise flow.CaptureBoundaryFailure('TD_ACTION_NOT_CLOSE')
        super().tap(key,kind,direction)
        if getattr(self,'td_modal',False):
            self.check_identity();flow.validate(self.read(),'round-settings')
            self.td_closed_ns=td_capture.time.monotonic_ns();self.td_modal=False
            self.report.append({'checkpoint':'td-close','destination':'round-settings','verified':True})
    def verify_td_retention(self):
        if getattr(self,'td_modal',False) or not getattr(self,'td_closed_ns',None):
            raise flow.CaptureBoundaryFailure('TD_CLOSE_UNVERIFIED')
        for index,name in enumerate([self.hostName,'QAGuest','QAThree','QAFour','QAFive','QASix','QASeven','QAEight']):
            wizard_states.assign_capture(self,index,name,'B' if index%2 else 'A',tap=False,prefix='retained-player-')
        wizard_states.stress_top(self,prefix='retained')
        (self.out/'td-close.json').write_text(json.dumps({'status':'DRAFT_STATE_REOBSERVED','closedNs':self.td_closed_ns,'namesVerified':8,'teamAndHcpRowsReobserved':8,'rounds':4,'teams':True,'paintedTextProven':False,'nativeAcceptance':False})+'\n')
    def join_diagnostic(self):
        raise flow.CaptureBoundaryFailure('UNIDENTIFIED_SCENE_CAPTURE_DISABLED')
    def save(self,status):
        # Do not export arbitrary legacy errors or selector/input values.
        (self.out/'continuation.json').write_text(json.dumps({
            'source_sha':self.c['binding']['source_sha'],'source_tree':self.c['binding']['source_tree'],
            'status':status,'phase':self.phase,'reason':self.reason,
            'checkpoints':self.report,'native_gate':'INCOMPLETE','runtimeRNScale':None,
            'catalog':'offline-fallback-no-provider','nativeJoin':False})+'\n')

def keyboard_proof(xml,observation,index,value,anchor,resource_id):
    if index!=1 or value!='QAGuest':raise flow.CaptureBoundaryFailure('KEYBOARD_CHECKPOINT_SCOPE')
    root=flow.tree(xml.decode('utf8','strict'),boundary.PACKAGE)
    counts={};field=flow.player_pair(root,index,value,boundary.PACKAGE,counts,after_verified_tap=True)
    frame=flow.box(field)
    if field.get('focused')!='true' or counts.get('focusedAppEdit')!=1 or field.get('resource-id','')!=resource_id or (frame[0],frame[2])!=tuple(anchor):
        raise flow.CaptureBoundaryFailure('KEYBOARD_NAME_FOCUS_UNVERIFIED')
    inset=(observation or {}).get('insets',{});keyboard=inset.get('keyboard',{});size=(observation or {}).get('pixelSize')
    if inset.get('provider')!='aosp-api35-wms-client-insets/v1' or keyboard.get('visible') is not True or not isinstance(size,list):
        raise flow.CaptureBoundaryFailure('KEYBOARD_GEOMETRY_UNVERIFIED')
    k=keyboard.get('framePx')
    if not isinstance(k,list) or len(k)!=4 or any(type(x)!=int for x in k) or not (k[0]==0 and k[2]==size[0] and 0<k[1]<k[3]==size[1]) or frame[3]>k[1]:
        raise flow.CaptureBoundaryFailure('KEYBOARD_FIELD_OCCLUDED')
    return {'kind':'wizard-name-keyboard/v1','playerIndex':1,'focusedNameCount':1,'syntheticValueVerified':True,'sameFieldAnchorVerified':True,'fieldFramePx':list(frame),'keyboardFramePx':k}

def run(c):
    # Only the exercised ordinary wizard lane. Join remains a separate gate.
    source_selectors(c['repo'])
    return flow.journey({**c,'package':boundary.PACKAGE},lane='wizard',driver_class=BoundDriver)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('repo','apk','binding','serial','out'):p.add_argument('--'+key,required=True)
    a=p.parse_args()
    try:
        c=vars(a);c['binding']=json.loads(pathlib.Path(a.binding).read_text());run(c)
        print('{"status":"SUPPLEMENTAL_ONLY","native_gate":"INCOMPLETE"}');return 0
    except boundary.Failure as e:
        print(json.dumps({'status':'BLOCKED','phase':e.phase,'native_gate':'INCOMPLETE'}));return 1
    except Exception:
        print('{"status":"BLOCKED","phase":"ordinary-navigation","native_gate":"INCOMPLETE"}');return 1
if __name__=='__main__':raise SystemExit(main())
