import unittest,tempfile,pathlib
from run import validate_source,category_readback,screen,apphash,SHA,TREE
class Controls(unittest.TestCase):
 def test_source(self):
  validate_source(SHA,TREE,'')
  for a in [('580b437',TREE,''),(SHA,'wrong',''),(SHA,TREE,'dirty')]:
   with self.assertRaises(ValueError):validate_source(*a)
 def test_actual_category_only(self):
  for c in ['large','extra-extra-large','extra-extra-extra-large']:self.assertEqual(category_readback(c+'\n',c),c)
  for raw in ['1.0','1.235','1.300','1.353','requested-large','', 'large\nextra-extra-large']:
   with self.assertRaises(ValueError):category_readback(raw)
  with self.assertRaises(ValueError):category_readback('large','extra-extra-large')
 def tree(self,ids):return {'children':[{'attributes':{'resource-id':i}} for i in ids]}
 def test_home(self):self.assertIn('home-new-contest',screen(self.tree(['home-new-contest']),'home'))
 def test_four_player(self):self.assertTrue(screen(self.tree(['new-contest-back','contest-continue','contest-player-3']),'setup'))
 def test_wrong_scene(self):
  for ids in [['home-new-contest'],['new-contest-back','contest-continue'],['new-contest-back','contest-continue','contest-player-3','home-new-contest']]:
   with self.assertRaises(ValueError):screen(self.tree(ids),'setup')
 def test_paywall_identity(self):
  with self.assertRaises(ValueError):screen(self.tree(['home-new-contest']),'paywall')
 def test_binary_digest(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):apphash(pathlib.Path(d))
   p=pathlib.Path(d)/'binary';p.write_bytes(b'synthetic');a=apphash(pathlib.Path(d));self.assertEqual(a,apphash(pathlib.Path(d)));p.write_bytes(b'changed');self.assertNotEqual(a,apphash(pathlib.Path(d)))
 def test_no_runtime_scale_claim(self):
  s=(pathlib.Path(__file__).parent/'run.py').read_text();self.assertIn("'runtimeRNScale':None",s);self.assertIn("'nativeAcceptance':False",s);self.assertIn('return 78',s)
