#!/usr/bin/env python3
"""Offline PG17 single-user verification: no sockets, services, network or live DB."""
import json, os, pathlib, subprocess, tempfile, sys
import runpy
check_guard = runpy.run_path(str(pathlib.Path(__file__).with_name("guest-guard-catalog.py")))["check"]
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
 harness=(here/'offline-bootstrap.sql').read_text()
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
 compare(root/'schema-snapshot/baseline.json','baseline prefix equals historical baseline.json')
 run((root/'tests/default-privileges.sql').read_text(),'baseline default privilege fixture',True,'DEFAULT_TABLE_PRIVILEGE')
 up=(root/'migrations/20261027120000_sync_foundation.sql').read_text()
 run(up,'foundation apply')
 m2_catalog=catalog()
 guard=(root/'migrations/20261027130000_guest_write_guard.sql').read_text()
 guard_down=(root/'rollback/20261027130000_guest_write_guard.down.sql').read_text()
 run(guard,'guest guard apply')
 # Verify unexpected SQLSTATEs aggregate across savepoint rollback without aborting.
 helper=(root/'tests/guest-write-guard.sql').read_text().split('INSERT INTO auth.users',1)[0]
 run(helper+"""
 SAVEPOINT helper_case;
 SELECT pg_temp.probe('SELECT public.m2b_nonexistent_function()',true,'helper unexpected SQLSTATE');
 ROLLBACK TO helper_case; RELEASE helper_case;
 SAVEPOINT helper_case;
 SELECT pg_temp.probe('SELECT 1',true,'helper unexpected success');
 ROLLBACK TO helper_case; RELEASE helper_case;
 DO $$ BEGIN IF (SELECT last_value FROM pg_temp.probe_failures) <> 2 THEN RAISE EXCEPTION 'probe failure aggregation lost'; END IF; END $$;
 ROLLBACK;
 """,'probe helper aggregates unexpected SQLSTATE and success across rollback')
 run("DO $$ BEGIN IF has_column_privilege('authenticated','public.profiles','is_premium','UPDATE') OR NOT has_column_privilege('authenticated','public.profiles','display_name','UPDATE') THEN RAISE EXCEPTION 'profile ACL'; END IF; END $$;",'profile entitlement ACL')
 entries=json.loads((here/'expected-ledger.json').read_text())[:-1]
 run('\n'.join("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('%s','%s');" % (e['version'],e['name']) for e in entries),'full local ledger seed')
 raw=catalog()
 check_guard(m2_catalog,raw)
 ledger(raw,'local')
 print('PASS: ten-entry local ledger (live expectation is applied eleven)')
 expected=root/'schema-snapshot/expected-m2b.json'
 compare(expected,'M2b catalog equals expected-m2b.json')
 m3=(root/'migrations/20261028162155_tournament_rounds_live.sql').read_text()
 m3_down=(root/'rollback/20261028162155_tournament_rounds_live.down.sql').read_text()
 run(m3,'M3 apply')
 raw_m3=catalog()
 m3_expected=root/'schema-snapshot/expected-m3.json'
 if '--record' in sys.argv: m3_expected.write_text(json.dumps(normalize(raw_m3),indent=2,sort_keys=True)+'\n')
 compare(m3_expected,'M3 catalog equals expected-m3.json')
 run((root/'tests/default-privileges.sql').read_text(),'future defaults closed')
 run((root/'tests/foundation.sql').read_text(),'foundation role/join/CAS fixtures on M3')
 print('SKIP: raw RLS row filtering and event-trigger firing in single-user mode; mandatory in CI')
 run((root/'tests/legacy-compatibility.sql').read_text(),'legacy publish/watch/chat flags-off gate on M3')
 run((root/'tests/m3-acl.sql').read_text(),'M3 ACL, two-client sync and offline replay')
 run("BEGIN; INSERT INTO auth.users(id) VALUES('10000000-0000-0000-0000-000000000099'); INSERT INTO public.contests(id,owner_id,course,protocol,sync_enabled,invite_code,is_tournament) VALUES('22000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000099','{}',1,true,'M3DOWN',true);\n"+m3_down+'\nROLLBACK;','M3 rollback refuses a tournament',True,'M3_DOWN_UNSAFE')
 run(m3,'M3 reapply')
 compare(m3_expected,'M3 reapply exact catalog')
 run(m3_down,'M3 rollback')
 assert not differences(raw,catalog()), 'M3 down exact M2b catalog'
 print('PASS: M3 down exact M2b catalog')
 run(guard_down,'guest guard rollback')
 assert not differences(m2_catalog,catalog()), 'M2b down exact M2 catalog'
 print('PASS: M2b down exact M2 catalog')
 down=(root/'rollback/20261027120000_sync_foundation.down.sql').read_text()
 run("BEGIN; INSERT INTO auth.users(id) VALUES('10000000-0000-0000-0000-000000000001'); INSERT INTO public.contests(owner_id,course,invite_code,protocol) VALUES('10000000-0000-0000-0000-000000000001','{}','ABCDEF',1);\n"+down+'\nROLLBACK;','rollback refuses enrolled data',True,'M2_DOWN_UNSAFE')
 run(down,'rollback')
 compare(root/'schema-snapshot/baseline.json','rollback exact baseline catalog')
 run(up,'reapply')
 run(guard,'guest guard reapply')
 run(m3,'M3 reapply after foundation')
 compare(m3_expected,'reapply exact M3 catalog')
