#!/usr/bin/env python3
"""Disposable CI stack only. One psql session/transaction per independent mutation."""
import argparse, pathlib, re, subprocess
from urllib.parse import urlsplit
here = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
args = parser.parse_args()
target = urlsplit(args.url)
assert target.scheme == 'postgresql' and target.hostname == '127.0.0.1' and target.username == 'postgres' and target.path == '/postgres' and target.port, 'throwaway loopback PostgreSQL only'
up = (here.parent/'migrations/20261027130000_guest_write_guard.sql').read_text()
suite = (here.parent/'tests/guest-write-guard.sql').read_text()
# The enclosing transaction belongs to this runner. Connection close rolls back
# even when ON_ERROR_STOP exits on the expected test failure.
assert suite.startswith('BEGIN;') and suite.rstrip().endswith('ROLLBACK;')
suite = suite[len('BEGIN;'):].rstrip()[:-len('ROLLBACK;')]
mutations = []
for policy, table in re.findall(r'CREATE POLICY (m2b_\w+) ON public\.(\w+)', up):
    mutations.append((policy, f'DROP POLICY {policy} ON public.{table};'))
# Expand each revoked ACL independently, including those already absent at M2.
for privs, tables, roles in re.findall(r'REVOKE ([A-Z, ]+) ON (public\.[\w., ]+) FROM ([\w, ]+);', up):
    for table in tables.split(','):
        for role in roles.split(','):
            for priv in privs.split(','):
                sql = f'GRANT {priv.strip()} ON {table.strip()} TO {role.strip()};'
                mutations.append((sql, sql))
# Removing the presentation grant must break positive profile regressions too.
mutations.append(('presentation columns', 'REVOKE UPDATE (display_name, avatar_url) ON public.profiles FROM authenticated;'))
# TRUNCATE ONLY avoids an unrelated child table's revoked ACL masking a
# restored target grant. Its FK error is a valid mutation kill: expected 42501
# was replaced by 0A000 after the target permission check passed.
seen = set()
for label, mutation in mutations:
    if mutation in seen:
        continue
    seen.add(mutation)
    result = subprocess.run(['psql', args.url, '-X', '-v', 'ON_ERROR_STOP=1'],
                            input='BEGIN;\n'+mutation+'\n'+suite+'\nROLLBACK;\n',
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode == 0 or 'M2B_SUITE_FAILED:' not in result.stdout or not any(marker in result.stdout for marker in
            ('M2B_UNGUARDED:', 'M2B_EXPECTED_UPDATE:', 'M2B_UNEXPECTED_SQLSTATE:')):
        raise AssertionError(f'Mutation escaped or failed for an unrelated reason: {label}\n{result.stdout}')
    print(f'PASS: rejected mutation {label}')
print(f'PASS: {len(seen)} independent policy/ACL mutations, all rolled back')
