import unittest,json
import android_insets as i

def fixtures(visible=False):
 sources='\n'.join('        InsetsSource id='+n+' type='+k+' frame='+f+' visible='+v+' flags= sideHint='+side+' boundingRects=null' for n,k,f,v,side in [('1','statusBars','[0,0][1080,72]','true','TOP'),('2','navigationBars','[0,2328][1080,2400]','true','BOTTOM'),('3','ime','[0,1500][1080,2400]' if visible else '[0,0][0,0]','true' if visible else 'false','BOTTOM')])
 state='''    InsetsState
      mDisplayFrame=Rect(0, 0 - 1080, 2400)
      mDisplayCutout=DisplayCutout{insets=Rect(0, 0 - 0, 0) waterfall=Insets{left=0, top=0, right=0, bottom=0} boundingRect={Bounds=[Rect(0, 0 - 0, 0), Rect(0, 0 - 0, 0), Rect(0, 0 - 0, 0), Rect(0, 0 - 0, 0)]}}
'''+sources+'\n'
 focus='mTopFocusedDisplayId=0\nDisplay: mDisplayId=0\n  mCurrentFocus=Window{abc u0 com.scoresnap.app/.MainActivity}\n  WindowInsetsStateController\n'+state
 windows='''mTopFocusedDisplayId=0
 Window #0 Window{abc u0 com.scoresnap.app/.MainActivity}:
  mDisplayId=0 rootTaskId=1
  isOnScreen=true
  isVisible=true
  Frames: parent=[0,0][1080,2400] display=[0,0][1080,2400] frame=[0,0][1080,2400] last=[0,0][1080,2400] insetsChanged=false
 Window #1 Window{def u0 InputMethod}:
  isVisible=true
'''
 activity='''ACTIVITY com.scoresnap.app/.MainActivity dead pid=123
  mResumed=true mStopped=false mFinished=false
  mCurrentConfig={1.0 synthetic}
  ViewRoot:
    mAdded=true
    mRemoved=false
    mStopped=false
    mPausedForTransition=false
    mTraversalScheduled=false
    mReportNextDraw=false
  InsetsController:
'''+state+'    mIsPredictiveBackImeHideAnimInProgress=false\n'
 return windows,focus,activity
class Controls(unittest.TestCase):
 def observe(self,f):return i.observe(*f,[1080,2400],480)
 def test_hidden_and_visible_keyboard_separate_from_safe_area(self):
  for visible in (False,True):
   result=self.observe(fixtures(visible));self.assertEqual(result['safeArea'],{'left':0,'top':24,'right':0,'bottom':24});self.assertEqual(result['keyboard']['visible'],visible)
   for secret in ('abc','com.scoresnap','pid=123','InputMethod','synthetic'):self.assertNotIn(secret,json.dumps(result))
 def test_other_axis_and_hidden_status(self):
  f=tuple(t.replace('[0,2328][1080,2400]','[0,0][60,2400]').replace('sideHint=BOTTOM','sideHint=LEFT') for t in fixtures())
  self.assertEqual(self.observe(f)['safeArea']['left'],20)
  f=tuple(t.replace('frame=[0,0][1080,72] visible=true','frame=[0,0][1080,72] visible=false') for t in fixtures())
  self.assertEqual(self.observe(f)['safeArea']['top'],0)
 def test_missing_conflict_duplicate_foreign_scaled_unstable_reject(self):
  changes=[(0,'Window{abc','Window{bad'),(0,'insetsChanged=false','insetsChanged=true'),(0,'isVisible=true','isVisible=false'),(1,'mDisplayId=0','mDisplayId=1'),(2,'mResumed=true','mResumed=false'),(2,'mTraversalScheduled=false','mTraversalScheduled=true'),(2,'[1080,72]','[1080,80]'),(2,'InsetsController:','InsetsController:\n  ViewRoot:'),(1,'type=ime','type=captionBar'),(1,'boundingRects=null','boundingRects=[unknown]')]
  for index,a,b in changes:
   f=list(fixtures());f[index]=f[index].replace(a,b)
   with self.subTest(a=a),self.assertRaises(ValueError):self.observe(f)
 def test_cutout_floating_nonedge_and_duplicate_sources_reject(self):
  for a,b in [('insets=Rect(0, 0 - 0, 0)','insets=Rect(0, 50 - 0, 0)'),('[0,1500][1080,2400]','[100,1500][980,2200]'),('[0,0][1080,72]','[0,100][1080,172]'),('id=3 type=ime','id=1 type=ime')]:
   f=tuple(t.replace(a,b) for t in fixtures(True))
   with self.subTest(a=a),self.assertRaises(i.InsetsError):self.observe(f)
 def test_source_frames_are_measured_not_constants(self):
  f=tuple(t.replace('[1080,72]','[1080,99]') for t in fixtures())
  self.assertEqual(self.observe(f)['safeArea']['top'],33)
if __name__=='__main__':unittest.main()
