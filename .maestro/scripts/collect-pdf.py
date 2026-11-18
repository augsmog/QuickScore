#!/usr/bin/env python3
"""Reopen the app's local-only PDF export and preserve immutable bytes for comparison.
No simulator operations here. The native runner supplies its clean-install cache path.
"""
import hashlib
import json
from pathlib import Path
import sys


def collect(source, destination):
    source, destination = Path(source), Path(destination)
    files = sorted(source.rglob('scorecard-pdf-exports/scorecard-*.pdf'))
    if len(files) != 1:
        raise ValueError(f'expected exactly one local export, found {len(files)}')
    file = files[0]
    if file.is_symlink() or not file.is_file():
        raise ValueError('export is not a regular file')
    data = file.read_bytes()  # actual reopen after app writes; no send/share operation
    if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-1024:]:
        raise ValueError('invalid or truncated PDF export')
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / 'scorecard.pdf'
    with target.open('xb') as stream:
        stream.write(data)
    reread = target.read_bytes()
    if reread != data:
        raise ValueError('saved export differs after reopen')
    receipt = {'schema': 'snapscore-saved-pdf/1', 'file': target.name,
               'sourceName': file.name, 'bytes': len(data),
               'sha256': hashlib.sha256(reread).hexdigest(),
               'reopened': True, 'contentComparison': 'pending'}
    (destination / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt


if __name__ == '__main__':
    try:
        print(json.dumps(collect(*sys.argv[1:3])))
    except Exception as exc:
        print(f'PDF collection failed: {exc}', file=sys.stderr)
        sys.exit(1)
