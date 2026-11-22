"""Synthetic portable controls; not native evidence."""
import json,pathlib,tempfile,unittest,xml.etree.ElementTree as ET
from unittest.mock import patch,MagicMock
import checkpoints as c
from test_checkpoints import node,fixture
def host(value='',count=1):
 r=fixture('setup-initial');card=node(**{'resource-id':'contest-player-0'})
 for _ in range(count):card.append(node(**{'class':'android.widget.EditText','hint':'Your name','text':value,'bounds':'[10,10][50,20]'}))
 r.append(card)
 for n in r:
  if n.get('resource-id')=='contest-footer':n.set('bounds','[0,100][400,200]')
 return r

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

def ownership_fixture(index=0,value='Golfer'):
 r=ET.Element('hierarchy')
 def n(key='',bounds='[0,0][600,700]',**kwargs):
  return node(**{'package':'test.app','resource-id':key,'bounds':bounds,
                 'class':'android.view.ViewGroup','clickable':'false','enabled':'true',**kwargs})
 scroll=n('contest-scroll',scrollable='true');setup=n('contest-step-setup')
 owner=n('', '[10,100][590,650]');card=n('contest-player-'+str(index),'[30,120][550,290]')
 field=n('', '[100,140][500,190]',focusable='true',text=value,focused='false')
 field.set('class','android.widget.EditText')
 r.extend((scroll,n('contest-footer','[0,700][600,800]'),n('new-contest-back','[0,0][100,60]')))
 scroll.append(setup);setup.append(owner);owner.extend((card,field))
 return r,owner,card,field

class AndroidOwnership(unittest.TestCase):
 def driver(self,td):
  return c.Driver({'out':td+'/test','package':'test.app','serial':'emulator-5554'})
 def test_flattened_host_readonly_and_draft_exact(self):
  root,owner,card,field=ownership_fixture()
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',return_value=root),patch.object(d,'adb') as adb:d.prepare_host()
   adb.assert_not_called()
   self.assertEqual(d.hostName,'Golfer')
   self.assertEqual(d.observations[0]['inputOwnership'],'contained-native-sibling')
   self.assertEqual(d.observations[0]['hierarchyEditInventory']['insideCard'],0)
   self.assertEqual(d.observations[0]['hierarchyEditInventory']['insideCardBounds'],1)
   self.assertNotIn('Golfer',json.dumps(d.observations))
   self.assertNotIn('test.app',json.dumps(d.observations))
   self.assertIs(c.player_readback(root,0,'Golfer','test.app'),field)
   field.set('text','something changed')
   with self.assertRaises(ValueError):c.player_readback(root,0,'Golfer','test.app')
 def test_ambiguous_nested_never_falls_back_even_with_valid_sibling(self):
  root,owner,card,field=ownership_fixture()
  card.extend(ET.fromstring(ET.tostring(field)) for _ in range(2))
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',return_value=root),patch.object(d,'adb') as adb,patch.object(c,'flattened_name') as fallback:
    with self.assertRaisesRegex(ValueError,'AMBIGUOUS_CONTROL'):d.prepare_host()
    fallback.assert_not_called();adb.assert_not_called()
 def test_invalid_flattened_host_never_tapped(self):
  for fault in ('missing','duplicate','different-parent','wrong-package','wrong-class','not-focusable','disabled','hidden','other-card','outside','footer','handicap','wrong-value','wrong-scene','duplicate-card'):
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as td:
    root,owner,card,field=ownership_fixture()
    if fault=='missing':owner.remove(field)
    if fault=='duplicate':owner.append(ET.fromstring(ET.tostring(field)))
    if fault=='different-parent':owner.remove(field);root.append(field)
    if fault=='wrong-package':field.set('package','test.other')
    if fault=='wrong-class':field.set('class','android.widget.TextView')
    if fault=='not-focusable':field.set('focusable','false')
    if fault=='disabled':field.set('enabled','false')
    if fault=='hidden':field.set('visible-to-user','false')
    if fault=='other-card':
     competitor=ET.fromstring(ET.tostring(card));competitor.set('resource-id','contest-player-1');owner.append(competitor)
    if fault=='outside':field.set('bounds','[10,140][500,190]')
    if fault=='footer':c.one(root,'contest-footer').set('bounds','[0,160][600,800]')
    if fault=='handicap':field.set('resource-id','player-handicap-canary')
    if fault=='wrong-value':field.set('text','Not Golfer')
    if fault=='wrong-scene':root.append(node(**{'resource-id':'contest-step-gamemodes'}))
    if fault=='duplicate-card':owner.append(ET.fromstring(ET.tostring(card)))
    d=self.driver(td)
    with patch.object(d,'read',return_value=root),patch.object(d,'adb') as adb:
     with self.assertRaises(ValueError):d.prepare_host()
     adb.assert_not_called()
 def test_flattened_guest_requires_fresh_focused_ownership_before_typing(self):
  for fault in (None,'unfocused','not-empty','changed-bounds','wrong-card'):
   with self.subTest(fault=fault),tempfile.TemporaryDirectory() as td:
    raw,_,_,_=ownership_fixture(1,'Player 2 name')
    focused,owner,card,field=ownership_fixture(1,'Player 2 name')
    field.set('focused','true')
    if fault=='unfocused':field.set('focused','false')
    if fault=='not-empty':field.set('text','already present');field.set('hint','Player 2 name')
    if fault=='changed-bounds':field.set('bounds','[110,140][500,190]')
    if fault=='wrong-card':card.set('resource-id','contest-player-2')
    after,_,_,_=ownership_fixture(1,'QAGuest')
    d=self.driver(td)
    with patch.object(d,'read',side_effect=[raw,focused,after]),patch.object(d,'adb',return_value='mInputShown=true') as adb,patch.object(c.time,'sleep'):
     if fault:
      with self.assertRaises(ValueError):d.fill('Player 2 name','QAGuest')
      self.assertFalse(any(call.args[:3]==('shell','input','text') for call in adb.call_args_list))
     else:
      d.fill('Player 2 name','QAGuest')
      self.assertIn(('shell','input','text','QAGuest'),[call.args for call in adb.call_args_list])

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
 def test_no_hint_golfer_preserved_with_handicap_and_duplicate_rejected(self):
  r=host('Golfer');card=c.one(r,'contest-player-0')
  card[0].attrib.pop('hint')
  card.append(node(**{'class':'android.widget.EditText','resource-id':'player-handicap-Golfer',
                    'content-desc':'Handicap for Golfer','text':'0'}))
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',return_value=r),patch.object(d,'adb') as adb:d.prepare_host()
   adb.assert_not_called();self.assertEqual(d.hostName,'Golfer')
   self.assertFalse(d.observations[0]['editRoles'][1]['nameRole'])
   self.assertNotIn('Handicap for Golfer',repr(d.observations))
  card.append(ET.fromstring(ET.tostring(card[0])))
  with self.assertRaises(ValueError):c.host_input(r)
 def test_player_2_search_scopes_to_card_before_any_edit(self):
  r=fixture('setup-initial');card=node(**{'resource-id':'contest-player-1'})
  target=node(**{'class':'android.widget.EditText','hint':'Player 2 name','text':''})
  card.append(target);r.append(card)
  r.append(ET.fromstring(ET.tostring(target)))  # unrelated identical name label
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',return_value=r):self.assertIs(d.seek('Player 2 name','input')[1],target)
   card.append(ET.fromstring(ET.tostring(target)))
   with patch.object(d,'read',return_value=r),patch.object(d,'adb') as adb:
    with self.assertRaises(ValueError):d.fill('Player 2 name','QAGuest')
   adb.assert_not_called()
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
 def test_host_nonempty_is_untouched_and_not_logged(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',return_value=host('Synthetic Name')),patch.object(d,'adb') as adb:d.prepare_host()
   adb.assert_not_called();self.assertEqual(d.hostName,'Synthetic Name')
   self.assertNotIn('Synthetic Name',str(d.observations))
 def test_proven_empty_host_only_is_filled(self):
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',side_effect=[host(),host(),host('QAHost')]),patch.object(d,'adb',return_value='mInputShown=true') as adb:d.prepare_host()
   self.assertIn(('shell','input','text','QAHost'),[x.args for x in adb.call_args_list])
 def test_duplicate_missing_changed_host_prevents_text(self):
  for r in (host(count=0),host(count=2)):
   with tempfile.TemporaryDirectory() as td:
    d=self.driver(td)
    with patch.object(d,'read',return_value=r),patch.object(d,'adb') as adb:
     with self.assertRaises(ValueError):d.prepare_host()
    adb.assert_not_called()
  with tempfile.TemporaryDirectory() as td:
   d=self.driver(td)
   with patch.object(d,'read',side_effect=[host(),host('changed')]),patch.object(d,'adb') as adb:
    with self.assertRaises(ValueError):d.prepare_host()
   self.assertFalse(any(x.args[:3]==('shell','input','text') for x in adb.call_args_list))
 def test_initial_wizard_precedes_names_and_survives_host_failure(self):
  d=MagicMock();d.report=[];d.prepare_host.side_effect=ValueError('CONTROL_MISSING_OR_AMBIGUOUS')
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
