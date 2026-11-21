import unittest,json
from smoke import activity_scale,ActivityReadbackError
class ActivityControls(unittest.TestCase):
 focus='mCurrentFocus=Window{abc u0 test.app/.Main}'
 def block(self,value='1.3',component='test.app/.Main',state='true',field='mCurrentConfig'):
  return f'ACTIVITY {component} token pid=1\n mResumed={state} mStopped=false mFinished=false\n {field}={{{value} test}}\n'
 def test_exact_and_reverse_unrelated_order(self):
  own=self.block();foreign=self.block('1.0','other.app/.Main')
  for config in [own,foreign+own,own+foreign]:self.assertEqual(activity_scale(config,self.focus,'test.app'),1.3)
 def test_missing_duplicate_stale_legacy_foreign_fields(self):
  own=self.block()
  for config in ['',own+own,self.block(state='false'),self.block(field='mConfiguration'),self.block(component='other.app/.Main'),own+' mCurrentConfig={1.3 extra}\n',own.replace('1.3','NaN')]:
   with self.assertRaises(ActivityReadbackError):activity_scale(config,self.focus,'test.app')
 def test_focus_wrong_duplicate_and_component_mismatch(self):
  for focus in ['',self.focus*2,self.focus.replace('test.app','other.app'),self.focus.replace('.Main','.Other')]:
   with self.assertRaises(ActivityReadbackError):activity_scale(self.block(),focus,'test.app')
 def test_diagnostics_are_bounded_and_contain_no_raw_text(self):
  try:activity_scale(self.block(field='mConfiguration')+' private-person secret /path',self.focus,'test.app')
  except ActivityReadbackError as e:
   self.assertEqual(set(e.diagnostic),{'reason','activityBlocks','targetBlocks','currentConfigFields'})
   for forbidden in ['secret','private','test.app','/path','pid']:self.assertNotIn(forbidden,str(e))
  with self.assertRaises(ActivityReadbackError):activity_scale('x'*2000001,self.focus,'test.app')
 def test_fully_qualified_foreground_matches_short_component(self):
  self.assertEqual(activity_scale(self.block(),self.focus.replace('/.Main','/test.app.Main'),'test.app'),1.3)
 def test_activity_recreation_changes_identity(self):
  a=activity_scale(self.block(),self.focus,'test.app',identity=True)
  b=activity_scale(self.block().replace('pid=1','pid=2'),self.focus,'test.app',identity=True)
  self.assertNotEqual(a,b);self.assertRegex(a,'^[a-f0-9]{64}$')
