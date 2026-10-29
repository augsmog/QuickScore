#!/usr/bin/env python3
"""Fail-closed catalog normalization/comparison; Python stdlib only."""
import argparse, copy, difflib, json, pathlib, re, sys
HERE = pathlib.Path(__file__).resolve().parent
BASELINE = {'version': '20261027000000', 'name': 'live_baseline'}
FOUNDATION = {'version': '20261027120000', 'name': 'sync_foundation'}

def load(p):
    return json.loads(pathlib.Path(p).read_text())

def sql_space(s):
    # Preserve quoted literals/identifiers and dollar bodies; never rewrite SQL data.
    parts = re.split(r"('(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|\$[a-zA-Z_0-9]*\$.*?\$[a-zA-Z_0-9]*\$)", s, flags=re.S)
    return ''.join(p if i % 2 else re.sub(r'\s+', ' ', p) for i, p in enumerate(parts)).strip()

def normalize(raw):
    x = copy.deepcopy(raw)
    # Compare visible column order, not physical attnums left behind by DROP COLUMN.
    for table in {c['table'] for c in x.get('columns', [])}:
        for pos, col in enumerate(sorted((c for c in x['columns'] if c['table']==table), key=lambda c:c['pos']), 1):
            col['pos'] = pos
    rules = load(HERE / 'allowlist.json')
    for k in rules['metadata_fields']:
        x.pop(k, None)
    # Ledger is validated separately, never silently compared as schema.
    x.pop('migrations', None)
    # Preserve inventory and placement; only explicitly named versions may differ.
    extensions = {e['name']: dict(e) for e in x.get('extensions', []) or []}
    for name, e in extensions.items():
        if name in rules['extensions']:
            e.pop('version', None)
    x['extensions'] = list(extensions.values())
    if 'server_version' in x:
        x['server_version_major'] = int(re.match(r'\d+', x.pop('server_version')).group())
    x['default_acls'] = [a for a in x.get('default_acls', []) or [] if a['schema'] == 'public' or a['schema'] == '-']
    def norm(v, key=''):
        if isinstance(v, dict):
            return {k: norm(w, k) for k, w in sorted(v.items())}
        if isinstance(v, list):
            return [norm(w) for w in v] if key in ('labels', 'column_list', 'extension_config', 'extension_condition') else sorted((norm(w) for w in v), key=lambda w: json.dumps(w, sort_keys=True))
        if isinstance(v, str):
            if key == 'acl':
                return '{' + ','.join(sorted(v.strip('{}').split(','))) + '}'
            if key in ('def', 'qual', 'with_check', 'default', 'filter', 'argument_defaults', 'partition_bound'):
                return sql_space(v)
        return v
    return norm({k: ([] if v is None else v) for k,v in x.items()})

def differences(live, local):
    a,b = normalize(live), normalize(local)
    out=[]
    for kind in sorted(a.keys() | b.keys()):
        if a.get(kind) == b.get(kind): continue
        # Unified JSON lines include object names, live/local labels, and exact field values.
        out.extend(difflib.unified_diff(json.dumps(a.get(kind),indent=2,sort_keys=True).splitlines(),json.dumps(b.get(kind),indent=2,sort_keys=True).splitlines(),fromfile=f'live/{kind}',tofile=f'local/{kind}',lineterm=''))
    return out

def ledger(raw, mode):
    # expected-ledger.json is the eleven-row live chain ending in M3.
    # Local keeps the ten-row M2b prefix. Baseline and pre-adoption then drop
    # M2 and M2b; pre-adoption also drops live_baseline.
    expected = load(HERE / ('expected-pending-ledger.json' if mode == 'pending' else 'expected-ledger.json'))
    if mode not in ('live', 'pending'):
        expected = expected[:-1]
    if mode in ('baseline', 'pre-adoption'):
        expected = expected[:-2]
    if mode == 'pre-adoption':
        expected = expected[:-1]
    actual = raw.get('migrations')
    if (actual != expected if mode in ('live','pending') else
            actual is None or sorted(actual,key=lambda m:m['version']) != sorted(expected,key=lambda m:m['version'])):
        raise ValueError(f'{mode} ledger mismatch: expected {expected}; got {actual}')

def main():
    p=argparse.ArgumentParser()
    sub=p.add_subparsers(dest='cmd',required=True)
    n=sub.add_parser('normalize'); n.add_argument('input'); n.add_argument('output')
    c=sub.add_parser('compare'); c.add_argument('live'); c.add_argument('local')
    l=sub.add_parser('ledger'); l.add_argument('input'); l.add_argument('--mode',choices=['live','pending','baseline','local','pre-adoption'],required=True)
    args=p.parse_args()
    if args.cmd=='normalize': pathlib.Path(args.output).write_text(json.dumps(normalize(load(args.input)),indent=2,sort_keys=True)+'\n')
    elif args.cmd=='ledger': ledger(load(args.input),args.mode); print('Ledger matches: '+args.mode)
    else:
        diff=differences(load(args.live),load(args.local))
        if diff: print('\n'.join(diff)); return 1
        print('Schema matches')
    return 0
if __name__=='__main__':
    try: sys.exit(main())
    except (ValueError,KeyError,TypeError) as e: print(str(e),file=sys.stderr); sys.exit(1)
