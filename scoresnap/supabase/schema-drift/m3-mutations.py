#!/usr/bin/env python3
"""Disposable loopback only. Each mutation is one transaction that must make the M3 suite fail."""
import argparse, pathlib, subprocess
from urllib.parse import urlsplit
here = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
args = parser.parse_args()
target = urlsplit(args.url)
assert target.scheme == 'postgresql' and target.hostname == '127.0.0.1' and target.username == 'postgres' and target.path == '/postgres' and target.port, 'throwaway loopback PostgreSQL only'
suite = (here.parent / 'tests/m3-acl.sql').read_text()
start = suite.index('BEGIN;')
end = suite.rindex('ROLLBACK;')
assert start >= 0 and end > start and suite[end:].strip() == 'ROLLBACK;'
body = suite[start + len('BEGIN;'):end]
mutations = [
    ('drop m3_score_player_scope', 'DROP POLICY m3_score_player_scope ON public.score_events;'),
    ('non-host can approve', """
CREATE OR REPLACE FUNCTION public.decide_join_request(request_id uuid, approve boolean, player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE public.contest_join_requests SET status = 'approved', decided_at = now() WHERE id = request_id;
  RETURN '{"status":"approved"}'::jsonb;
END $$;
"""),
]
for label, mutation in mutations:
    result = subprocess.run(
        ['psql', args.url, '-X', '-v', 'ON_ERROR_STOP=1'],
        input='BEGIN;\n' + mutation + '\n' + body + '\nROLLBACK;\n',
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode == 0 or 'M3_UNGUARDED:' not in result.stdout:
        raise AssertionError(f'Mutation escaped or failed for an unrelated reason: {label}\n{result.stdout}')
    print(f'PASS: rejected mutation {label}')
print(f'PASS: {len(mutations)} independent M3 mutations, all rolled back')
