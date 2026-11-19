import tempfile
import unittest
from pathlib import Path

import check_reply_kit as checker


GOOD_KIT = '''# Kit\n\n## Working demo account\n**Draft answer:** Sign in.\nDraft: `/workspace/aos-state/reports/packet.md#L1-L1`\nEvidence: `/workspace/aos-state/reports/packet.md#L1-L1`\n\n## Subscription restoration\n**Draft answer:** Restore from the paywall.\nDraft: `/workspace/aos-state/reports/packet.md#L1-L1`\nEvidence: `/workspace/aos-state/reports/packet.md#L1-L1`\n\n## EULA, Terms, and Privacy links\n**Draft answer:** Links appear in the paywall.\nDraft: `/workspace/aos-state/reports/packet.md#L1-L1`\nEvidence: `/workspace/aos-state/reports/packet.md#L1-L1`\n\n## Reporting or blocking a user\n**Draft answer:** Use the message menu.\nDraft: `/workspace/aos-state/reports/packet.md#L1-L1`\nEvidence: `/workspace/aos-state/reports/packet.md#L1-L1`\n\n## Settlement behavior\n**Draft answer:** The screen calculates amounts.\nDraft: `/workspace/aos-state/reports/packet.md#L1-L1`\nEvidence: `/workspace/aos-state/reports/packet.md#L1-L1`\n'''


class ReplyKitTests(unittest.TestCase):
    def make_root(self, kit=GOOD_KIT, packet='Evidence recorded.\n', count=50):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        (root / checker.KIT).parent.mkdir(parents=True)
        (root / checker.KIT).write_text(kit)
        packet_path = root / 'reports/packet.md'
        packet_path.parent.mkdir(parents=True)
        packet_path.write_text(packet)
        scanner_path = root / checker.SCANNER
        scanner_path.parent.mkdir(parents=True, exist_ok=True)
        scanner_path.write_text('def scan(path):\n    return []\n')
        count_path = root / checker.COUNT_FILE
        count_path.parent.mkdir(parents=True, exist_ok=True)
        count_path.write_text(f'| **A. Selectable and scored end to end** | description | **{count}** | yes |\n')
        return root

    def test_passes_complete_kit_and_verified_claim(self):
        root = self.make_root(kit=GOOD_KIT.replace('Evidence: `/workspace/aos-state/reports/packet.md#L1-L1`', 'Evidence: `/workspace/aos-state/reports/packet.md#L1-L1`\nClaim: 50+ game modes.'))
        self.assertEqual(checker.validate(root), [])

    def test_missing_section_fails(self):
        root = self.make_root(kit=GOOD_KIT.replace('## Reporting or blocking a user', '## Moderation'))
        self.assertTrue(any('missing section: Reporting or blocking a user' in p for p in checker.validate(root)))

    def test_dead_path_fails(self):
        root = self.make_root(kit=GOOD_KIT.replace('/reports/packet.md#L1-L1', '/reports/missing.md#L1-L1'))
        self.assertTrue(any('cited file does not exist' in p for p in checker.validate(root)))

    def test_missing_evidence_pointer_fails(self):
        root = self.make_root(kit=GOOD_KIT.replace('Evidence: `/workspace/aos-state/reports/packet.md#L1-L1`\n', '', 1))
        self.assertTrue(any('missing evidence file-and-line pointer' in p for p in checker.validate(root)))

    def test_malformed_dead_pointer_fails(self):
        kit = GOOD_KIT.replace('/reports/packet.md#L1-L1', '/reports/missing.md#Lnot-a-line', 1)
        root = self.make_root(kit=kit)
        self.assertTrue(any('malformed line range' in p for p in checker.validate(root)))

    def test_prohibited_word_fails_through_packet_scanner(self):
        root = self.make_root(kit=GOOD_KIT.replace('The screen calculates amounts.', 'The screen says unlock.'))
        scanner = root / checker.SCANNER
        scanner.write_text("def scan(path):\n    return ['SCAN-FAIL: prohibited term']\n")
        self.assertTrue(any('packet scan:' in p for p in checker.validate(root)))

    def test_under_50_mode_claim_fails(self):
        kit = GOOD_KIT.replace('Evidence: `/workspace/aos-state/reports/packet.md#L1-L1`', 'Evidence: `/workspace/aos-state/reports/packet.md#L1-L1`\nClaim: 50+ game modes.')
        root = self.make_root(kit=kit, count=33)
        self.assertTrue(any('below 50' in p for p in checker.validate(root)))


if __name__ == '__main__':
    unittest.main()
