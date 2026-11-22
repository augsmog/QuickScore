import unittest
import android_capture as c
class Projection(unittest.TestCase):
 def test_preserves_frames_ancestry_without_text_or_private_identifiers(self):
  result=c.geometry_projection(b'<hierarchy><node bounds="[0,0][1080,2400]" scrollable="true" package="com.scoresnap.app"><node resource-id="contest-footer" bounds="[0,2200][1080,2400]" clickable="true" text="private synthetic input"/></node></hierarchy>')
  self.assertEqual(result[0]['children'][0]['attributes']['bounds'],'[0,2200][1080,2400]')
  self.assertNotIn('private synthetic',str(result));self.assertTrue(result[0]['children'][0]['hasText'])
  self.assertEqual(result[0]['children'][0]['sourceResourceId'],'contest-footer')
 def test_foreign_and_entity_fail(self):
  for x in [b'<hierarchy><node package="foreign"/></hierarchy>',b'<!DOCTYPE hi><hierarchy/>']:
   with self.assertRaises(c.Failure):c.geometry_projection(x)
 def test_missing_bounds_not_invented(self):
  self.assertNotIn('bounds',c.geometry_projection(b'<hierarchy><node clickable="true"/></hierarchy>')[0]['attributes'])
