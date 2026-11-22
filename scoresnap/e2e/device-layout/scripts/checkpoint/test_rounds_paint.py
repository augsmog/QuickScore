import unittest,struct,zlib,xml.etree.ElementTree as ET
from unittest.mock import patch
import rounds_paint as p
import test_rounds_sequence as seq

def png(selected=2,scale=1,wrong_border=False,ambiguous=False):
 w,h=400*scale,800*scale;data=bytearray(bytes(p.PAPER)*w*h)
 def paint(x,y,color):i=(y*w+x)*3;data[i:i+3]=bytes(color)
 for count in (2,3,4):
  l=(10+(count-2)*80)*scale;t=160*scale;r=l+60*scale;b=220*scale
  active=count==selected or ambiguous
  fill=p.FILL if active else p.PAPER;edge=p.PRIMARY if active else p.BORDER
  if wrong_border:edge=p.BORDER
  for y in range(t,b):
   for x in range(l,r):paint(x,y,edge if x in (l,r-1) or y in (t,b-1) else fill)
 def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
 raw=b''.join(b'\0'+data[y*w*3:(y+1)*w*3] for y in range(h))
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
class Tests(unittest.TestCase):
 def test_each_state_scale_uses_palette_and_bound_controls(self):
  for scale in (1,2):
   for count in (2,3,4):
    bounds=[((10+i*80)*scale,160*scale,(70+i*80)*scale,220*scale) for i in range(3)]
    self.assertEqual(p.classify(png(count,scale),bounds),count)
 def test_border_ambiguity_missing_bounds_fail(self):
  bounds=[(10+i*80,160,70+i*80,220) for i in range(3)]
  for image,boxes in [(png(wrong_border=True),bounds),(png(ambiguous=True),bounds),(png(),bounds[:2]),(png(),[(0,0,60,60),*bounds[1:]])]:
   with self.assertRaises(p.b.Failure):p.classify(image,boxes)
 def test_observer_no_native_selected_requires_real_matching_pixels(self):
  xml=ET.tostring(seq.fixture(None));binding={'pixel_size':[400,800]}
  self.assertEqual(p.observe(xml,png(3),binding,3)['selectedCount'],3)
  with self.assertRaises(p.b.Failure):p.observe(xml,png(2),binding,3)
 def test_disagreeing_native_or_foreign_scene_fails(self):
  with self.assertRaises(p.b.Failure):p.observe(ET.tostring(seq.fixture(2)),png(3),{'pixel_size':[400,800]},3)
  xml=ET.tostring(seq.fixture(None)).replace(b'com.scoresnap.app',b'foreign.app')
  with self.assertRaises(ValueError):p.observe(xml,png(),{'pixel_size':[400,800]},2)
 def test_capture_transaction_observer_failure_writes_nothing(self):
  import tempfile,pathlib,test_android_capture as c
  with tempfile.TemporaryDirectory() as tmp:
   target=pathlib.Path(tmp)/'result'
   def reject(*args):raise p.b.Failure('rounds-selection-mismatch')
   with self.assertRaises(p.b.Failure):p.b.capture(c.Device(),c.B,'home',target,image_observer=reject)
   self.assertFalse(target.exists())
if __name__=='__main__':unittest.main()
