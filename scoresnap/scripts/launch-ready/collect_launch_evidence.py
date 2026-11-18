#!/usr/bin/env python3
"""Read-only provider observations. Observations are NOT graded row receipts.

Only allowlisted GETs, EAS build:view, and Tater GraphQL queries are supported.
No credential setup, signup probe, vendor mutation or raw payload is persisted.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request


def run_json(args):
    proc = subprocess.run(args, capture_output=True, text=True, timeout=60, check=True)
    if len(proc.stdout) > 8_000_000:
        raise ValueError('response too large')
    return json.loads(proc.stdout)


def get_json(url, token):
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token}, method='GET')
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError('response too large')
    return json.loads(raw)


def collect(sha, env, run=run_json, get=get_json, linear=None):
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('full lowercase RC SHA required')
    providers = {}
    def read(name, available, action):
        if not available:
            providers[name] = {'status': 'UNKNOWN', 'reason': 'required credential, tool or build ID unavailable'}
            return
        try:
            providers[name] = {'status': 'OBSERVED', 'data': action()}
        except (Exception, SystemExit):
            # Never echo exceptions: vendor errors/CLI stderr can contain tokens or PII.
            providers[name] = {'status': 'UNKNOWN', 'reason': 'read failed or response malformed'}

    def github():
        endpoint = f'repos/augsmog/QuickScore/actions/runs?head_sha={sha}&per_page=100'
        response = run(['gh', 'api', '--method', 'GET', endpoint, '--paginate', '--slurp'])
        pages = response if isinstance(response, list) else [response]
        if not pages or any(not isinstance(p.get('workflow_runs'), list) for p in pages):
            raise ValueError('missing workflow_runs')
        runs = []
        for page in pages:
            for item in page['workflow_runs']:
                if item.get('head_sha') != sha:
                    raise ValueError('unbound workflow')
                runs.append({k: item.get(k) for k in ('id', 'name', 'head_sha', 'head_branch', 'event',
                                                     'status', 'conclusion', 'html_url', 'updated_at', 'run_attempt')})
        return {'source': 'https://api.github.com/' + endpoint, 'runs': runs}

    def eas():
        value = run(['eas', 'build:view', env['AOS_EAS_BUILD_ID'], '--json'])
        if (value.get('id') != env['AOS_EAS_BUILD_ID'] or not value.get('status')
                or value.get('gitCommitHash') != sha):
            raise ValueError('missing build identity')
        return {k: value.get(k) for k in ('id', 'status', 'gitCommitHash', 'appVersion', 'appBuildVersion', 'platform')}

    def asc():
        url = 'https://api.appstoreconnect.apple.com/v1/builds/' + env['AOS_ASC_BUILD_ID']
        value = get(url, env['ASC_BEARER_TOKEN'])['data']
        if value.get('id') != env['AOS_ASC_BUILD_ID'] or not value.get('attributes', {}).get('processingState'):
            raise ValueError('missing build identity')
        return {'source': url, 'id': value['id'], 'processingState': value['attributes']['processingState'],
                'version': value['attributes'].get('version')}

    def board():
        query = '''query { issue(id:"AUG-496") { identifier children(first:250) {
          nodes { identifier priority title state { name type } labels { nodes { name } } }
          pageInfo { hasNextPage } } } }'''
        response = linear(query)
        if response.get('errors'):
            raise ValueError('query errors')
        parent = response['data']['issue']
        children = parent['children']
        if parent['identifier'] != 'AUG-496' or children['pageInfo']['hasNextPage']:
            raise ValueError('incomplete parent snapshot')
        # Keep only non-personal operational fields, never descriptions/comments.
        records = []
        for child in children['nodes']:
            labels = [label['name'] for label in child['labels']['nodes']]
            records.append({'id': child['identifier'], 'state': child['state']['type'],
                            'priority': child['priority'],
                            'blocked': 'blocked' in labels,
                            'p0': child['priority'] == 1 or any(label.lower() == 'p0' for label in labels)
                                  or bool(re.search(r'\bP0\b', child['title']))})
        return {'parent': 'AUG-496', 'children': records}

    read('github', env.get('GH_TOKEN') or env.get('GITHUB_TOKEN'), github)
    read('linear', linear is not None, board)
    read('eas', env.get('EXPO_TOKEN') and re.fullmatch('[0-9a-fA-F-]{36}', env.get('AOS_EAS_BUILD_ID', '')), eas)
    read('asc', env.get('ASC_BEARER_TOKEN') and re.fullmatch('[0-9]+', env.get('AOS_ASC_BUILD_ID', '')), asc)
    return {'schema': 'snapscore-launch-collection/1', 'rc_sha': sha,
            'observed_at': datetime.now(timezone.utc).isoformat(), 'providers': providers}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--rc-sha', required=True)
    p.add_argument('--out', type=Path, required=True)
    args = p.parse_args()
    linear = None
    helper = Path('/workspace/aos-state/scripts/linear_app_token.py')
    if helper.is_file():
        sys.path.insert(0, str(helper.parent))
        from linear_app_token import gql
        linear = gql
    data = collect(args.rc_sha, os.environ, linear=linear)
    args.out.write_text(json.dumps(data, indent=2) + '\n')
    return 0 if all(v['status'] == 'OBSERVED' for v in data['providers'].values()) else 1


if __name__ == '__main__':
    raise SystemExit(main())
