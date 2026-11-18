#!/usr/bin/env python3
"""Collect, evaluate and always render a report; retain a nonzero failing gate exit."""
import argparse
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

import collect_launch_evidence as collector
import launch_report

PROVIDER_ROWS = {'github': ['LR-1', 'LR-7', 'LR-10', 'LR-12'],
                 'linear': ['LR-6', 'LR-8', 'LR-11', 'LR-12'],
                 'eas': ['LR-4'], 'asc': ['LR-4', 'LR-5']}


def apply_availability(bundle, collection):
    """Never allow a retained receipt to hide a missing required current readback."""
    safe = copy.deepcopy(bundle)
    missing = {}
    for provider, rows in PROVIDER_ROWS.items():
        if collection.get('providers', {}).get(provider, {}).get('status') != 'OBSERVED':
            for row in rows:
                safe.setdefault('rows', {}).pop(row, None)
                missing.setdefault(row, []).append(provider)
    # A successful transport is not proof of current readiness. Contradictory or
    # incomplete observations must not be masked by a retained PASS receipt.
    def unavailable(row, reason):
        safe.setdefault('rows', {}).pop(row, None)
        missing.setdefault(row, []).append(reason)
    providers = collection.get('providers', {})
    eas = providers.get('eas', {}).get('data', {})
    asc = providers.get('asc', {}).get('data', {})
    if (eas.get('status') != 'FINISHED' or eas.get('appVersion') != '1.0.1'
            or not eas.get('appBuildVersion') or asc.get('processingState') != 'VALID'
            or str(eas.get('appBuildVersion')) != str(asc.get('version'))):
        unavailable('LR-4', 'matching finished EAS/VALID ASC build')
    required = {'Schema drift', 'Pro shipping config guard', 'iOS boot smoke', 'Tournament E2E', 'Web smoke'}
    latest = {}
    for run in providers.get('github', {}).get('data', {}).get('runs', []):
        if run.get('head_branch') == 'main' and run.get('name') in required:
            name = run['name']
            if (run.get('id', 0), run.get('run_attempt') or 0) > (latest.get(name, {}).get('id', 0), latest.get(name, {}).get('run_attempt') or 0):
                latest[name] = run
    children = providers.get('linear', {}).get('data', {}).get('children')
    if (set(latest) != required or any(r.get('status') != 'completed' or r.get('conclusion') != 'success' for r in latest.values())
            or not isinstance(children, list)
            or any(c.get('p0') and c.get('state') not in ('completed', 'canceled') for c in children)):
        unavailable('LR-12', 'five green main workflows and no open P0 children')
    return safe, missing


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--rc-sha', required=True)
    p.add_argument('--out-dir', type=Path, required=True)
    p.add_argument('--evidence', type=Path)
    p.add_argument('--history', type=Path)
    p.add_argument('--seed-missing-command', action='store_true', help='offline negative drill; MUST exit 1')
    args = p.parse_args()
    # This is the versioned sibling API, never shell execution of manifest commands.
    import launch_ready_check as checker
    args.out_dir.mkdir(parents=True, exist_ok=True)
    manifest = checker.canonical()
    try:
        bundle = checker.load_json(args.evidence) if args.evidence else {}
        if not isinstance(bundle, dict) or not isinstance(bundle.get('rows', {}), dict):
            bundle = {}
    except (OSError, ValueError):
        bundle = {}
    root = args.evidence.resolve().parent if args.evidence else Path(__file__).parent
    now = datetime.now(timezone.utc).isoformat()
    if args.seed_missing_command:
        manifest['rows'][0]['command'] = ''
        collection = {'schema': 'snapscore-launch-collection/1', 'rc_sha': args.rc_sha,
                      'observed_at': now, 'providers': {}}
    else:
        linear = None
        helper = Path('/workspace/aos-state/scripts/linear_app_token.py')
        if helper.is_file():
            sys.path.insert(0, str(helper.parent))
            from linear_app_token import gql
            linear = gql
        collection = collector.collect(args.rc_sha, os.environ, linear=linear)
    safe, missing = apply_availability(bundle, collection)
    result = checker.evaluate(manifest, safe, root, args.rc_sha, now)
    if not result['configuration_errors']:
        for row in result['rows']:
            if row['id'] in missing:
                row['reason'] = 'required readback unavailable: ' + ', '.join(missing[row['id']])
    result['collection_status'] = {k: v['status'] for k, v in collection['providers'].items()}
    history = json.loads(args.history.read_text()) if args.history else []
    if not isinstance(history, list):
        raise ValueError('history must be a list')
    (args.out_dir / 'collection.json').write_text(json.dumps(collection, indent=2) + '\n')
    (args.out_dir / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    (args.out_dir / 'report.md').write_text(launch_report.render(result, history))
    return 0 if result['ready'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
