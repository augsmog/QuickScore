"""Synthetic portable controls; not native evidence."""
import json,pathlib,tempfile,unittest,xml.etree.ElementTree as ET
from unittest.mock import patch,MagicMock
import checkpoints as c
from test_checkpoints import node,fixture
def pair(mode='nested'):
 r=fixture('entry')
 r.remove(next(n for n in r if n.get('text')==c.FIND))
 button=node(**{'class':'android.widget.Button','clickable':'true','content-desc':c.FIND,
                'bounds':'[60,150][550,240]'})
 label=node(**{'class':'android.widget.TextView','clickable':'false','text':c.FIND,
               'bounds':'[80,170][200,210]'})
 r.append(button)
 if mode=='sibling':r.append(label)
 elif mode=='independent-button':
  label.set('clickable','true');label.set('class','android.widget.Button');label.set('bounds',button.get('bounds'));r.append(label)
 elif mode=='outside':
  label.set('bounds','[10,10][25,25]');button.append(label)
 elif mode=='foreign':
  label.set('package','synthetic.foreign');button.append(label)
 elif mode=='third':
  button.append(label);r.append(node(text=c.FIND))
 else:button.append(label)
 return r,button

def ownership_fixture(scale=1.0,index=0,value='Golfer', focused=False):
 # Models exactly the observed six app EditTexts, separate view hierarchy,
 # zero descendants on the target card. Positive semantics are synthetic:
 # the blocked artifact did not retain its XML text/attribute predicates.
 r=ET.Element('hierarchy')
 dy=0 if scale==1.0 else 82
 target_y=1304+dy if index==0 else 1000+dy
 fb=1993 if scale==1.0 else 1976
 def n(rid='',b=(55,345,1025,1990),**kw):
  return node(**{'package':'test.app','resource-id':rid,
    'bounds':f'[{b[0]},{b[1]}][{b[2]},{b[3]}]',
    'class':'android.view.ViewGroup','clickable':'false','enabled':'true',**kw})
 def edit(b,text='',rid='',desc='',hint='',focus=False):
  e=n(rid,b,text=text,focusable='true',focused=str(focus).lower(),hint=hint,**{'content-desc':desc})
  e.set('class','android.widget.EditText');return e
 scroll=n('contest-scroll',(55,345,1025,fb),scrollable='true')
 setup=n('contest-step-setup',(55,345,1025,fb))
 card=n('contest-player-'+str(index),(55,target_y,1025,target_y+361))
 off=n('contest-player-'+str(1 if index==0 else 0),(55,target_y+383,1025,fb))
 field=edit((217,target_y+35,920,target_y+163),value if value is not None else 'Player '+str(index+1)+' name',focus=focused)
 hcp=edit((160,target_y+190,344,target_y+320),'0','player-handicap-'+(value or ''),'Handicap for '+(value or 'player'))
 edit_tree=n('',(55,345,1025,fb)) # Deliberately not the card's immediate XML parent.
 edit_tree.extend([edit((100,410,700,500)),edit((100,700,700,800)),field,hcp,
                    edit((217,target_y+420,900,target_y+470),'Different'),edit((170,target_y+480,343,target_y+525),'0')])
 setup.extend((card,off));scroll.append(setup)
 r.extend((scroll,edit_tree,n('contest-footer',(0,fb,1080,2208)),n('new-contest-back',(55,158,187,290))))
 return r,setup,card,edit_tree,field,hcp

class AndroidOwnership(unittest.TestCase):
 def driver(self,td):
  return c.Driver({'out':td+'/test','package':'test.app','serial':'emulator-5554'})
 def test_host_semantic_pair_at_both_scales_and_no_host_edits(self):
  for scale in (1.0,1.3):
   for alias in ('both','id-only','label-only'):
    with self.subTest(scale=scale,alias=alias),tempfile.TemporaryDirectory() as td:
     root,setup,card,edit_tree,field,hcp=ownership_fixture(scale)
     if alias=='id-only':hcp.attrib.pop('content-desc')
     if alias=='label-only':hcp.attrib.pop('resource-id')
     d=self.driver(td)
     with patch.object(d,'read',return_value=root),patch.object(d,'adb') as adb:d.prepare_host()
     adb.assert_not_called();self.assertEqual(d.hostName,'Golfer')
     inv=d.observations[0]['playerPredicates']
     self.assertEqual((inv['sameAppEdit'],inv['visibleAppEdit'],inv['inCardEdit'],inv['nestedEdits']),(6,6,2,0))
     self.assertEqual((inv['nameExactlyMatches'],inv['hcpExactlyMatches']),(1,1))
     recorded=json.dumps(d.observations)
     self.assertNotIn('Golfer',recorded);self.assertNotIn('test.app',recorded)
     with patch.object(d,'read',return_value=root):d.verify_draft_name(0,'Golfer')
     field.set('text','Not same')
     with self.assertRaisesRegex(ValueError,'PLAYER_PAIR_UNVERIFIED'),patch.object(d,'read',return_value=root):
      d.verify_draft_name(0,'Golfer')
 def test_declines_geometry_only_or_ambiguous_or_wrong_scene_without_retries_or_input(self):
  for fault in ('missing','duplicate-name','extra-edit','wrong-package','wrong-class','not-focusable','disabled','hidden',
                'overlapping-card','outside','footer','hcp-neither','hcp-conflict','wrong-value','wrong-scene',
                'duplicate-card','same-field','editable-overlap','unbounded-scroll'):
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as td:
    root,setup,card,edit_tree,field,hcp=ownership_fixture()
    if fault=='missing':edit_tree.remove(hcp)
    if fault=='duplicate-name':hcp.attrib.update(field.attrib)
    if fault=='extra-edit':edit_tree.append(ET.fromstring(ET.tostring(field)))
    if fault=='wrong-package':field.set('package','test.other')
    if fault=='wrong-class':field.set('class','android.widget.TextView')
    if fault=='not-focusable':field.set('focusable','false')
    if fault=='disabled':field.set('enabled','false')
    if fault=='hidden':field.set('visible-to-user','false')
    if fault=='overlapping-card':c.one(root,'contest-player-1').set('bounds',card.get('bounds'))
    if fault=='outside':field.set('bounds','[10,1340][500,1380]')
    if fault=='footer':c.one(root,'contest-footer').set('bounds','[0,1500][1080,2208]')
    if fault=='hcp-neither':hcp.attrib.pop('resource-id');hcp.attrib.pop('content-desc')
    if fault=='hcp-conflict':hcp.set('content-desc','Handicap for Some private name')
    if fault=='wrong-value':field.set('text','Some private name')
    if fault=='wrong-scene':root.append(node(**{'resource-id':'contest-step-gamemodes'}))
    if fault=='duplicate-card':setup.append(ET.fromstring(ET.tostring(card)))
    if fault=='same-field':field.set('resource-id','player-handicap-Golfer')
    if fault=='editable-overlap':field.set('bounds',hcp.get('bounds'))
    if fault=='unbounded-scroll':c.one(root,'contest-scroll').set('bounds','[55,345][1000,1900]')
    d=self.driver(td)
    with patch.object(d,'read',return_value=root) as read,patch.object(d,'adb') as adb:
     with self.assertRaisesRegex(ValueError,'PLAYER_PAIR_UNVERIFIED'):d.prepare_host()
     adb.assert_not_called();read.assert_called_once()
    self.assertNotIn('Some private name',json.dumps(d.observations))
 def test_guest_requires_fresh_exact_empty_pair_exclusive_focus_and_proved_keyboard(self):
  for scale in (1.0,1.3):
   for fault in (None,'unfocused','not-empty','hcp-focused','wrong-card','wrong-hcp','keyboard-hidden'):
    with self.subTest(scale=scale,fault=fault),tempfile.TemporaryDirectory() as td:
     raw,*_=ownership_fixture(scale,1,None)
     focused,_,card,_,field,hcp=ownership_fixture(scale,1,None,True)
     if fault=='unfocused':field.set('focused','false')
     if fault=='not-empty':field.set('text','already present');field.set('hint','Player 2 name')
     if fault=='hcp-focused':hcp.set('focused','true')
     if fault=='wrong-card':card.set('resource-id','contest-player-2')
     if fault=='wrong-hcp':hcp.attrib.pop('resource-id');hcp.set('content-desc','Handicap for nobody')
     after,*_=ownership_fixture(scale,1,'QAGuest')
     d=self.driver(td)
     with patch.object(d,'read',side_effect=[raw,focused,after]),patch.object(d,'adb',return_value='mInputShown=false' if fault=='keyboard-hidden' else 'mInputShown=true') as adb,patch.object(c.time,'sleep'):
      if fault:
       with self.assertRaises(ValueError):d.fill('Player 2 name','QAGuest')
       self.assertFalse(any(call.args[:3]==('shell','input','text') for call in adb.call_args_list))
      else:
       d.fill('Player 2 name','QAGuest')
       self.assertEqual([call.args for call in adb.call_args_list if call.args[:3]==('shell','input','text')],[('shell','input','text','QAGuest')])
     self.assertNotIn('QAGuest',json.dumps(d.observations))
 def test_actual_lower_edge_model_at_13_reveals_once_before_input(self):
  for fault in (None,'wrong-visible-semantic','wrong-fully-visible','still-clipped'):
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as td:
    raw,_,card,edit_tree,field,hcp=ownership_fixture(1.3,1,None)
    if fault!='wrong-fully-visible':
     # Verified 1.3 screen footer top 1976; the Player 2 label/name lives
     # above it, with the HCP below the visible card cutoff. Mock semantics.
     card.set('bounds','[55,1772][1025,1976]')
     c.one(raw,'contest-player-0').set('bounds','[55,1386][1025,1747]')
     field.set('bounds','[217,1807][989,1938]')
     edit_tree.remove(hcp)
    if fault in ('wrong-visible-semantic','wrong-fully-visible'):field.set('text','wrong semantic')
    open_card,*_=ownership_fixture(1.3,1,None)
    if fault=='still-clipped':open_card=raw
    focused,*_=ownership_fixture(1.3,1,None,True)
    after,*_=ownership_fixture(1.3,1,'QAGuest')
    d=self.driver(td)
    with patch.object(d,'read',side_effect=[raw,open_card,focused,after]) as read,patch.object(d,'adb',return_value='mInputShown=true') as adb,patch.object(c.time,'sleep'):
     if fault:
      with self.assertRaisesRegex(ValueError,r'PLAYER_(PAIR_UNVERIFIED|CARD_LOWER_EDGE_CLIPPED)'):
       d.fill('Player 2 name','QAGuest')
      self.assertFalse(any(call.args[:3]==('shell','input','text') for call in adb.call_args_list))
     else:d.fill('Player 2 name','QAGuest')
     swipes=[call.args for call in adb.call_args_list if call.args[:3]==('shell','input','swipe')]
     self.assertEqual(len(swipes),0 if fault in ('wrong-visible-semantic','wrong-fully-visible') else 1)
     if fault in ('wrong-visible-semantic','wrong-fully-visible'):read.assert_called_once()
     if fault=='still-clipped':self.assertEqual(read.call_count,2)
 def test_post_edit_and_draft_readback_allow_one_guarded_reveal_but_never_focused_reveal(self):
  def clipped(root,card,edit_tree,field,hcp):
   card.set('bounds','[55,1772][1025,1976]')
   c.one(root,'contest-player-0').set('bounds','[55,1386][1025,1747]')
   field.set('bounds','[217,1807][989,1938]')
   edit_tree.remove(hcp)
   return root
  for phase in ('after-edit','draft','during-focus'):
   with self.subTest(phase=phase),tempfile.TemporaryDirectory() as td:
    before,*_=ownership_fixture(1.3,1,None)
    focus=ownership_fixture(1.3,1,None,True)
    after=ownership_fixture(1.3,1,'QAGuest')
    d=self.driver(td)
    partial_focus=lambda g:clipped(g[0],g[2],g[3],g[4],g[5])
    if phase=='during-focus':
     side=[before,partial_focus(focus)]
    else:
     partial=ownership_fixture(1.3,1,'QAGuest')
     side=[partial_focus(partial),after[0]]
     if phase=='after-edit':side=[before,focus[0],*side]
    with patch.object(d,'read',side_effect=side),patch.object(d,'adb',return_value='mInputShown=true') as adb,patch.object(c.time,'sleep'):
     if phase=='draft':d.verify_draft_name(1,'QAGuest')
     elif phase=='after-edit':d.fill('Player 2 name','QAGuest')
     else:
      with self.assertRaisesRegex(ValueError,'PLAYER_CARD_LOWER_EDGE_CLIPPED'):d.fill('Player 2 name','QAGuest')
      self.assertFalse(any(x.args[:3]==('shell','input','text') for x in adb.call_args_list))
     self.assertEqual(sum(x.args[:3]==('shell','input','swipe') for x in adb.call_args_list),0 if phase=='during-focus' else 1)
 def test_guest_no_input_if_prefill_unproved(self):
  root,_,_,_,_,hcp=ownership_fixture(1.3,1,None)
  hcp.attrib.pop('resource-id');hcp.attrib.pop('content-desc')
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',return_value=root) as read,patch.object(d,'adb') as adb:
    with self.assertRaisesRegex(ValueError,'PLAYER_PAIR_UNVERIFIED'):d.fill('Player 2 name','QAGuest')
    adb.assert_not_called();read.assert_called_once()

class Evidence(unittest.TestCase):
 def driver(self,td):
  return c.Driver({'out':td+'/test','package':'test.app','serial':'emulator-5554'})
 def test_all_counts_recorded_before_rejection_and_capped(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td);r=fixture('entry');r.remove(r[0])
   for _ in range(4):r.append(node(text='Find contest'))
   with self.assertRaises(ValueError):d.guard(r,'entry')
   rows=d.observations[0]['selectors']
   self.assertEqual([x['matches'] for x in rows],[0,1,1,2])
   self.assertEqual(len(rows),4)
 def test_one_actionable_parent_and_label_is_one_logical_find(self):
  r,button=pair()
  self.assertIs(c.find_button(r),button)
  self.assertTrue(c.validate(r,'entry'))
  evidence=c.join_candidates(r)
  self.assertEqual([e['clickable'] for e in evidence],['true','false'])
  self.assertTrue(evidence[1]['parentPath'][0]['isAnchor'])
  self.assertNotIn('test.app',repr(evidence))
 def test_pair_requires_actionable_same_target_and_contained_label(self):
  for mode in ('sibling','independent-button','outside','foreign','third'):
   with self.subTest(mode=mode),self.assertRaises(ValueError):c.find_button(pair(mode)[0])
  r,button=pair();button.set('enabled','false')
  with self.assertRaises(ValueError):c.find_button(r)
 def test_actual_query_must_have_two_distinct_typed_fields_and_offline_error(self):
  r=fixture('entry-invalid')
  self.assertTrue(c.validate(r,'entry-invalid'))
  name=next(n for n in r if n.get('hint')=='Display name')
  name.set('text','')
  with self.assertRaises(ValueError):c.validate(r,'entry-invalid')
  name.set('text','QAGuest')
  r.remove(next(n for n in r if n.get('text')==c.MISSING))
  with self.assertRaises(ValueError):c.validate(r,'entry-invalid')
 def test_footer_requires_same_observed_container_enabled_and_full_bounds(self):
  for condition in ('ok','outside','sibling','disabled','not-clickable'):
   with self.subTest(condition=condition),tempfile.TemporaryDirectory() as td:
    d=self.driver(td);r=fixture('setup-initial');footer=c.one(r,'contest-footer')
    footer.set('bounds','[0,700][600,890]')
    n=node(**{'resource-id':'contest-continue','bounds':'[20,720][580,850]',
              'clickable':'false' if condition=='not-clickable' else 'true',
              'enabled':'false' if condition=='disabled' else 'true'})
    if condition=='outside':n.set('bounds','[20,720][580,900]')
    (r if condition=='sibling' else footer).append(n)
    with patch.object(d,'seek',return_value=(r,n)),patch.object(d,'adb') as adb,patch.object(c.time,'sleep'):
     if condition=='ok':d.tap('contest-continue');adb.assert_called_once()
     else:
      with self.assertRaises(ValueError):d.tap('contest-continue')
      adb.assert_not_called()
 def test_blocked_after_capture_preserves_checkpoint_without_pass(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td);d.phase='host-prefill';d.reason='CONTROL_MISSING_OR_AMBIGUOUS'
   d.report=[{'checkpoint':'setup-initial','captured':True}]
   d.save('BLOCKED')
   receipt=json.loads((d.out/'continuation.json').read_text())
   self.assertTrue(receipt['blockedAfterCapture']);self.assertEqual(receipt['capturedCheckpoints'],['setup-initial'])
   self.assertFalse(receipt['aggregatePass']);self.assertFalse(receipt['nativeJoin'])
 def test_initial_wizard_precedes_names_and_survives_host_failure(self):
  d=MagicMock();d.report=[];d.prepare_host.side_effect=ValueError('PLAYER_PAIR_UNVERIFIED')
  with patch.object(c,'Driver',return_value=d):
   with self.assertRaises(c.SupplementalJourneyBlocked) as error:c.journey({},lane='wizard')
  d.shot.assert_called_once_with('setup-initial');d.fill.assert_not_called()
  self.assertEqual(error.exception.phase,'host-prefill')
 def test_no_diagnostic_before_successful_tap(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td);d.phase='join-destination'
   with patch.object(c,'capture') as capture:
    with self.assertRaises(c.CaptureBoundaryFailure):d.join_diagnostic()
   capture.assert_not_called()
 def test_diagnostic_distinct_from_checkpoint_and_boundary_fatal(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td);d.phase='join-destination';d.joinTapped=True
   with patch.object(c,'capture') as capture:d.join_diagnostic()
   self.assertTrue(capture.call_args.args[0]['_diagnostic_only'])
   self.assertFalse(d.diagnostic['sceneVerified']);self.assertEqual(d.report,[])
   with patch.object(c,'capture',side_effect=ValueError('APK')):
    with self.assertRaises(c.CaptureBoundaryFailure):d.join_diagnostic()
if __name__=='__main__':unittest.main()
