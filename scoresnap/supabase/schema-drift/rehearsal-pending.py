#!/usr/bin/env python3
"""Exact pending sets around ledger adoption; never execute the physical baseline twice."""
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
BASELINE = '20261027000000_live_baseline.sql'


def check(log, adopted):
    active = json.loads((HERE / 'active-migrations.json').read_text())
    assert BASELINE in active
    # The seven pre-baseline provenance markers are already in the remote ledger.
    expected = sorted(name for name in active if name >= BASELINE and (not adopted or name != BASELINE))
    actual = re.findall(r'\b\d{14}_[A-Za-z0-9_]+\.sql\b', log)
    assert actual == expected, ('Unexpected pending migrations', actual, expected)


if __name__ == '__main__':
    assert sys.argv[2] in ('before', 'after')
    check(pathlib.Path(sys.argv[1]).read_text(), sys.argv[2] == 'after')
