"""Real Git object/tree/archive controls. Local fixtures are not release source."""
import contextlib
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import build

INERT = b'# fake fixture only\nEXPO_PUBLIC_SUPABASE_URL=https://example.invalid\n'
SCOPE = build.TEMPLATE_PATH


class GitArchiveTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.top = Path(tmp.name)
        self.repo = self.top / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.put(SCOPE, INERT)
        self.put('scoresnap/package-lock.json', b'{}\n')
        self.put('scoresnap/src/app.ts', b'export const example = true;\n')
        self.put('.env.other-project', b'OUTSIDE_APP_SCOPE=fixture\n')
        self.blob = self.git('hash-object', SCOPE)
        self.out = self.top / 'out'

    def git(self, *args):
        return subprocess.check_output(
            ['git', '-C', str(self.repo), '-c', 'user.name=Fixture',
             '-c', 'user.email=fixture@example.invalid', *args], text=True).strip()

    def put(self, name, content):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def pin(self):
        self.git('add', '.')
        self.git('commit', '-q', '-m', 'Offline synthetic fixture')
        return {'SHA': self.git('rev-parse', 'HEAD'),
                'TREE': self.git('rev-parse', 'HEAD^{tree}'),
                'TEMPLATE_GIT_BLOB': self.blob,
                'TEMPLATE_SHA256': build.digest(INERT),
                'TEMPLATE_BYTES': len(INERT)}

    def test_actual_git_archive_inventory_and_only_one_omission(self):
        with patch.multiple(build, **self.pin()):
            self.assertEqual(build.source(self.repo), build.digest(b'{}\n'))
            verification = build.plan_archive(self.repo)
            self.assertFalse(self.out.exists())
            self.assertEqual(build.export(self.repo, self.out), verification)
        self.assertEqual(verification['verifiedGitArchiveFileCount'], 3)
        self.assertEqual(verification['acceptedFileCount'], 2)
        self.assertEqual(len(verification['gitInventorySha256']), 64)
        self.assertEqual(verification['omitted'], [{
            'path': SCOPE, 'gitBlob': self.blob, 'sha256': build.digest(INERT),
            'bytes': len(INERT), 'reason': 'verified-inert-tracked-dotenv-template'}])
        self.assertFalse((self.out / SCOPE).exists())
        self.assertFalse((self.out / '.env.other-project').exists())
        self.assertEqual((self.out / 'scoresnap/src/app.ts').read_bytes(),
                         b'export const example = true;\n')
        self.assertEqual((self.repo / SCOPE).read_bytes(), INERT)
        self.assertEqual(self.git('status', '--porcelain'), '')

    def test_default_template_pin_is_utf8_bytes_not_character_count(self):
        body = ('# Inert fixture — ' + 'x' * (1256 - len('# Inert fixture — '))).encode('utf-8')
        self.assertEqual(len(body.decode('utf-8')), 1256)
        self.assertEqual(len(body), 1258)
        self.put(SCOPE, body)
        self.blob = self.git('hash-object', SCOPE)
        pins = self.pin()
        pins.update(TEMPLATE_SHA256=build.digest(body))
        del pins['TEMPLATE_BYTES']  # Exercise the real production byte-size constant.
        with patch.multiple(build, **pins):
            proof = build.plan_archive(self.repo)
        self.assertEqual(proof['omitted'][0]['bytes'], 1258)

    def test_modified_same_name_dotenv_is_not_allowlisted(self):
        self.put(SCOPE, INERT + b'# drift\n')
        with patch.multiple(build, **self.pin()):
            with self.assertRaisesRegex(build.Blocked, 'TEMPLATE_BLOB_MISMATCH'):
                build.export(self.repo, self.out)
        self.assertFalse(self.out.exists())

    def test_other_dotenv_names_fail_even_when_inert_or_nested(self):
        # Use a nested case variant on case-insensitive volumes, where root .ENV.EXAMPLE
        # aliases the pinned .env.example. Preserve the root-level test on case-sensitive hosts.
        upper = 'scoresnap/src/.ENV.EXAMPLE' if (self.repo/'scoresnap/.ENV.EXAMPLE').exists() else 'scoresnap/.ENV.EXAMPLE'
        for example in ('scoresnap/.env.local', 'scoresnap/src/.env.example',
                        upper, 'scoresnap/.env.example.backup'):
            with self.subTest(name=example):
                self.put(example, INERT)
                with patch.multiple(build, **self.pin()):
                    with self.assertRaisesRegex(build.Blocked, 'TRACKED_ENV_NOT_ALLOWED'):
                        build.export(self.repo, self.out)
                self.assertFalse(self.out.exists())
                # Commit the removal so each test starts without earlier rejected files.
                (self.repo / example).unlink()
                self.git('add', '.')
                self.git('commit', '-q', '-m', 'Reset synthetic fixture')

    def test_archive_sha256_guard_also_enforces_raw_inert_bytes(self):
        with patch.multiple(build, **(self.pin() | {'TEMPLATE_SHA256': '0' * 64})):
            with self.assertRaisesRegex(build.Blocked, 'TEMPLATE_ARCHIVE_SHA256_MISMATCH'):
                build.export(self.repo, self.out)

    def test_archive_missing_git_file_is_rejected_even_if_git_attributes_hide_it(self):
        self.put('scoresnap/.gitattributes', b'src/app.ts export-ignore\n')
        with patch.multiple(build, **self.pin()):
            with self.assertRaisesRegex(build.Blocked, 'ARCHIVE_GIT_INVENTORY_MISMATCH'):
                build.export(self.repo, self.out)
        self.assertFalse(self.out.exists())

    def test_archive_substituted_bytes_rejected(self):
        self.put('scoresnap/.gitattributes', b'src/app.ts export-subst\n')
        self.put('scoresnap/src/app.ts', b'// $Format:%H$\n')
        with patch.multiple(build, **self.pin()):
            with self.assertRaisesRegex(build.Blocked, 'ARCHIVE_GIT_BLOB_MISMATCH'):
                build.export(self.repo, self.out)
        self.assertFalse(self.out.exists())

    def test_symlink_is_rejected(self):
        (self.repo / 'scoresnap' / 'link').symlink_to('package-lock.json')
        with patch.multiple(build, **self.pin()):
            with self.assertRaisesRegex(build.Blocked, 'UNSAFE_GIT_ENTRY'):
                build.export(self.repo, self.out)
        self.assertFalse(self.out.exists())

    def test_verify_export_rejects_non_matching_commit_before_inventory(self):
        self.pin()
        with self.assertRaisesRegex(build.Blocked, 'EXACT_CLEAN_SOURCE_REQUIRED'):
            build.source(self.repo)


if __name__ == '__main__':
    unittest.main()
