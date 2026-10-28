#!/usr/bin/env python3
"""Fail if a post-snapshot migration names a public table or column that the
live snapshot and earlier migrations never created. Also rejects client
.table access to anything outside that set, including hole_scores.
"""
import json, pathlib, re, sys
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SNAPSHOT = ROOT / 'snapshots' / 'live-schema.json'
BASELINE_VERSION = '20261027000000'
CONSTRAINT = {'constraint', 'primary', 'unique', 'check', 'foreign', 'exclude'}

def snapshot_schema():
    raw = json.loads(SNAPSHOT.read_text())
    tables = {}
    for row in raw['columns']:
        tables.setdefault(row['table'], set()).add(row['col'])
    for name, rel in (raw.get('regclass_checks') or {}).items():
        if rel is None:
            tables.pop(name, None)
    return tables

def strip_comments(sql):
    out, i, n = [], 0, len(sql)
    while i < n:
        if sql[i] == "'":
            j = i + 1
            while j < n:
                if sql.startswith("''", j):
                    j += 2
                    continue
                if sql[j] == "'":
                    j += 1
                    break
                j += 1
            out.append("''")
            i = j
            continue
        if sql[i] == '$':
            tag = re.match(r'\$[A-Za-z0-9_]*\$', sql[i:])
            if tag:
                token = tag.group(0)
                end = sql.find(token, i + len(token))
                stop = end if end >= 0 else n
                out.append(token + strip_comments(sql[i + len(token):stop]) + (token if end >= 0 else ''))
                i = stop + (len(token) if end >= 0 else 0)
                continue
        if sql.startswith('--', i):
            nl = sql.find('\n', i)
            i = n if nl < 0 else nl
            continue
        if sql.startswith('/*', i):
            end = sql.find('*/', i + 2)
            i = n if end < 0 else end + 2
            continue
        out.append(sql[i])
        i += 1
    return ''.join(out)

def statements(sql):
    text, parts, buf, i, depth = strip_comments(sql), [], [], 0, 0
    while i < len(text):
        if text[i] == '$':
            tag = re.match(r'\$[A-Za-z0-9_]*\$', text[i:])
            if tag:
                token = tag.group(0)
                end = text.find(token, i + len(token))
                stop = end + len(token) if end >= 0 else len(text)
                buf.append(text[i:stop])
                i = stop
                continue
        if text[i] == '(':
            depth += 1
        elif text[i] == ')' and depth:
            depth -= 1
        elif text[i] == ';' and depth == 0:
            part = ''.join(buf).strip()
            if part:
                parts.append(part)
            buf, i = [], i + 1
            continue
        buf.append(text[i])
        i += 1
    tail = ''.join(buf).strip()
    if tail:
        parts.append(tail)
    return parts

def _idents(body):
    cols = []
    depth = 0
    start = 0
    for i, ch in enumerate(body + ','):
        if ch == '(':
            depth += 1
        elif ch == ')' and depth:
            depth -= 1
        elif ch == ',' and depth == 0:
            piece = body[start:i].strip()
            start = i + 1
            match = re.match(r'(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))', piece)
            if not match:
                continue
            name = (match.group(1) or match.group(2)).lower()
            if name not in CONSTRAINT:
                cols.append(name)
    return cols

def apply_sql(tables, sql, label):
    errors = []
    for stmt in statements(sql):
        created = re.search(r'\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(', stmt, re.I | re.S)
        if created:
            name = created.group(1).lower()
            body_start = created.end() - 1
            depth = 0
            for i, ch in enumerate(stmt[body_start:], body_start):
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0:
                        tables.setdefault(name, set()).update(_idents(stmt[body_start + 1:i]))
                        break
        altered = re.search(r'\balter\s+table\s+(?:if\s+exists\s+|only\s+)*public\.(\w+)', stmt, re.I)
        table = altered.group(1).lower() if altered else None
        if altered and table not in tables:
            errors.append(f'{label}: ALTER TABLE public.{table} is not in the snapshot or prior migrations')
            continue
        if table:
            for col in re.findall(r'\badd\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)', stmt, re.I):
                tables[table].add(col.lower())
            for col in re.findall(r'\bdrop\s+column\s+(?:if\s+exists\s+)?(\w+)', stmt, re.I):
                tables[table].discard(col.lower())
            for col in re.findall(r'\balter\s+column\s+(\w+)', stmt, re.I):
                if col.lower() not in tables[table]:
                    errors.append(f'{label}: column public.{table}.{col} is not in the snapshot or prior migrations')
        for name in re.findall(r'\b(?:from|join|update|into|table|on|references|truncate)\s+public\.(\w+)', stmt, re.I):
            if name.lower() not in tables:
                errors.append(f'{label}: public.{name} is not in the snapshot or prior migrations')
        for name, cols in re.findall(r'\binsert\s+into\s+public\.(\w+)\s*\(([^)]*)\)', stmt, re.I | re.S):
            known = tables.get(name.lower())
            if known is None:
                continue
            for col in _idents(cols):
                if col not in known:
                    errors.append(f'{label}: column public.{name}.{col} is not in the snapshot or prior migrations')
        for name, assigns in re.findall(r'\bupdate\s+public\.(\w+)\s+set\s+(.*?)(?:\bwhere\b|\breturning\b|$)', stmt, re.I | re.S):
            known = tables.get(name.lower())
            if known is None:
                continue
            depth = 0
            start = 0
            chunks = []
            for i, ch in enumerate(assigns + ','):
                if ch == '(':
                    depth += 1
                elif ch == ')' and depth:
                    depth -= 1
                elif ch == ',' and depth == 0:
                    chunks.append(assigns[start:i])
                    start = i + 1
            for chunk in chunks:
                col = re.match(r'\s*(\w+)\s*=', chunk)
                if col and col.group(1).lower() not in known and col.group(1).lower() not in {'set'}:
                    errors.append(f'{label}: column public.{name}.{col.group(1)} is not in the snapshot or prior migrations')
        for name, cols in re.findall(r'\bon\s+public\.(\w+)\s*\(([^)]*)\)', stmt, re.I | re.S):
            known = tables.get(name.lower())
            if known is None:
                continue
            for col in re.findall(r'[A-Za-z_][A-Za-z0-9_]*', cols):
                if col.lower() in {'asc', 'desc', 'nulls', 'first', 'last', 'and', 'or', 'where', 'not', 'is', 'null', 'distinct'}:
                    continue
                if col.lower() not in known:
                    errors.append(f'{label}: column public.{name}.{col} is not in the snapshot or prior migrations')
        for name in re.findall(r'\bdrop\s+table\s+(?:if\s+exists\s+)?public\.(\w+)', stmt, re.I):
            tables.pop(name.lower(), None)
    return errors

def migration_files():
    files = sorted((ROOT / 'migrations').glob('*.sql'))
    return [path for path in files if path.name[:14] > BASELINE_VERSION]

def audit_migrations():
    tables = snapshot_schema()
    errors = []
    for path in migration_files():
        errors.extend(apply_sql(tables, path.read_text(), path.name))
    return tables, errors

def audit_client(tables):
    errors = []
    caller = re.compile(r"\.from\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]\s*\)")
    for path in (ROOT.parent / 'src').rglob('*'):
        if path.suffix not in {'.ts', '.tsx'} or path.name == 'schema.ts':
            continue
        text = strip_comments(path.read_text())
        if re.search(r'\bhole_scores\b', text):
            errors.append(f'{path.relative_to(ROOT.parent)}: hole_scores is not in the live snapshot')
        for name in caller.findall(text):
            if name not in tables:
                errors.append(f'{path.relative_to(ROOT.parent)}: .from({name}) is not in the snapshot or prior migrations')
    return errors

def main():
    tables, errors = audit_migrations()
    errors.extend(audit_client(tables))
    archived = (ROOT / 'archive/pre-baseline/008_tournament_rounds.sql').read_text()
    base = snapshot_schema()
    for path in migration_files():
        if path.name.startswith('20261028100000'):
            break
        apply_sql(base, path.read_text(), path.name)
    archived_errors = apply_sql(base, archived, 'archive/008_tournament_rounds.sql')
    if not archived_errors:
        errors.append('archived 008 was accepted against the live snapshot')
    hole = apply_sql(snapshot_schema(), 'ALTER TABLE public.hole_scores ADD COLUMN extra int;', 'fixture')
    if not any('hole_scores' in item for item in hole):
        errors.append('hole_scores fixture was not rejected')
    column = apply_sql(snapshot_schema(), 'ALTER TABLE public.contests ADD COLUMN extra int; UPDATE public.contests SET missing = 1;', 'fixture')
    if not any('contests.missing' in item for item in column):
        errors.append('missing column fixture was not rejected')
    if errors:
        print('\n'.join(errors))
        return 1
    print(f'PASS: reference guard ({len(migration_files())} post-snapshot migrations; archived 008 rejected)')
    return 0

if __name__ == '__main__':
    sys.exit(main())
