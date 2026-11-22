import unittest,xml.etree.ElementTree as ET,struct,zlib
from unittest.mock import patch
import wizard_states as w
from test_keyboard_checkpoint import xml
from test_android_capture import chunk

def fixture():
 r=xml()
 for key,box,text,extra in [('team-mode','[20,100][160,240]','',{'class':'android.widget.Switch','checkable':'true','checked':'true'}),('','[200,100][500,240]','Team Mode',{}),('player-team-QAGuest-A','[250,710][390,790]','A',{'clickable':'true'}),('player-team-QAGuest-B','[400,710][540,790]','B',{'clickable':'true'})]:
  ET.SubElement(r,'node',{'package':w.b.PACKAGE,'resource-id':key,'bounds':box,'text':text,'enabled':'true',**extra})
 return r
class Controls(unittest.TestCase):
 def test_source_and_visible_team_state(self):
  import pathlib
  w.source_policy(pathlib.Path(__file__).resolve().parents[5]);r=fixture();w.team(r,True)
  for attr,value in [('checked','false'),('checkable','false'),('enabled','false'),('class','android.view.View')]:
   r=fixture();w.f.one(r,'team-mode').set(attr,value)
   with self.assertRaises(w.b.Failure):w.team(r,True)
 def test_contemporaneous_chips_hcp_and_negative_scope(self):
  r=fixture();nodes,_,_=w.chips(r,1,'QAGuest','B');self.assertEqual(len(nodes),2)
  for key,attr,value in [('player-handicap-QAGuest','text','4'),('player-team-QAGuest-A','selected','true'),('player-team-QAGuest-B','bounds','[400,2250][540,2390]')]:
   r=fixture();w.f.one(r,key).set(attr,value)
   with self.assertRaises(w.b.Failure):w.chips(r,1,'QAGuest','B')
 def test_exact_paint_active_and_reversed_and_ambiguous(self):
  bounds=[(0,0,10,10),(10,0,20,10)]
  for selected in ('A','B'):
   def pixel(x,y):return w.paint.PRIMARY if (x<10)==(selected=='A') else (231,238,230)
   with patch.object(w.paint,'pixels',return_value=(20,10,pixel)):
    self.assertEqual(w.painted(b'',bounds,selected),selected)
    with self.assertRaises(w.b.Failure):w.painted(b'',bounds,'B' if selected=='A' else 'A')
  with patch.object(w.paint,'pixels',return_value=(20,10,lambda x,y:w.paint.PRIMARY)),self.assertRaises(w.b.Failure):w.painted(b'',bounds,'A')
 def test_eight_player_scope_is_bounded(self):
  for n in range(2,9):self.assertEqual(w.f.player_card('Player '+str(n)+' name'),'contest-player-'+str(n-1))
  self.assertIsNone(w.f.player_card('Player 9 name'))

class RouteControls(unittest.TestCase):
 def test_actual_journey_orders_eight_assignments_stress_and_start(self):
  events=[]
  class Fake:
   def __init__(self,c):self.hostName='Golfer';self.report=[];self.phase='';self.reason=None
   def __getattr__(self,name):
    def call(*args,**kwargs):events.append((name,args,kwargs));return fixture()
    return call
  with patch.object(w.f,'validate',return_value=True):w.f.journey({},lane='wizard',driver_class=Fake)
  assigned=[args[0] for name,args,kw in events if name=='assign_player_state']
  self.assertEqual(assigned,list(range(8)))
  names=[name for name,args,kw in events]
  self.assertLess(names.index('enable_teams'),names.index('assign_player_state'))
  self.assertLess(names.index('stress_eight_top'),names.index('capture_start_viability'))
  start=names.index('capture_start_viability');self.assertEqual(events[start+1][:2],('advance_footer',('round-settings',)))
  guest=[kw for name,args,kw in events if name=='fill' and args[0]=='Player 2 name'];self.assertEqual(guest,[{'capture_keyboard':True}])
