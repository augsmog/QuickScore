# AUG-72 focused OCR/current-main rerun

- Source: `aad018d78cc237790b55528a3c0dd5b8401ecf20`
- Lockfile: shared `nm/current` tree matched `package-lock.json` SHA-256 `6a8ed6466bc8c9c10ca09bbc017ed7dcbb9ab98388ecd89bcf154cff2d1656ed`.
- Command: `node node_modules/jest/bin/jest.js --runInBand tests/ocr-missing-hole.test.cjs tests/scorecard-corpus.test.cjs tests/paywall-tiers.test.cjs`
- Result: 3 suites passed; 209 tests passed; 0 snapshots; 2.538 seconds.

This refreshes the focused OCR/missing-hole, scorecard-corpus, and paywall-tier checks against current main. It does not supply the missing consented-photo OCR corpus or QA-bot evidence on an existing live build.
