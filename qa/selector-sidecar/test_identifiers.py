"""Static exact-byte controls; not native accessibility or layout proof."""
import pathlib,subprocess,unittest,re
ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE='7188c644a7f0211a6c395d2997e978bb791ffa87'
PAYWALL='2c7c58fc7f7427d1d7b10ff18734dffa50a7f765'
REVIEWED_TESTS=('scoresnap/tests/no-pro-surfaces.test.cjs','scoresnap/tests/paywall-android-font-readiness.test.cjs','scoresnap/tests/paywall-clubhouse-ledger.test.cjs')
ADDITIONS={
 'scoresnap/app/contest/new.tsx':['        testID="contest-scroll"\n','                testID={`contest-player-${idx}`}\n','        testID="contest-footer"\n'],
 'scoresnap/app/paywall.tsx':[' testID="paywall-close"']}
def original(p):return subprocess.check_output(['git','-C',str(ROOT),'show',(PAYWALL if p=='scoresnap/app/paywall.tsx' else BASE)+':'+p]).decode()
def invariant(p,text):
 for addition in ADDITIONS[p]:
  if text.count(addition)!=1:raise ValueError('missing/duplicate hook')
  text=text.replace(addition,'',1)
 if text!=original(p):raise ValueError('non-identifier source change')
class Checks(unittest.TestCase):
 def test_exact_copy_style_callback_ids_unchanged(self):
  for p in ADDITIONS:invariant(p,(ROOT/p).read_text())
 def test_each_missing_duplicate_rejected(self):
  for p,adds in ADDITIONS.items():
   text=(ROOT/p).read_text()
   for a in adds:
    for bad in (text.replace(a,''),text.replace(a,a+a)):
     with self.assertRaises(ValueError):invariant(p,bad)
 def test_copy_style_handler_mutations_rejected(self):
  p='scoresnap/app/paywall.tsx';s=(ROOT/p).read_text()
  for before,after in [('Close','Dismiss'),('router.back()','router.push("/")'),('style={s.closeButton}','style={{padding:0}}')]:
   self.assertIn(before,s)
   with self.assertRaises(ValueError):invariant(p,s.replace(before,after,1))
 def test_materialized_roles_and_rounds_block(self):
  s=(ROOT/'scoresnap/app/contest/new.tsx').read_text()
  self.assertIn('<ScrollView\n        testID="contest-scroll"',s)
  self.assertRegex(s,r'testID=\{`contest-player-\$\{idx\}`\}[\s\S]{0,230}borderWidth: 1')
  self.assertRegex(s,r'testID="contest-footer"[\s\S]{0,200}backgroundColor: COLORS.bg')
  self.assertNotIn('testID="contest-rounds"',s)
 def test_flag_and_workflow_paths_not_changed(self):
  paths=subprocess.check_output(['git','-C',str(ROOT),'diff',BASE,'--name-only']).decode().splitlines()
  self.assertTrue(all(p in ADDITIONS or p in REVIEWED_TESTS or p.startswith(('qa/selector-sidecar/','scoresnap/e2e/device-layout/')) for p in paths))
 def test_reviewed_paywall_tests_exact(self):
  for p in REVIEWED_TESTS:
   expected=subprocess.check_output(['git','-C',str(ROOT),'show',PAYWALL+':'+p])
   self.assertEqual((ROOT/p).read_bytes(),expected)
if __name__=='__main__':unittest.main()
