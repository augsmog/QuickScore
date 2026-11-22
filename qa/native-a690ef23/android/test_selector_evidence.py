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
     focus[4].set('focused','false')
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
 def test_exact_40c017_focus_clip_trace_at_both_scales_with_no_posttap_swipe(self):
  for scale in (1.0,1.3):
   for bad in (None,'unfocused','wrong-card','wrong-name','keyboard-hidden','overlap','conflict',
               'not-at-lower-clip','other-field-focused','anchor-changed','id-changed','hcp-returns-unbound'):
    with self.subTest(scale=scale,bad=bad),tempfile.TemporaryDirectory() as td:
     pre,_,precard,pre_edits,prefield,_=ownership_fixture(scale,1,None)
     footer_top=1993 if scale==1.0 else 1976
     other=c.one(pre,'contest-player-0')
     other.set('bounds','[55,900][1025,1470]')
     precard.set('bounds',f'[55,1500][1025,{footer_top}]')
     prefield.set('bounds','[217,1530][920,1658]')
     # Preserve full pair pre-tap, no XML descendants. Both real traces had
     # the pre-tap card on the lower edge even though the HCP was visible.
     pre_hcp=next(n for n in pre.iter('node') if c.node_id(n)=='player-handicap-')
     pre_hcp.set('bounds','[160,1720][344,1830]')
     pre_edits[-2].set('bounds','[217,950][920,1060]')
     pre_edits[-1].set('bounds','[160,1100][344,1200]')
     focus,_,card,edits,name,hcp=ownership_fixture(scale,1,None,True)
     # No raw bytes were retained by the device: reconstruct the redacted
     # predicates, including per-scale remaining visible EditText counts.
     hcp.set('bounds','[160,1900][344,1980]')
     edits.remove(hcp)
     cutoff=1660 if scale==1.0 else 1640
     c.one(focus,'contest-footer').set('bounds',f'[0,{cutoff}][1080,2208]')
     for k in ('contest-step-setup','contest-scroll'):
      c.one(focus,k).set('bounds',f'[55,345][1025,{cutoff}]')
     c.one(focus,'contest-player-0').set('bounds','[55,800][1025,1380]')
     card.set('bounds',f'[55,1440][1025,{cutoff}]')
     name.set('bounds','[217,1470][920,1598]')
     [node for node in edits if node is not name][-1].set('visible-to-user','false')
     if scale==1.3:[node for node in edits if node is not name][-2].set('visible-to-user','false')
     if bad=='unfocused':name.set('focused','false')
     if bad=='wrong-card':card.set('resource-id','contest-player-2')
     if bad=='wrong-name':name.set('text','not the intended name')
     if bad=='overlap':c.one(focus,'contest-player-0').set('bounds',card.get('bounds'))
     if bad=='conflict':
      extra=ET.fromstring(ET.tostring(name));extra.set('text','conflicting name');edits.append(extra)
     if bad=='not-at-lower-clip':card.set('bounds',f'[55,1440][1025,{cutoff-1}]')
     if bad=='other-field-focused':edits[0].set('focused','true')
     if bad=='anchor-changed':name.set('bounds','[220,1470][920,1598]')
     if bad=='id-changed':name.set('resource-id','unrelated-edit-control')
     after,_,_,_,_,post_hcp=ownership_fixture(scale,1,'QAGuest')
     if bad=='hcp-returns-unbound':
      post_hcp.set('resource-id','player-handicap-wrong');post_hcp.set('content-desc','Handicap for wrong')
     d=self.driver(td)
     with patch.object(d,'read',side_effect=[pre,focus,after]),patch.object(d,'adb',return_value='mInputShown=false' if bad=='keyboard-hidden' else 'mInputShown=true') as adb,patch.object(c.time,'sleep'):
      if bad:
       with self.assertRaises(ValueError):d.fill('Player 2 name','QAGuest')
      else:d.fill('Player 2 name','QAGuest')
      commands=[x.args for x in adb.call_args_list]
      self.assertFalse(any(c[:3]==('shell','input','swipe') for c in commands))
      self.assertEqual([c for c in commands if c[:3]==('shell','input','text')],
                       [('shell','input','text','QAGuest')] if bad in (None,'hcp-returns-unbound') else [])
      if not bad:
       probe=next(o for o in d.observations if o['checkpoint']=='name-after-focus')
       inv=probe['playerPredicates']
       self.assertEqual(tuple(inv[k] for k in ('sameAppEdit','visibleAppEdit','inCardEdit','nameExactlyMatches',
                        'hcpExactlyMatches','focusedAppEdit','cardAtLowerClip','focusedClipAccepted')),
                        (5,4 if scale==1.0 else 3,1,1,0,1,1,1))
       self.assertTrue(probe['sameNameAnchor'])
       self.assertEqual(d.observations[-1]['checkpoint'],'name-after-edit')
 def test_guest_no_input_if_prefill_unproved(self):
  root,_,_,_,_,hcp=ownership_fixture(1.3,1,None)
  hcp.attrib.pop('resource-id');hcp.attrib.pop('content-desc')
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',return_value=root) as read,patch.object(d,'adb') as adb:
    with self.assertRaisesRegex(ValueError,'PLAYER_PAIR_UNVERIFIED'):d.fill('Player 2 name','QAGuest')
    adb.assert_not_called();read.assert_called_once()

def add_fixture(scale=1.0,index=2,mode='pair',after=False):
 dy=0 if scale==1.0 else 59
 limit=1993 if scale==1.0 else 1976
 def n(key='',b=(55,345,1025,1950),**kw):
  return node(**{'package':'test.app','resource-id':key,
                'bounds':f'[{b[0]},{b[1]}][{b[2]},{b[3]}]',**kw})
 root=ET.Element('hierarchy')
 scroll=n('contest-scroll',(55,345,1025,limit),scrollable='true')
 setup=n('contest-step-setup',(55,345,1025,limit))
 footer=n('contest-footer',(0,limit,1080,2208));back=n('new-contest-back',(55,158,187,290))
 root.extend([scroll,footer,back]);scroll.append(setup)
 prior=n('contest-player-'+str(index-1),(55,980+dy,1025,1270+dy))
 setup.append(prior)
 add=n('',(80,1310+dy,1000,1450+dy),clickable='true',**{'class':'android.view.ViewGroup','content-desc':c.ADD_PLAYER})
 label=n('',(420,1350+dy,680,1400+dy),text=c.ADD_PLAYER,clickable='false',**{'class':'android.widget.TextView'})
 wrapper=n('',(370,1330+dy,700,1420+dy),clickable='false',**{'class':'android.view.View'})
 if mode!='none':setup.append(add)
 if mode in ('pair','outside-alias','foreign-label','wrong-class','clickable-label','wrong-wrapper','wrong-desc'):
  add.append(wrapper);wrapper.append(label)
 if mode=='alias-sibling':setup.append(label)
 if mode=='independent':setup.append(ET.fromstring(ET.tostring(add)))
 if mode=='third':
  add.extend([label,ET.fromstring(ET.tostring(label))])
 if mode=='outside-alias':label.set('bounds','[15,1300][79,1340]')
 if mode=='foreign-label':label.set('package','test.foreign')
 if mode=='wrong-class':label.set('class','android.view.View')
 if mode=='clickable-label':label.set('clickable','true')
 if mode=='wrong-wrapper':wrapper.set('clickable','true')
 if mode=='wrong-desc':add.set('text',c.ADD_PLAYER);add.attrib.pop('content-desc')
 if mode=='behind-footer':add.set('bounds',f'[80,{limit-100}][1000,{limit+10}]')
 if mode=='outside-scroll':add.set('bounds','[0,1300][54,1400]')
 if mode=='wrong-scene':setup.set('resource-id','contest-step-gamemodes')
 if mode=='disabled':add.set('enabled','false')
 if mode=='label-only':add.set('class','android.widget.TextView');add.set('clickable','false')
 if after:setup.append(n('contest-player-'+str(index),(55,1300+dy,1025,1640+dy)))
 return root,setup,prior,add

class AddPlayerControls(unittest.TestCase):
 def driver(self,td):
  return c.Driver({'out':td+'/test','package':'test.app','serial':'emulator-5554'})
 def test_exact_add_pair_and_single_owner_at_both_scales_for_both_indices(self):
  for scale in (1.0,1.3):
   for index in (2,3):
    for alias in ('pair','single'):
     with self.subTest(scale=scale,index=index,alias=alias),tempfile.TemporaryDirectory() as td:
      root,_,_,target=add_fixture(scale,index,alias)
      after,*_=add_fixture(scale,index,after=True)
      d=self.driver(td)
      with patch.object(d,'read',side_effect=[root,after]),patch.object(d,'adb') as adb,patch.object(c.time,'sleep'):
       d.add_player(index)
      l,t,r,b=c.box(target)
      adb.assert_called_once_with('shell','input','tap',str((l+r)//2),str((t+b)//2))
      control,before,post=d.observations
      self.assertEqual(control['sameActionAliasVerified'],alias=='pair')
      self.assertEqual((before['priorIndexMatches'],before['nextIndexMatches'],post['nextIndexMatches']),(1,0,1))
      serialized=json.dumps(d.observations)
      self.assertNotIn(c.ADD_PLAYER,serialized);self.assertNotIn('test.app',serialized)
 def test_ambiguous_or_unsafe_add_never_taps_or_scrolls_to_hide_it(self):
  for mode in ('independent','alias-sibling','third','outside-alias','foreign-label','wrong-class','clickable-label',
               'wrong-wrapper','wrong-desc','behind-footer','outside-scroll','wrong-scene','disabled','label-only'):
   with self.subTest(mode=mode),tempfile.TemporaryDirectory() as td:
    root,*_=add_fixture(1.3,mode=mode)
    d=self.driver(td)
    with patch.object(d,'read',return_value=root) as read,patch.object(d,'adb') as adb:
     with self.assertRaises(ValueError):d.add_player(2)
     read.assert_called_once();adb.assert_not_called()
 def test_preexisting_next_or_wrong_previous_never_taps(self):
  for fault in ('preexisting','higher','no-prior','prior-below','duplicated-prior'):
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as td:
    root,setup,prior,target=add_fixture(after=fault=='preexisting')
    if fault=='higher':setup.append(node(**{'resource-id':'contest-player-3'}))
    if fault=='no-prior':setup.remove(prior)
    if fault=='prior-below':prior.set('bounds','[55,1330][1025,1600]')
    if fault=='duplicated-prior':setup.append(ET.fromstring(ET.tostring(prior)))
    d=self.driver(td)
    with patch.object(d,'read',return_value=root) as read,patch.object(d,'adb') as adb:
     with self.assertRaisesRegex(ValueError,'ADD_PLAYER_ORDER_UNVERIFIED'):d.add_player(2)
     read.assert_called_once();adb.assert_not_called()
 def test_posttap_missing_or_duplicate_never_retaps_and_search_is_bounded(self):
  for fault in ('missing','duplicate','higher','wrong-order','revealed'):
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as td:
    root,*_=add_fixture()
    after,setup,prior,_=add_fixture(after=fault!='missing')
    if fault=='duplicate':setup.append(ET.fromstring(ET.tostring(c.one(after,'contest-player-2'))))
    if fault=='higher':setup.append(node(**{'resource-id':'contest-player-3'}))
    if fault=='wrong-order':prior.set('bounds','[55,1250][1025,1390]')
    missing,*_=add_fixture()
    side=[root,missing,after] if fault=='revealed' else [root,after,after,after]
    d=self.driver(td)
    with patch.object(d,'read',side_effect=side) as read,patch.object(d,'adb') as adb,patch.object(c.time,'sleep'):
     if fault=='revealed':d.add_player(2)
     else:
      with self.assertRaises(ValueError):d.add_player(2)
     cmds=[call.args[:3] for call in adb.call_args_list]
     self.assertEqual(cmds.count(('shell','input','tap')),1)
     self.assertEqual(cmds.count(('shell','input','swipe')),2 if fault=='missing' else 1 if fault=='revealed' else 0)
     self.assertEqual(read.call_count,4 if fault=='missing' else 3 if fault=='revealed' else 2)
 def test_players_end_uses_same_typed_guard_and_owner_bounds_without_tap(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   root,_,_,target=add_fixture(1.3,3)
   wrong,*_=add_fixture(1.3,3,'alias-sibling')
   def fake_capture(cfg):
    with patch.object(c,'target_focus'):
     cfg['_scene'](ET.tostring(root).decode(),'','test.app')
     with self.assertRaises(ValueError):cfg['_scene'](ET.tostring(wrong).decode(),'','test.app')
   with patch.object(d,'read',return_value=root),patch.object(c,'capture',side_effect=fake_capture),patch.object(d,'adb') as adb:
    d.shot('players-end')
    adb.assert_not_called()
   self.assertEqual(d.report[-1]['observedBoundsPx']['2'],c.box(target))
   self.assertTrue(d.observations[-1]['sameActionAliasVerified'])
   with self.assertRaises(ValueError):d.guard(wrong,'players-end')

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
