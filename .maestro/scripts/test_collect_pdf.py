import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('collect_pdf', Path(__file__).with_name('collect-pdf.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CollectPdfTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cache = self.root / 'cache'
        self.cache.mkdir()
        self.source = self.cache / 'scorecard-pdf-exports'
        self.source.mkdir()
        self.out = self.root / 'out'

    def test_reopens_identical_bytes_with_hash(self):
        data = b'%PDF-1.7\nfixture\n%%EOF\n'
        (self.source / 'scorecard-a.pdf').write_bytes(data)
        r = module.collect(self.cache, self.out)
        self.assertEqual((self.out / 'scorecard.pdf').read_bytes(), data)
        self.assertEqual(r['sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(r['contentComparison'], 'pending')
        self.assertTrue(r['reopened'])
        with self.assertRaises(FileExistsError):
            module.collect(self.cache, self.out)

    def test_missing_ambiguous_truncated_and_symlink_fail(self):
        with self.assertRaises(ValueError):
            module.collect(self.cache, self.out)
        a = self.source / 'scorecard-a.pdf'
        a.write_bytes(b'%PDF-truncated')
        with self.assertRaises(ValueError):
            module.collect(self.cache, self.out)
        b = self.source / 'scorecard-b.pdf'
        b.write_bytes(b'%PDF-two\n%%EOF')
        with self.assertRaises(ValueError):
            module.collect(self.cache, self.out)
        a.unlink()
        a.symlink_to(b)
        b.rename(self.root / 'elsewhere.pdf')
        with self.assertRaises(ValueError):
            module.collect(self.cache, self.out)
        self.assertFalse(self.out.exists())


if __name__ == '__main__':
    unittest.main()
