#!/usr/bin/env python3
"""Validate the read-only App Review reply kit and its evidence pointers."""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path('/workspace/aos-state')
KIT = Path('snapscore/reply-kit-20261109/REPLY-KIT.md')
SCANNER = Path('snapscore/appreview_packet_scan.py')
COUNT_FILE = Path('snapscore/game-count-20261030.md')
EXPECTED = (
    'Working demo account',
    'Subscription restoration',
    'EULA, Terms, and Privacy links',
    'Reporting or blocking a user',
    'Settlement behavior',
)
CITATION = re.compile(r'`(/workspace/aos-state/[^`#]+)#L([^`]+)`')
LINE_RANGE = re.compile(r'(\d+)-L(\d+)')
CLAIM = re.compile(r'50\+\s+game\s+modes?', re.IGNORECASE)
COUNT = re.compile(r'\|\s*\*\*A\. Selectable and scored end to end\*\*\s*\|[^\n]*?\|\s*\*\*(\d+)\*\*\s*\|', re.IGNORECASE)


def validate(root: Path = ROOT) -> list[str]:
    problems: list[str] = []
    kit_path = root / KIT
    if not kit_path.is_file():
        return ['reply kit file is missing']
    body = kit_path.read_text(encoding='utf-8')
    headings = [re.sub(r'^\d+\.\s*', '', item.strip()) for item in re.findall(r'^## (.+)$', body, re.MULTILINE)]
    for heading in EXPECTED:
        if heading not in headings:
            problems.append(f'missing section: {heading}')
    sections = re.split(r'^## ', body, flags=re.MULTILINE)[1:]
    section_map = {}
    for section in sections:
        title, _, content = section.partition('\n')
        title = re.sub(r'^\d+\.\s*', '', title.strip())
        section_map[title] = content
    for heading in EXPECTED:
        content = section_map.get(heading, '')
        if not re.search(r'\*\*Draft answer:\*\*\s*\S', content):
            problems.append(f'{heading}: missing answer or explicit UNKNOWN')
        for label in ('Draft', 'Evidence'):
            if not re.search(rf'^{label}:\s*`/workspace/aos-state/[^`]+`', content, re.MULTILINE):
                problems.append(f'{heading}: missing {label.lower()} file-and-line pointer or explicit UNKNOWN')
    citations = CITATION.findall(body)
    if not citations:
        problems.append('no file-and-line citations found')
    cited_text = []
    for raw_path, raw_range in citations:
        path = root / raw_path.removeprefix('/workspace/aos-state/').lstrip('/')
        parsed = LINE_RANGE.fullmatch(raw_range)
        if not parsed:
            problems.append(f'malformed line range: {raw_path}#L{raw_range}')
            continue
        first, last = map(int, parsed.groups())
        if not path.is_file():
            problems.append(f'cited file does not exist: {raw_path}')
            continue
        lines = path.read_text(encoding='utf-8').splitlines()
        if first < 1 or last < first or last > len(lines):
            problems.append(f'invalid line range: {raw_path}#L{first}-L{last}')
            continue
        cited_text.extend(lines[first - 1:last])
    scanner = root / SCANNER
    if not scanner.is_file():
        problems.append(f'packet scanner is missing: {scanner}')
    else:
        spec = importlib.util.spec_from_file_location('appreview_packet_scan', scanner)
        module = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(module)
        scan_errors = module.scan(str(kit_path))
        problems.extend(f'packet scan: {item}' for item in scan_errors)
    claim_present = bool(CLAIM.search(body) or CLAIM.search('\n'.join(cited_text)))
    if claim_present:
        count_path = root / COUNT_FILE
        if not count_path.is_file():
            problems.append(f'mode claim present but count record is missing: {count_path}')
        else:
            match = COUNT.search(count_path.read_text(encoding='utf-8'))
            if not match:
                problems.append('mode claim present but selectable/scored count is unreadable')
            elif int(match.group(1)) < 50:
                problems.append(f'mode claim fails: cited count is {match.group(1)}, below 50')
    return problems


def main() -> int:
    problems = validate()
    if problems:
        for problem in problems:
            print(f'KIT-FAIL: {problem}')
        return 1
    print('KIT: PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
