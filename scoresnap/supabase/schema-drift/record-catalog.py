#!/usr/bin/env python3
"""Record a catalog-query.sql extraction using the drift gate's normalizer."""
import json
import pathlib
import sys
from drift import normalize
source, target = map(pathlib.Path, sys.argv[1:])
target.write_text(json.dumps(normalize(json.loads(source.read_text())), indent=2, sort_keys=True) + '\n')
