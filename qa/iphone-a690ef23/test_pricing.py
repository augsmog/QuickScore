import unittest,yaml,pathlib,hashlib
from pricing import SECTIONS,section_scene,reveal,visible,RETURN_TOP,optional_sections,SectionUnavailable
from run import SHA,TREE,screen
from intake import sanitize
class PricingControls(unittest.TestCase):
 def tree(self,labels,enabled=None):
  attrs={} if enabled is None else {'enabled':enabled}
  return {'children':[{'attributes':{'text':x,**attrs}} for x in labels]}
 def test_sections_without_visible_header_or_close(self):
  for section,labels in SECTIONS.items():self.assertIsInstance(screen(self.tree(labels,False),section),list)
 def test_exact_labels_price_and_foreign_scene(self):
  for section,labels in SECTIONS.items():
   for bad in [self.tree(labels[:-1],False),self.tree([v+' extra' for v in labels],False),self.tree([v.replace('79.99','12.99') for v in labels],False) if section=='paywall-td' else self.tree([],False)]:
    with self.assertRaises(ValueError):screen(bad,section)
   bad=self.tree(labels,False);bad['children'].append({'attributes':{'resource-id':'home-new-contest'}})
   with self.assertRaises(ValueError):screen(bad,section)
 def test_disabled_requires_observed_state_not_copy_alone(self):
  for enabled in [None,True,'true',0]:
   with self.assertRaises(ValueError):section_scene(self.tree(SECTIONS['paywall-disabled'],enabled),'paywall-disabled')
  root_only=self.tree(SECTIONS['paywall-disabled']);root_only['attributes']={'enabled':False}
  with self.assertRaises(ValueError):section_scene(root_only,'paywall-disabled')
  for enabled in [False,'false']:self.assertEqual(section_scene(self.tree(SECTIONS['paywall-disabled'],enabled),'paywall-disabled'),[])
 def test_scroll_and_assert_only_no_taps_or_provider(self):
  for flow in [RETURN_TOP]+[reveal(s) for s in SECTIONS]+[visible(s) for s in SECTIONS]:
   for command in yaml.safe_load(flow):self.assertIn(next(iter(command)),['scrollUntilVisible','assertVisible','assertNotVisible'])
  self.assertIn(r'^\$79\.99/year$',visible('paywall-td'))
  self.assertIn('direction: UP',RETURN_TOP)
 def test_optional_failure_is_recorded_and_other_sections_still_attempted(self):
  calls=[]
  def capture(section):
   calls.append(section)
   if section=='paywall-free':raise SectionUnavailable('reveal')
  rows=optional_sections(capture)
  self.assertEqual(calls,list(SECTIONS));self.assertEqual(rows[0]['status'],'unavailable');self.assertEqual(rows[1]['status'],'captured');self.assertNotIn('private',str(rows))
 def test_recovery_precedes_close_and_keeps_top_checkpoint(self):
  s=(pathlib.Path(__file__).parent/'run.py').read_text()
  self.assertLess(s.index("shot('paywall','paywall-'"),s.index('sections=optional_sections'))
  self.assertLess(s.index("flow(RETURN_TOP,'paywall-return-top-'"),s.index("names_observed=run_close"))
 def test_receipts_distinguish_price_disabled_and_top_no_runtime_claim(self):
  b=b'\x89PNG\r\n\x1a\n'
  for scene in ['paywall',*SECTIONS]:
   r=dict(sourceSha=SHA,sourceTree=TREE,buildSha256='a'*64,scene=scene,offline=True,categoryBefore='large',categoryAfter='large',runtimeRNScale=None,processMode='post-cold',coldProcessVerified=False,nativeAcceptance=False,geometryPassed=False,pngSha256=hashlib.sha256(b).hexdigest())
   clean=sanitize(r,b);self.assertIs(clean['annualTDFallbackPriceObserved'],scene=='paywall-td');self.assertIs(clean['disabledPurchasingObserved'],scene=='paywall-disabled');self.assertFalse(clean['aggregatePass'])
