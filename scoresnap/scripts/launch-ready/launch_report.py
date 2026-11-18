#!/usr/bin/env python3
"""Format gate output for AUG-496; publication is the existing Tater consumer's job."""
import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

IDS = [f'LR-{n}' for n in range(1, 13)]
DEFINITION = 'SS-LAUNCH-READY-FROZEN-20261118'
TARGET = '2026-11-24'


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('timezone required')
    return parsed


def validate(result):
    if (result.get('schema') != 'snapscore-launch-ready-result/1'
            or result.get('definition') != DEFINITION or result.get('target') != TARGET
            or not re.fullmatch('[0-9a-f]{40}', result.get('rc_sha', ''))):
        raise ValueError('invalid result provenance')
    timestamp(result['as_of'])
    rows = result.get('rows', [])
    if (not isinstance(rows, list) or [r.get('id') for r in rows] != IDS
            or any(r.get('status') not in ('PASS', 'FAIL', 'UNKNOWN') for r in rows)):
        raise ValueError('invalid result rows')
    remaining = [r['id'] for r in rows if r['status'] != 'PASS']
    if result.get('remaining') != remaining:
        raise ValueError('remaining list disagrees with rows')
    ready = not remaining and not result.get('configuration_errors')
    if result.get('ready') is not ready:
        raise ValueError('ready disagrees with evidence')
    return 12 - len(remaining)


def render(result, history=()):
    passed = validate(result)
    now = timestamp(result['as_of'])
    comparable = []
    for entry in history:
        try:
            prior = validate(entry)
            at = timestamp(entry['as_of'])
            if entry['rc_sha'] == result['rc_sha'] and at < now:
                comparable.append((at, prior))
        except (ValueError, KeyError, TypeError, AttributeError):
            continue
    trend = 'Burn rate: unavailable (no comparable prior observation).'
    projection = 'Projected completion: unavailable; frozen target 2026-11-24.'
    if comparable:
        at, prior = max(comparable)
        rate = (passed - prior) / ((now - at).total_seconds() / 86400)
        trend = f'Burn rate: {rate:.2f} rows/day, same RC and frozen definition.'
        if rate > 0 and passed < 12:
            projected = now + timedelta(days=(12 - passed) / rate)
            date = projected.astimezone(ZoneInfo('America/New_York')).date().isoformat()
            comparison = 'after target' if date > TARGET else 'within target'
            projection = f'Projected completion: {date} ({comparison}; target {TARGET}).'
    if result['ready']:
        projection = f'All rows PASS as of {result["as_of"]}; target {TARGET}.'
    lines = [f'Tater launch-ready result — {result["as_of"]}',
             'This dated 12-row result explicitly supersedes stale “Progress: 34/79”.',
             f'RC SHA: `{result["rc_sha"]}`. Definition: `{DEFINITION}`.',
             f'Gate: {"PASS" if result["ready"] else "FAIL"}; {12-passed}/12 remaining. UNKNOWN counts as FAIL.',
             trend, projection, '', '| Row | Status | Evidence assessment |', '| --- | --- | --- |']
    for row in result['rows']:
        reason = str(row.get('reason', 'unspecified')).replace('|', '\\|').replace('\n', ' ')[:400]
        lines.append(f'| {row["id"]} | {row["status"]} | {reason} |')
    if result.get('configuration_errors'):
        lines.append('\nConfiguration errors prevent acceptance; inspect result.json.')
    lines.append('\nAutomated evidence only. Alarm routing and daily publication: AUG-1268.')
    return '\n'.join(lines) + '\n'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('result', type=Path)
    p.add_argument('--history', type=Path)
    p.add_argument('--out', type=Path, required=True)
    args = p.parse_args()
    history = json.loads(args.history.read_text()) if args.history else []
    if not isinstance(history, list):
        raise ValueError('history must be a JSON list of prior results')
    args.out.write_text(render(json.loads(args.result.read_text()), history))
    return 0  # Formatting a FAIL report succeeds; it never changes the checker exit.


if __name__ == '__main__':
    raise SystemExit(main())
