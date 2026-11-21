import unittest
from smoke import scale,scene
class Controls(unittest.TestCase):
 def test_scales(self):
  for n in (1.,1.3):
   config='ACTIVITY test.app/.Main token pid=1\n mResumed=true mStopped=false mFinished=false\n mCurrentConfig={'+str(n)+' test}'
   self.assertEqual(scale(str(n),config,n,'mCurrentFocus=Window{abc u0 test.app/.Main}','test.app'),n)
 def test_reject(self):
  for value,wanted in [('null',1),('1.235',1.235),('1.3',1),('1',1.3)]:
   with self.assertRaises(ValueError):scale(value,'',wanted,'','test.app')
 def test_scene(self):
  xml='<hierarchy>'+''.join('<node package="test.app" resource-id="test.app:id/'+s+'" visible-to-user="true" bounds="[0,0][10,10]" />' for s in ['home-scroll','home-new-contest'])+'</hierarchy>'
  focus='mCurrentFocus=Window{abc u0 test.app/Main}'
  self.assertTrue(scene(xml,focus,'test.app'))
  for x,f in [(xml,focus.replace('test.app','com.android.permissioncontroller')),(xml.replace('true','false'),focus),(xml.replace('home-new-contest','new-contest-back'),focus),('<hierarchy/>',focus)]:
   with self.assertRaises(ValueError):scene(x,f,'test.app')
if __name__=='__main__':unittest.main()
