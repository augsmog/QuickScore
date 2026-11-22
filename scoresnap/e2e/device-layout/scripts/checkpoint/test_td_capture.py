import unittest,xml.etree.ElementTree as ET,tempfile,pathlib,json,copy
from unittest.mock import patch,MagicMock
import td_capture as t
import test_paywall_evidence as fixture

def hierarchy():
 root=ET.Element('hierarchy');scroll=ET.SubElement(root,'node',{'package':t.b.PACKAGE,'class':'android.widget.ScrollView','scrollable':'true','bounds':'[0,120][1080,2300]'})
 def bounds(b):return '[%d,%d][%d,%d]'%tuple(b)
 owners={}
 for item in fixture.witnesses('top','free','td','disabled'):
  parent=scroll
  if item['owner'].endswith('radio') or item['owner']=='td-radio-selected':
   if item['owner'] not in owners:owners[item['owner']]=ET.SubElement(scroll,'node',{'package':t.b.PACKAGE,'class':'android.widget.RadioButton','checkable':'true','checked':str(item['ownerSelected']).lower(),'bounds':bounds(item['ownerBounds'])})
   parent=owners[item['owner']]
  ET.SubElement(parent,'node',{'package':t.b.PACKAGE,'class':'android.widget.Button' if item['role']=='button' else 'android.widget.TextView','text':item['label'],'enabled':str(item['enabled'] is not False).lower(),'bounds':bounds(item['bounds'])})
 return root
class Tests(unittest.TestCase):
 def test_actual_projection_full_literals_role_ownership_never_pixel_pass(self):
  for section in t.v.SECTIONS:
   p=t.project(ET.tostring(hierarchy()),section);self.assertFalse(p['paintedTextProven']);self.assertEqual(len(p['witnesses']),9)
 def test_truncated_merged_label_wrong_role_owner_or_enabled_reject(self):
  for label,key,val in [('$79.99/year','text','$79.99/'),('Free','text','Free Current plan'),('Close','class','android.widget.TextView'),('Currently unavailable','enabled','true')]:
   root=hierarchy();n=next(n for n in root.iter('node') if n.get('text')==label);n.set(key,val)
   with self.subTest(label=label),self.assertRaises(t.v.Blocked):t.project(ET.tostring(root),'td' if label.startswith('$') else 'free' if label=='Free' else 'top' if label=='Close' else 'disabled')
  root=hierarchy();n=next(n for n in root.iter('node') if n.get('class')=='android.widget.RadioButton' and n.get('checked')=='true');n.set('checked','false')
  with self.assertRaises(t.v.Blocked):t.project(ET.tostring(root),'td')
 def test_real_assembler_and_unchanged_validator_return_review_only(self):
  c=fixture.Contract();c.setUp();expected={**c.expect,'integrationHead':fixture.BINDING['sourceSha']}
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp)
   for lane,folder in zip(c.packet['lanes'],['scale-1.0-continuation','scale-1.3-continuation']):
    p=root/folder;p.mkdir();(p/'td-route.json').write_text(json.dumps(lane['route']))
    names=['paywall-top','paywall-annual'] if len(lane['frames'])==2 else ['paywall-top','paywall-free','paywall-disabled']
    for frame,name in zip(lane['frames'],names):
     out=p/name;out.mkdir();(out/'capture.png').write_bytes(c.files[frame['path']]);obs=frame['before']
     o={'osScale':float(lane['observedScale']),'activityIdentitySha256':obs['activityIdentitySha256'],'pixelSize':obs['physicalSizePx'],'densityDpi':480}
     r={'source_sha':expected['sourceSha'],'source_tree':expected['sourceTree'],'apk_sha256':expected['apkSha256'],'job':{'GITHUB_RUN_ID':expected['runId'],'GITHUB_RUN_ATTEMPT':expected['runAttempt']},'screenshot_sha256':frame['pngSha256'],'bootIdentitySha256':lane['route']['deviceSession'],'osBefore':o,'osAfter':o,'checkpointEvidence':{'modalBounds':obs['modalBounds'],'witnesses':obs['witnesses']},'captureTimes':{'beforeNs':obs['observedNs'],'afterNs':frame['after']['observedNs'],'screenshotStartNs':frame['screenshotStartNs'],'screenshotEndNs':frame['screenshotEndNs']}}
     (out/'receipt.json').write_text(json.dumps(r))
   packet,result=t.assemble(root,expected);self.assertEqual(result['status'],'PAINTED_TEXT_REVIEW_REQUIRED');self.assertFalse(result['paintedTextProven']);self.assertFalse(result['nativeAcceptance'])
   stale={**expected,'apkSha256':'9'*64}
   with self.assertRaises(t.v.Blocked):t.assemble(root,stale)
 def test_protected_modal_forbids_purchase_restore_and_plan_selection(self):
  import flow_adapter as a
  d=object.__new__(a.BoundDriver);d.td_modal=True
  for key in ['Restore Purchases','Currently unavailable','Tournament Director','Free']:
   with self.assertRaises(a.flow.CaptureBoundaryFailure):d.tap(key,'text')

 def test_close_requires_real_destination_and_retention_does_not_tap(self):
  import flow_adapter as a
  d=object.__new__(a.BoundDriver);d.td_modal=True;d.report=[];d.check_identity=MagicMock();d.read=MagicMock(return_value='unproven')
  with patch.object(a.flow.Driver,'tap'),patch.object(a.flow,'validate',side_effect=a.flow.CaptureBoundaryFailure('WRONG_SCENE')):
   with self.assertRaises(a.flow.CaptureBoundaryFailure):d.tap('paywall-close')
  self.assertTrue(d.td_modal);self.assertEqual(d.report,[])
  with patch.object(a.flow.Driver,'tap'),patch.object(a.flow,'validate'):
   d.tap('paywall-close')
  self.assertFalse(d.td_modal)
  with tempfile.TemporaryDirectory() as tmp:
   d.out=pathlib.Path(tmp);d.hostName='Golfer'
   with patch.object(a.wizard_states,'assign_capture') as rows,patch.object(a.wizard_states,'stress_top') as top:
    d.verify_td_retention();self.assertEqual(rows.call_count,8)
    self.assertTrue(all(c.kwargs['tap'] is False for c in rows.call_args_list));top.assert_called_once_with(d,prefix='retained')
   self.assertFalse(json.loads((d.out/'td-close.json').read_text())['nativeAcceptance'])

 def test_optional_section_cannot_swallow_capture_identity_failure(self):
  d=MagicMock();d.device.observation={'osScale':9};d.td_route={'activityIdentitySha256':'x'}
  def capture(*args,**kwargs):kwargs['evidence_observer'](b'<hierarchy/>',d.device.observation)
  with patch.object(t.b,'capture',side_effect=capture):
   with self.assertRaises(t.f.CaptureBoundaryFailure):t.shot(d,'paywall-annual')
  d.report.append.assert_not_called()
