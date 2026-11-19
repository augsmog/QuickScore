#!/usr/bin/env python3
"""Validate opt-in artifact pins before workflow build/download or runner side effects."""
import argparse
import json
import re
import sys


def validate(config, build, flows, app_url, app_path, build_id):
    if build not in config['builds']:
        raise ValueError('unknown build key')
    requested = None if flows == 'all' else set(flows.split(','))
    eligible = [f for f in config['flows'] if f['build'] == build]
    if requested is not None and requested - {f['id'] for f in eligible}:
        raise ValueError('unknown flow for selected build')
    selected = [f for f in eligible if (not f.get('skipInAll') if requested is None else f['id'] in requested)]
    if not selected:
        raise ValueError('no flows selected')
    pinned = [f for f in selected if f.get('pinnedEasBuildId')]
    identities = {(f['pinnedEasBuildId'], f.get('pinnedArtifactUrl'), f.get('pinnedArtifactSha256')) for f in pinned}
    if len(identities) > 1:
        raise ValueError('conflicting existing-binary artifact pins; run separately')
    if not identities:
        return ''
    expected_id, expected_url, digest = identities.pop()
    if not expected_url or not re.fullmatch(r'[a-f0-9]{64}', digest or ''):
        raise ValueError('existing-binary pin is incomplete')
    if app_path or not app_url or app_url != expected_url or build_id != expected_id:
        raise ValueError('existing-binary flow requires its exact retained app URL and build ID; source builds are forbidden')
    return digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--build', required=True)
    parser.add_argument('--flows', default='all')
    parser.add_argument('--app-url', default='')
    parser.add_argument('--app-path', default='')
    parser.add_argument('--build-id', default='')
    args = parser.parse_args()
    try:
        with open(args.config) as source:
            config = json.load(source)
        print(validate(config, args.build, args.flows, args.app_url, args.app_path, args.build_id))
    except (ValueError, KeyError, OSError) as error:
        print(f'existing-binary: {error}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
