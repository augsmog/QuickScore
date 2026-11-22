import unittest,pathlib,yaml,hashlib
from paywall import OPEN,CLOSE,REOPEN,VISIBLE,scene,HEADER
from run import screen,SHA,TREE
from intake import sanitize
class PaywallControls(unittest.TestCase):
 def tree(self,ids=(),texts=()):return {'children':[{'attributes':{'resource-id':v}} for v in ids]+[{'attributes':{'text':v}} for v in texts]}
 def test_actual_header_and_overlay_required(self):
  self.assertTrue(scene(self.tree(['paywall-close'],[HEADER])))
  for ids,texts in [([],[]),(['paywall-close'],[]),([],[HEADER]),(['paywall-close','home-new-contest'],[HEADER]),(['paywall-close','contest-start'],[HEADER]),(['paywall-close','contest-step-setup'],[HEADER]),(['paywall-close','contest-step-round-settings'],[HEADER])]:
   with self.assertRaises(ValueError):screen(self.tree(ids,texts),'paywall')
 def test_normal_route_no_links_purchase_restore_or_capture_actions(self):
  for text in [OPEN,CLOSE,REOPEN,VISIBLE]:
   for command in yaml.safe_load(text):
    if isinstance(command,str):self.assertEqual(command,'hideKeyboard');continue
    self.assertEqual(len(command),1);self.assertIn(next(iter(command)),{'assertVisible','assertNotVisible','tapOn','eraseText','inputText','scrollUntilVisible','extendedWaitUntil'})
    if 'tapOn' in command:self.assertNotRegex(str(command['tapOn']),r'(?i)buy|subscribe|restore|terms|privacy|unavailable|://')
  self.assertIn('home-new-contest',OPEN);self.assertIn('rounds-2',OPEN);self.assertIn('contest-start',OPEN)
  self.assertEqual(CLOSE.count('- tapOn: {id: new-contest-back}'),2)
  self.assertIn("'QA Host'",CLOSE);self.assertIn("'QA Guest'",CLOSE)
 def test_no_source_mutation_before_paywall(self):
  r=pathlib.Path(__file__).resolve().parents[2];s=(r/'scoresnap/app/contest/new.tsx').read_text()
  self.assertLess(s.index('router.push("/paywall?tier=td")'),s.index('addContest(contest)'))
  self.assertIn('selectedCourse || defaultCourse(courseName || "My Course")',s)
 def test_supplement_runs_after_proven_checkpoints_and_before_restore(self):
  s=(pathlib.Path(__file__).parent/'run.py').read_text()
  self.assertLess(s.index("lambda:flow(ADD_ACTIVATE"),s.index('from paywall import OPEN'))
  self.assertLess(s.index("shot('paywall'"),s.index("lambda:flow(CLOSE"))
  self.assertLess(s.index("lambda:flow(CLOSE"),s.index("finally:progress.perform('restore'"))
 def test_receipt_remains_fallback_unobserved_runtime_and_gate_red(self):
  png=b'\x89PNG\r\n\x1a\n';r=dict(sourceSha=SHA,sourceTree=TREE,buildSha256='a'*64,categoryBefore='extra-extra-large',categoryAfter='extra-extra-large',runtimeRNScale=None,scene='paywall',offline=True,processMode='post-cold',coldProcessVerified=False,nativeAcceptance=False,geometryPassed=False,pngSha256=hashlib.sha256(png).hexdigest())
  clean=sanitize(r,png);self.assertFalse(clean['aggregatePass']);self.assertEqual(clean['purchaseRestore'],'unrun');self.assertIn('fallback-only',clean['catalogEvidence'])
  for change in [dict(categoryAfter='large'),dict(runtimeRNScale=1.235),dict(nativeAcceptance=True),dict(sourceSha='a690'),dict(offline=False)]:
   with self.assertRaises(ValueError):sanitize({**r,**change},png)
