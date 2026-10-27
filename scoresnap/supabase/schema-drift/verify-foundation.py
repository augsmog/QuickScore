#!/usr/bin/env python3
"""Offline PG17 single-user verification: no sockets, services, network or live DB."""
import json, os, pathlib, subprocess, tempfile, sys
from drift import differences, normalize, ledger
from platform_ext import inject
here=pathlib.Path(__file__).resolve().parent
root=here.parent
pg=pathlib.Path(os.environ.get('PGBIN','/usr/lib/postgresql/17/bin'))
with tempfile.TemporaryDirectory() as tmp:
 db=pathlib.Path(tmp)/'db'
 subprocess.run([str(pg/'initdb'),'-D',str(db),'-U','postgres','-A','trust'],check=True,stdout=subprocess.DEVNULL)
 def run(sql,label,fail=False,expected_error=None):
  p=subprocess.run([str(pg/'postgres'),'--single','-D',str(db),'-c','wal_level=logical','-j','postgres'],input="SET m2.single_user='on';\n"+sql,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  errors='ERROR:' in p.stdout or 'FATAL:' in p.stdout
  if errors != fail:
   print(p.stdout); raise AssertionError(label)
  if expected_error:
   assert expected_error in p.stdout, p.stdout
   print(next(line for line in p.stdout.splitlines() if 'ERROR:' in line))
  print(('EXPECTED RED: ' if fail else 'PASS: ')+label)
  return p.stdout
 stub='''CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin; CREATE ROLE authenticator; CREATE ROLE supabase_realtime_admin;
 CREATE SCHEMA auth; CREATE SCHEMA extensions;
 CREATE EXTENSION pgcrypto SCHEMA extensions; CREATE EXTENSION "uuid-ossp" SCHEMA extensions;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb,created_at timestamptz,last_sign_in_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT auth.jwt()->>'role' $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated;
 CREATE PUBLICATION supabase_realtime;
 CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
 '''
 # Keep hosted attributes, memberships and platform defaults identical to M1's offline harness.
 harness=(here/'verify-offline.sh').read_text()
 roles=harness.split('-- Hosted role attributes/memberships',1)[1].split('CREATE SCHEMA auth;',1)[0]
 # Plain PG17 lacks pg_graphql; only that extension inventory is injected below.
 defaults=(here/'platform-emulation.sql').read_text().replace('CREATE EXTENSION IF NOT EXISTS pg_graphql;', '')
 run(stub+'\n-- Hosted role attributes/memberships'+roles+'\n'+defaults,'auth stubs and hosted platform emulation')
 baseline=root/'migrations/20261027000000_live_baseline.sql'
 run(baseline.read_text(),'baseline')
 def catalog():
  out=run((here/'catalog-query.sql').read_text(),'extract catalog')
  return inject(json.loads((root/'schema-snapshot/live.json').read_text()), json.JSONDecoder().raw_decode(out.split('catalog = "',1)[1])[0])
 def compare(expected,label):
  diff=differences(json.loads(expected.read_text()),catalog())
  if diff: print('\n'.join(diff)); raise AssertionError(label)
  print('PASS: '+label)
 compare(root/'schema-snapshot/live.json','baseline prefix equals PRE-APPLY live.json')
 run((root/'tests/default-privileges.sql').read_text(),'baseline default privilege fixture',True,'DEFAULT_TABLE_PRIVILEGE')
 up=(root/'migrations/20261027120000_sync_foundation.sql').read_text()
 run(up,'foundation apply')
 entries=json.loads((here/'expected-ledger.json').read_text())+[{'version':'20261027000000','name':'live_baseline'},{'version':'20261027120000','name':'sync_foundation'}]
 run('\n'.join("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('%s','%s');" % (e['version'],e['name']) for e in entries),'full local ledger seed')
 raw=catalog()
 ledger(raw,'local')
 print('PASS: nine-entry local ledger (live expectation remains seven)')
 expected=root/'schema-snapshot/expected-after.json'
 if '--record' in sys.argv: expected.write_text(json.dumps(normalize(raw),indent=2,sort_keys=True)+'\n')
 compare(expected,'full chain equals expected-after.json')
 run((root/'tests/default-privileges.sql').read_text(),'future defaults closed')
 run((root/'tests/foundation.sql').read_text(),'foundation role/join/CAS fixtures')
 print('SKIP: raw RLS row filtering and event-trigger firing in single-user mode; mandatory in CI')
 run((root/'tests/legacy-compatibility.sql').read_text(),'legacy publish/watch/chat flags-off gate')
 down=(root/'rollback/20261027120000_sync_foundation.down.sql').read_text()
 run("BEGIN; INSERT INTO auth.users(id) VALUES('10000000-0000-0000-0000-000000000001'); INSERT INTO public.contests(owner_id,course,invite_code,protocol) VALUES('10000000-0000-0000-0000-000000000001','{}','ABCDEF',1);\n"+down+'\nROLLBACK;','rollback refuses enrolled data',True,'M2_DOWN_UNSAFE')
 run(down,'rollback')
 compare(root/'schema-snapshot/live.json','rollback exact baseline catalog')
 run(up,'reapply')
 compare(expected,'reapply exact expected catalog')
