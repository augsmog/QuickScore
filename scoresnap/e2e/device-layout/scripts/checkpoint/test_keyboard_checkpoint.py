import unittest,tempfile,pathlib,xml.etree.ElementTree as ET,json,struct,zlib
from unittest.mock import patch,MagicMock
import flow_adapter as a
from test_android_insets import fixtures
from android_insets import observe
from test_android_capture import chunk

def xml():
 r=ET.Element('hierarchy')
 def node(rid,box,**more):
  n=ET.SubElement(r,'node',{'package':a.boundary.PACKAGE,'resource-id':rid,'bounds':box,'enabled':'true','visible-to-user':'true',**more});return n
 node('contest-step-setup','[0,0][1080,2400]');node('contest-scroll','[0,100][1080,2100]',scrollable='true')
 node('contest-footer','[0,2200][1080,2400]');node('new-contest-back','[0,0][100,100]')
 node('contest-player-1','[200,300][1000,800]')
 node('','[250,400][700,550]',**{'class':'android.widget.EditText','text':'QAGuest','focusable':'true','focused':'true'})
 node('player-handicap-QAGuest','[800,600][950,700]',**{'class':'android.widget.EditText','text':'0','focusable':'true','focused':'false'})
 return r
def observation():
 inset=observe(*fixtures(True),[1080,2400],480)
 return {'insets':inset,'pixelSize':[1080,2400],'safeArea':inset['safeArea']}
class Tests(unittest.TestCase):
 def test_real_selector_and_visible_ime_proof(self):
  p=a.keyboard_proof(ET.tostring(xml()),observation(),1,'QAGuest',(250,700),'')
  self.assertEqual(p['fieldFramePx'],[250,400,700,550]);self.assertEqual(p['keyboardFramePx'],[0,1500,1080,2400]);self.assertNotIn('QAGuest',json.dumps(p))
 def test_false_focus_wrong_value_missing_ime_and_occlusion(self):
  for case in range(7):
   r=xml();o=observation()
   if case==0:r[5].set('focused','false')
   if case==1:r[6].set('focused','true')
   if case==2:r[5].set('text','Wrong')
   if case==3:o['insets']['keyboard']['visible']=False
   if case==4:o.pop('insets')
   if case==5:o['insets']['keyboard']['framePx']=[0,500,1080,2400]
   if case==6:r.append(ET.fromstring(ET.tostring(r[5])))
   with self.subTest(case=case),self.assertRaises(ValueError):a.keyboard_proof(ET.tostring(r),o,1,'QAGuest',(250,700),'')
 def test_actual_capture_retains_keyboard_evidence_without_dismiss(self):
  d=object.__new__(a.BoundDriver);d.report=[]
  binding={'source_sha':'a'*40,'source_tree':'b'*40,'apk_sha256':'c'*64,'pixel_size':[1080,2400]}
  device=MagicMock();device.identity.return_value='d'*64;device.installed.return_value='c'*64;device.observation=observation();device.hierarchy.return_value=ET.tostring(xml())
  device.screenshot.return_value=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1080,2400,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0'*(2400*(1+1080*3))))+chunk(b'IEND',b'')
  d.device=device;d.c={'binding':binding}
  with tempfile.TemporaryDirectory() as t,patch.object(d,'check_identity'):
   d.out=pathlib.Path(t);d.capture_name_keyboard(1,'QAGuest',(250,700),'')
   receipt=json.loads((d.out/'name-keyboard/receipt.json').read_text());self.assertTrue(receipt['osBefore']['insets']['keyboard']['visible']);self.assertEqual(receipt['checkpointEvidence']['focusedNameCount'],1)
   device.run.assert_not_called()
 def test_fill_capture_precedes_back_then_dismiss_verification(self):
  d=object.__new__(a.BoundDriver);d.c={'package':a.boundary.PACKAGE};d.observations=[];d.report=[]
  r=xml();field=r[5];events=[]
  def pair(root,index,value,package,counts,**kw):counts['focusedAppEdit']=1;return field
  def adb(*args):
   if args[:3]==('shell','input','keyevent'):events.append('back')
   return 'mInputShown=true'
  with patch.object(d,'seek',return_value=(r,r[4])),patch.object(d,'player_field_reveal',return_value=field),patch.object(d,'read',return_value=r),patch.object(d,'adb',side_effect=adb),patch.object(a.flow,'player_pair',side_effect=pair),patch.object(a.flow.time,'sleep'),patch.object(d,'capture_name_keyboard',side_effect=lambda *x:events.append('capture')),patch.object(d,'verify_keyboard_dismissed',side_effect=lambda *x:events.append('dismiss-verified')):
   d.fill('Player 2 name','QAGuest',capture_keyboard=True)
  self.assertEqual(events,['capture','back','dismiss-verified'])
 def test_continue_requires_verified_dismissal(self):
  d=object.__new__(a.BoundDriver);d.report=[]
  with self.assertRaises(a.flow.CaptureBoundaryFailure):d.advance_footer('setup')
  d.keyboardDismissed=True;d.device=MagicMock();d.device.observation={'insets':{'keyboard':{'visible':False}}}
  with patch.object(d,'check_identity'),patch.object(a.flow.Driver,'advance_footer') as actual:d.advance_footer('setup');actual.assert_called_once_with('setup')
  self.assertEqual(d.report[-1]['checkpoint'],'setup-continue-destination')
