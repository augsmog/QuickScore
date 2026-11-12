#!/usr/bin/env python3
"""Offline PG17, single-user mode: no sockets and no live DB configuration."""
import os
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parent.parent
pg = pathlib.Path(os.environ.get('PGBIN', '/usr/lib/postgresql/17/bin'))
if not all((pg / name).is_file() for name in ('initdb', 'postgres')):
    raise SystemExit('BLOCKED: PostgreSQL server binaries initdb/postgres are unavailable; no database was contacted.')
with tempfile.TemporaryDirectory(prefix='aug84-', dir=os.environ.get('TMPDIR')) as tmp:
    db = pathlib.Path(tmp) / 'db'
    subprocess.run([str(pg/'initdb'), '-D', str(db), '-U', 'postgres', '-A', 'trust'], check=True, stdout=subprocess.DEVNULL)
    def run(sql, label):
        result = subprocess.run([str(pg/'postgres'), '--single', '-D', str(db), '-j', 'postgres'], input=sql, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if result.returncode or 'ERROR:' in result.stdout or 'FATAL:' in result.stdout:
            print(result.stdout)
            raise SystemExit('FAIL: ' + label)
        print('PASS: ' + label)
    run((root/'schema-drift/offline-bootstrap.sql').read_text() + '''
ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb, ADD COLUMN created_at timestamptz, ADD COLUMN last_sign_in_at timestamptz;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated,anon;
CREATE SCHEMA net;
CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
CREATE SCHEMA realtime;
CREATE TABLE realtime.messages(payload jsonb,event text,topic text,private boolean,extension text DEFAULT 'broadcast');
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT SELECT,INSERT ON realtime.messages TO authenticated;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('realtime.topic',true) $$;
CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.messages(payload,event,topic,private) VALUES($1,$2,$3,$4) $$;
''', 'local platform stubs')
    for migration in sorted((root/'migrations').glob('*.sql')):
        run(migration.read_text(), migration.name)
    run((root/'proposed/20261103071000_account_handoff.sql').read_text(), 'proposed account handoff migration')
    run((root/'tests/account-handoff.sql').read_text(), 'merge, idempotency, no duplicate rounds, conflict rule, RLS and capability denial')
