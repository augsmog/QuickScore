import unittest,tempfile,pathlib,json,shutil
from unittest.mock import patch
from entrypoint import isolated_source
class Cleanup(unittest.TestCase):
 def test_success_removes_only_owned_directory(self):
  with tempfile.TemporaryDirectory() as d:
   with isolated_source(pathlib.Path(d)) as td:pathlib.Path(td,'fixture').touch()
   self.assertFalse(pathlib.Path(td).exists());self.assertTrue(json.loads(pathlib.Path(d,'source-cleanup.json').read_text())['cleaned'])
 def test_cleanup_race_preserves_first_failure_and_bounded_retry(self):
  with tempfile.TemporaryDirectory() as d:
   try:
    with patch('entrypoint.shutil.rmtree',side_effect=OSError('synthetic race')) as remove,patch('entrypoint.time.sleep'):
     with self.assertRaisesRegex(RuntimeError,'BUILD_FIRST'):
      with isolated_source(pathlib.Path(d)) as td:raise RuntimeError('BUILD_FIRST')
     self.assertEqual(remove.call_count,3)
    receipt=json.loads(pathlib.Path(d,'source-cleanup.json').read_text());self.assertFalse(receipt['cleaned']);self.assertTrue(receipt['originalFailurePreserved'])
   finally:shutil.rmtree(td)
 def test_cleanup_failure_without_build_failure_still_blocks(self):
  with tempfile.TemporaryDirectory() as d:
   try:
    with patch('entrypoint.shutil.rmtree',side_effect=OSError('synthetic race')),patch('entrypoint.time.sleep'):
     with self.assertRaisesRegex(RuntimeError,'SOURCE_CLEANUP_INCOMPLETE'):
      with isolated_source(pathlib.Path(d)) as td:pass
   finally:shutil.rmtree(td)
