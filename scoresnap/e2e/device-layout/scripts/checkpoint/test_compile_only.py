import unittest,tempfile,pathlib
from unittest.mock import patch
import compile_only as c
class Tests(unittest.TestCase):
 def test_route_before_any_build(self):
  for env in ({},{'GITHUB_EVENT_NAME':'push','GITHUB_REF':c.REF},{'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main'}):
   with patch.object(c.gate,'build') as build,self.assertRaises(c.gate.b.Failure):c.run('.',env)
   build.assert_not_called()
 def test_exact_parent_scope(self):
  env={'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':c.REF}
  for values in [[c.PARENT,c.TREE,'\n'.join(c.PATHS)],['wrong',c.TREE,'\n'.join(c.PATHS)],[c.PARENT,c.TREE,'app.tsx']]:
   with patch.object(c.gate,'ingress',return_value={}),patch.object(c.gate,'read',side_effect=values):
    if values[0]==c.PARENT and values[-1]=='\n'.join(c.PATHS):self.assertEqual(c.preflight('.',env),{})
    else:
     with self.assertRaises(c.gate.b.Failure):c.preflight('.',env)
 def test_mock_build_receipt_cleanup_no_acceptance(self):
  with tempfile.TemporaryDirectory() as tmp:
   identity={'checkoutSha':'a'*40,'checkoutTree':'b'*40};created=[]
   def build(repo,src,private,source):
    self.assertEqual(source,{'checkoutSha':c.PARENT,'checkoutTree':c.TREE});apk=private/'synthetic.apk';apk.write_bytes(b'synthetic-control-only');created.append(apk)
    return apk,{'source_sha':c.PARENT,'source_tree':c.TREE,'apk_sha256':c.gate.b.digest(apk.read_bytes())},{'offlineNetwork':{'internetPermissionPresent':False,'scope':'offline-supplemental-only','releaseParity':False,'generatedOverlaySha256':'c'*64},'recipeSha256':'d'*64,'lockSha256':'e'*64}
   with patch.object(c,'preflight',return_value=identity),patch.object(c.gate,'build',side_effect=build):r=c.run('.',{'RUNNER_TEMP':tmp})
   self.assertEqual(r['status'],'COMPILED_OFFLINE_FIXTURE');self.assertFalse(r['releaseAcceptance']);self.assertFalse(r['installed']);self.assertFalse(created[0].exists())
 def test_missing_network_proof_rejects_and_cleans(self):
  with tempfile.TemporaryDirectory() as tmp:
   created=[]
   def build(repo,src,private,source):
    p=private/'synthetic.apk';p.write_bytes(b'x');created.append(p)
    return p,{'source_sha':c.PARENT,'source_tree':c.TREE,'apk_sha256':c.gate.b.digest(b'x')},{'offlineNetwork':{'internetPermissionPresent':True}}
   with patch.object(c,'preflight',return_value={}),patch.object(c.gate,'build',side_effect=build),self.assertRaises(c.gate.b.Failure):c.run('.',{'RUNNER_TEMP':tmp})
   self.assertFalse(created[0].exists())
if __name__=='__main__':unittest.main()
