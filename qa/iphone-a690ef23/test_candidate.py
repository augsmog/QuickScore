import unittest,json,pathlib,hashlib,yaml
from run import cold_restart,launch_pid,ADD_VISIBLE,ADD_ACTIVATE,screen,SHA,TREE
from intake import sanitize
class CandidateControls(unittest.TestCase):
 def fake(self,category='extra-extra-large',pid=22,fail=None):
  calls=[]
  def sim(*args,**kwargs):
   calls.append(args)
   if args[0]==fail:raise RuntimeError('synthetic stop')
   if args[0]=='launch':return 'com.scoresnap.app: '+str(pid)
   if args[:3]==('ui','synthetic','content_size') and len(args)==3:return category
   return ''
  return sim,calls
 def test_cold_requires_terminate_set_actual_read_then_new_pid(self):
  sim,calls=self.fake();self.assertEqual(cold_restart(sim,'synthetic','extra-extra-large',11),22)
  self.assertEqual([c[0] for c in calls],['terminate','ui','ui','launch'])
  self.assertEqual(calls[1][-1],'extra-extra-large');self.assertEqual(len(calls[2]),3)
 def test_reversed_missing_reused_and_failed_termination(self):
  for raw in ['', 'requested 22','other.app: 22','com.scoresnap.app: 0','com.scoresnap.app: 22\nextra']:
   with self.assertRaises(ValueError):launch_pid(raw)
  for kwargs in [{'category':'large'},{'pid':11},{'fail':'terminate'}]:
   sim,calls=self.fake(**kwargs)
   with self.assertRaises((ValueError,RuntimeError)):cold_restart(sim,'synthetic','extra-extra-large',11)
   if kwargs.get('fail'):self.assertEqual(len(calls),1)
 def test_cold_receipt_cannot_be_requested_stamp(self):
  png=b'\x89PNG\r\n\x1a\n';r={'sourceSha':SHA,'sourceTree':TREE,'buildSha256':'a'*64,'scene':'home','categoryBefore':'large','categoryAfter':'large','runtimeRNScale':None,'nativeAcceptance':False,'geometryPassed':False,'pngSha256':hashlib.sha256(png).hexdigest(),'processMode':'cold','coldProcessVerified':True}
  self.assertTrue(sanitize(r,png)['coldProcessVerified'])
  for change in [{'coldProcessVerified':False},{'processMode':'requested-cold'},{'processMode':'warm'},{'sourceSha':'a690ef23e67a255408028d81e57d40e09778c3eb'},{'runtimeRNScale':1.0}]:
   with self.assertRaises(ValueError):sanitize({**r,**change},png)
 def test_add_reacquires_full_label_then_taps_and_verifies_fifth(self):
  reveal=yaml.safe_load(ADD_VISIBLE);action=yaml.safe_load(ADD_ACTIVATE)
  self.assertEqual(reveal[0]['scrollUntilVisible']['visibilityPercentage'],100)
  self.assertEqual(reveal[0]['scrollUntilVisible']['element']['text'],r'^\+ ADD PLAYER$')
  self.assertEqual(action[0],{'tapOn':{'text':r'^\+ ADD PLAYER$'}})
  self.assertIn({'assertVisible':{'id':'contest-player-4'}},action)
  self.assertIn({'assertNotVisible':{'id':'contest-player-5'}},action)
 def test_add_capture_wrong_scene_and_missing_control_rejected(self):
  def tree(ids,texts):return {'children':[{'attributes':{'resource-id':x}} for x in ids]+[{'attributes':{'text':x}} for x in texts]}
  ids=['contest-scroll','contest-footer','contest-continue'];self.assertTrue(screen(tree(ids,['+ ADD PLAYER']),'add-player'))
  for wrong in [tree(ids,[]),tree(ids+['home-new-contest'],['+ ADD PLAYER']),tree(ids[:-1],['+ ADD PLAYER'])]:
   with self.assertRaises(ValueError):screen(wrong,'add-player')
 def test_checkpoint_order_preserves_home_then_four_player_before_action(self):
  source=(pathlib.Path(__file__).parent/'run.py').read_text()
  self.assertLess(source.index("shot('home','home-cold-'"),source.index("shot('setup','four-player-'"))
  self.assertLess(source.index("shot('setup','four-player-'"),source.index("shot('add-player','add-player-'"))
  self.assertLess(source.index("shot('add-player','add-player-'"),source.index("lambda:flow(ADD_ACTIVATE"))
