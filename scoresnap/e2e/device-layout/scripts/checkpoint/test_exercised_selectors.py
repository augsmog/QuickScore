import pathlib,unittest,xml.etree.ElementTree as ET,json,tempfile,hashlib
from unittest.mock import patch
import exercised_flow as c
def node(**a):
 return ET.Element('node',{'package':'test.app','bounds':'[10,10][100,50]','visible-to-user':'true','enabled':'true',**a})
def fixture(name):
 r=ET.Element('hierarchy')
 for key in c.SCENES[name]:r.append(node(**{'resource-id':key}))
 for label in c.TEXTS.get(name,()):
  attrs={'class':'android.widget.Button','clickable':'true'} if label==c.FIND else {}
  r.append(node(text=label,enabled='false' if label=='Currently unavailable' else 'true',**attrs))
 if name in ('entry','entry-invalid'):
  for label,typed in [('Join code','AAAAAA'),('Display name','QAGuest')]:
   r.append(node(**{'class':'android.widget.EditText','hint':label,'text':typed if name=='entry-invalid' else ''}))
 return r
class Controls(unittest.TestCase):
 def test_all_exact_scene_positive_fixtures(self):
  for name in c.SCENES:
   with self.subTest(name=name):self.assertTrue(c.validate(fixture(name),name))
 def test_every_required_marker_missing_or_duplicate_rejected(self):
  for name in c.SCENES:
   good=fixture(name)
   for i in range(len(good)):
    for duplicate in (False,True):
     r=fixture(name)
     if duplicate:r.append(ET.fromstring(ET.tostring(r[i])))
     else:r.remove(r[i])
     with self.subTest(name=name,index=i,duplicate=duplicate),self.assertRaises(ValueError):c.validate(r,name)
 def test_wrong_scene_and_reverse_step(self):
  for name in c.SCENES:
   r=fixture(name);r.append(node(**{'resource-id':'home-new-contest'}))
   with self.assertRaises(ValueError):c.validate(r,name)
  with self.assertRaises(ValueError):c.validate(fixture('games'),'round-settings')
  with self.assertRaises(ValueError):c.validate(fixture('round-settings'),'games')
 def test_foreign_and_hidden(self):
  r=fixture('entry');r.append(node(package='com.android.permissioncontroller'))
  with self.assertRaises(ValueError):c.tree(ET.tostring(r).decode(),'test.app')
  r=fixture('rounds');r[0].set('visible-to-user','false')
  with self.assertRaises(ValueError):c.validate(r,'rounds')
 def test_disabled_copy_is_not_disabled_proof(self):
  r=fixture('paywall-disabled');r[0].set('enabled','true')
  with self.assertRaises(ValueError):c.validate(r,'paywall-disabled')
  r[0].attrib.pop('enabled')
  with self.assertRaises(ValueError):c.validate(r,'paywall-disabled')
 def test_annual_price_mismatch(self):
  r=fixture('paywall-annual');r[-1].set('text','$7.99/month')
  with self.assertRaises(ValueError):c.validate(r,'paywall-annual')
 def test_input_scoping_rejects_label_and_duplicate(self):
  r=ET.Element('hierarchy');r.append(node(text='Join code'))
  with self.assertRaises(ValueError):c.one(r,'Join code','input')
  r.append(node(**{'class':'android.widget.EditText','content-desc':'Join code'}))
  self.assertEqual(c.one(r,'Join code','input').get('class'),'android.widget.EditText')
  r.append(node(**{'class':'android.widget.EditText','content-desc':'Join code'}))
  with self.assertRaises(ValueError):c.one(r,'Join code','input')
