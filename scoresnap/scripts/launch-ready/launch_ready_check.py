#!/usr/bin/env python3
"""Offline, read-only validation of RC-bound launch evidence. UNKNOWN fails."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
MANIFEST_SHA256 = 'a52d4ff4fb3727f5dc09d04fe808f3d43708754a84c61dd3f286f2213523d261'
IDS = [f'LR-{n}' for n in range(1, 13)]
HEX40 = re.compile(r'[0-9a-f]{40}')
HEX64 = re.compile(r'[0-9a-f]{64}')
LIVE_MAX_AGE_SECONDS = 86400  # Observation policy, not a change to the frozen rows.


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('timezone required')
    return parsed.astimezone(timezone.utc)


def load_json(path):
    def unique(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValueError('duplicate JSON key')
            obj[key] = value
        return obj
    return json.loads(path.read_text(), object_pairs_hook=unique)


def canonical():
    path = ROOT / 'LAUNCH-READY.json'
    if hashlib.sha256(path.read_bytes()).hexdigest() != MANIFEST_SHA256:
        raise ValueError('frozen manifest hash mismatch')
    return load_json(path)


def valid_source(value):
    if not isinstance(value, str):
        return False
    url = urlsplit(value)
    return url.scheme == 'https' and bool(url.hostname) and not url.username and not url.password and not url.query


def board_check(board, now):
    if not isinstance(board, dict):
        return 'UNKNOWN', []
    try:
        age = (now - timestamp(board['observed_at'])).total_seconds()
        if not 0 <= age < LIVE_MAX_AGE_SECONDS or not isinstance(board['issues'], list):
            return 'UNKNOWN', []
        alarms = []
        for issue in board['issues']:
            if (not isinstance(issue.get('id'), str) or type(issue.get('blocked')) is not bool
                    or type(issue.get('priority')) is not int or not isinstance(issue.get('state'), str)):
                return 'UNKNOWN', []
            if issue['blocked']:
                blocker = issue.get('blocker') or {}
                if (not blocker.get('id') or not blocker.get('state') or
                        blocker.get('state') in ('Done', 'Canceled', 'Cancelled') or
                        not str(issue.get('owner') or '').strip() or not str(issue.get('wake') or '').strip()):
                    alarms.append({'kind': 'dead_blocker', 'issue': issue['id']})
        return ('FAIL' if alarms else 'PASS'), alarms
    except (KeyError, ValueError, TypeError, AttributeError):
        return 'UNKNOWN', []


def grade_ok(facts):
    digest = facts.get('artifact_sha256')
    grade, verifier = facts.get('grade'), facts.get('verifier')
    if not isinstance(digest, str) or not HEX64.fullmatch(digest):
        return False
    if not isinstance(grade, dict) or not isinstance(verifier, dict):
        return False
    return (grade.get('verdict') == verifier.get('verdict') == 'PASS' and
            grade.get('artifact_sha256') == verifier.get('artifact_sha256') == digest and
            verifier.get('company') in ('anthropic', 'openai', 'cursor', 'xai') and
            verifier.get('builder_company') in ('anthropic', 'openai', 'cursor', 'xai') and
            verifier['company'] != verifier['builder_company'])


def check_row(row, entry, directory, rc_sha, now):
    """Hash pins retained normalized readbacks; collector integration is separate."""
    try:
        if not isinstance(entry, dict):
            return 'UNKNOWN', 'missing evidence', False
        path = (directory / entry['path']).resolve()
        if not path.is_relative_to(directory.resolve()) or not path.is_file():
            return 'UNKNOWN', 'receipt path missing or outside evidence directory', False
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            return 'UNKNOWN', 'receipt digest mismatch', False
        receipt = load_json(path)
        if receipt.get('rc_sha') != rc_sha or not valid_source(receipt.get('source')):
            return 'UNKNOWN', 'missing RC binding or source provenance', False
        age = (now - timestamp(receipt['observed_at'])).total_seconds()
        if age < 0:
            return 'UNKNOWN', 'future observation', False
        if row['live'] and age >= LIVE_MAX_AGE_SECONDS:
            return 'UNKNOWN', 'stale live observation', True
        facts = receipt['facts']
        if not isinstance(facts, dict):
            return 'UNKNOWN', 'missing facts', False
        missing = [key for key in row['requires'] if key not in facts]
        if missing:
            return 'UNKNOWN', 'missing required facts: ' + ', '.join(missing), False
        failed = [key for key, expected in row['requires'].items()
                  if type(facts[key]) is not type(expected) or facts[key] != expected]
        if failed:
            return 'FAIL', 'failed facts: ' + ', '.join(failed), False
        if row['graded'] and not grade_ok(facts):
            return 'UNKNOWN', 'missing same-artifact graded and cross-company PASS', False
        return 'PASS', 'RC-bound receipt checked', False
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return 'UNKNOWN', 'malformed or unavailable receipt', False


def evaluate(manifest, bundle, directory, rc_sha, at):
    errors = []
    try:
        if manifest != canonical():
            errors.append('manifest differs from frozen mapping (missing command, row or requirement)')
    except (OSError, ValueError):
        errors.append('frozen manifest unavailable or changed')
    if not isinstance(rc_sha, str) or not HEX40.fullmatch(rc_sha):
        errors.append('RC must be a full lowercase source SHA')
    try:
        now = timestamp(at)
    except (ValueError, TypeError, AttributeError):
        errors.append('invalid evaluation timestamp')
        now = datetime.now(timezone.utc)
    if not isinstance(bundle, dict):
        bundle = {}
        errors.append('invalid evidence bundle')
    entries = bundle.get('rows', {})
    if not isinstance(entries, dict) or set(entries) - set(IDS):
        errors.append('invalid or unexpected evidence rows')
        entries = {}
    board_status, alarms = board_check(bundle.get('board'), now)
    rows = []
    # Always emit the frozen 12 IDs, including when a supplied mapping is invalid.
    try:
        definitions = canonical()['rows']
    except (OSError, ValueError):
        definitions = [{'id': rid} for rid in IDS]
    for row in definitions:
        if errors:
            status, reason, stale = 'UNKNOWN', 'invalid gate configuration', False
        else:
            status, reason, stale = check_row(row, entries.get(row['id']), directory, rc_sha, now)
        if stale:
            alarms.append({'kind': 'stale_row', 'row': row['id']})
        # The board collector must include every child, not only blocked issues.
        if row['id'] == 'LR-12' and board_status != 'UNKNOWN':
            if any(i['priority'] == 1 and i['state'] not in ('Done', 'Canceled', 'Cancelled')
                   for i in bundle['board']['issues']):
                status, reason = 'FAIL', 'open P0 child of AUG-496'
        # Missing board data cannot establish zero P0 children or healthy automation.
        if row['id'] in ('LR-11', 'LR-12') and board_status != 'PASS' and status == 'PASS':
            status, reason = board_status, 'board readback is missing, stale or has dead blockers'
        rows.append({'id': row['id'], 'status': status, 'reason': reason})
    remaining = [r['id'] for r in rows if r['status'] != 'PASS']
    return {'schema': 'snapscore-launch-ready-result/1', 'rc_sha': rc_sha, 'as_of': at,
            'definition': 'SS-LAUNCH-READY-FROZEN-20261118', 'target': '2026-11-24',
            'ready': not errors and not remaining, 'remaining': remaining, 'rows': rows,
            'configuration_errors': errors, 'board_status': board_status, 'alarms': alarms}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rc-sha', required=True)
    parser.add_argument('--evidence', type=Path, help='bundle JSON; paths relative to this file')
    parser.add_argument('--manifest', type=Path, default=ROOT / 'LAUNCH-READY.json')
    parser.add_argument('--now', default=datetime.now(timezone.utc).isoformat())
    parser.add_argument('--row', choices=IDS, help='return only this automated row check')
    args = parser.parse_args()
    try:
        manifest = load_json(args.manifest)
        bundle = load_json(args.evidence) if args.evidence else {}
        directory = args.evidence.resolve().parent if args.evidence else ROOT
        result = evaluate(manifest, bundle, directory, args.rc_sha, args.now)
    except (OSError, ValueError):
        result = evaluate({}, {}, ROOT, args.rc_sha, args.now)
    if args.row:
        result['rows'] = [r for r in result['rows'] if r['id'] == args.row]
        result['remaining'] = [r['id'] for r in result['rows'] if r['status'] != 'PASS']
        result['ready'] = not result['configuration_errors'] and not result['remaining']
    print(json.dumps(result, indent=2))
    return 0 if result['ready'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
