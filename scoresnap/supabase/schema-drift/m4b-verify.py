#!/usr/bin/env python3
"""Local SQL proof. Real Auth/Realtime transport remains an integration gate."""
import json, pathlib, subprocess, sys, time, os
from urllib.parse import urlsplit
from drift import normalize, differences
from platform_ext import inject
here=pathlib.Path(__file__).resolve().parent
root=here.parent
if sys.argv[1]=='catalog':
 raw=json.loads(pathlib.Path(sys.argv[2]).read_text())
 raw=inject(json.loads((root/'schema-snapshot/live.json').read_text()),raw)
 path=root/'schema-snapshot/expected-after.json'
 if sys.argv[3]=='record': path.write_text(json.dumps(normalize(raw),indent=2,sort_keys=True)+'\n')
 diff=differences(json.loads(path.read_text()),raw)
 assert not diff,'\n'.join(diff)
 print('PASS: full-chain catalog equals expected-after.json')
 sys.exit()
url=sys.argv[2]; target=urlsplit(url)
assert target.scheme=='postgresql' and not target.query and not target.fragment and target.password is None and target.hostname=='127.0.0.1' and target.username=='postgres' and target.path=='/postgres' and target.port
cmd=['psql',url,'-X','-At','-v','ON_ERROR_STOP=1','-v','m4b_native=true']
def run(sql,fail=False,marker=None):
 p=subprocess.run(cmd,input=sql,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 assert (p.returncode!=0)==fail,p.stdout
 if marker: assert marker in p.stdout,p.stdout
 return p.stdout
# Each mutation is transactional, and must trip a semantic assertion, not SQL setup.
suite=(root/'tests/m4b-api.sql').read_text().removeprefix('BEGIN;').removesuffix('\n')
suite=suite[:suite.rfind('ROLLBACK;')]
security=(root/'tests/m5-security.sql').read_text().removeprefix('BEGIN;')
suite+=security[:security.rfind('ROLLBACK;')]
mutations=[]
for table in ['contest_memberships','contest_join_requests','operation_receipts','contest_rounds','contest_groups','round_player_assignments','round_scorer_scopes','group_submissions','sync_id_map','sync_join_budgets']:
 for role in ['anon','authenticated']:
  for priv in ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
   mutations.append((f'{table}/{role}/{priv}',f'GRANT {priv} ON public.{table} TO {role};'))
for sig in ['sync_score_cache()','sync_revision_hint()','sync_legacy_projection(uuid)','sync_course(jsonb)']:
 for role in ['anon','authenticated']:
  mutations.append((sig+'/'+role,f'GRANT EXECUTE ON FUNCTION public.{sig} TO {role};'))
for sig in ['submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint)','fetch_snapshot(uuid,bigint)','revoke_membership(uuid,uuid)','enroll_contest(uuid,bigint)','sync_capabilities(uuid)','my_sync_status()','can_receive_sync(text)','submit_group(uuid,uuid,uuid,bigint)','finalize_tournament(uuid,bigint)']:
 mutations.append((sig+'/anon',f'GRANT EXECUTE ON FUNCTION public.{sig} TO anon;'))
 mutations.append((sig+'/authenticated',f'REVOKE EXECUTE ON FUNCTION public.{sig} FROM authenticated;'))
definition=run("SELECT pg_get_functiondef('public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint)'::regprocedure);")+';\n'
mutations += [('CAS disabled',definition.replace('version<>$7 OR ($10 IS NOT NULL AND c.sync_revision<>$10)','false')),('authorization disabled',definition.replace('IF NOT allowed THEN','IF false THEN'))]
mutations += [('receive guard RLS','DROP POLICY m4b_receive_guard ON realtime.messages; CREATE POLICY unsafe_receive ON realtime.messages FOR SELECT TO authenticated USING(true);'),('receive RLS','DROP POLICY m4b_receive ON realtime.messages;'),('send RLS','DROP POLICY m4b_send_guard ON realtime.messages; CREATE POLICY unsafe_send ON realtime.messages FOR INSERT TO authenticated WITH CHECK(true);')]
status_definition=run("SELECT pg_get_functiondef('public.my_sync_status()'::regprocedure);")+';\n'
mutations += [('discovery membership privacy',status_definition.replace('m.user_id=auth.uid()', 'true')),('discovery request privacy',status_definition.replace('q.requester=auth.uid()', 'true'))]
snapshot_definition=run("SELECT pg_get_functiondef('public.fetch_snapshot(uuid,bigint)'::regprocedure);")+';\n'
mutations += [('snapshot cell versions',snapshot_definition.replace("'version',coalesce(e.cell_version,0)", "'version',0")),('snapshot course',snapshot_definition.replace('public.sync_course(coalesce(r.course_data,c.course))','public.sync_course(c.course)')),('snapshot mapping',snapshot_definition.replace('WHERE m.contest_id=c.id','WHERE false'))]
capability_definition=run("SELECT pg_get_functiondef('public.sync_capabilities(uuid)'::regprocedure);")+';\n'
mutations += [('capability ignores pause',capability_definition.replace("c.sync_enabled AND c.protocol=1 AND c.status='active'", 'true'))]
for label,sql in mutations:
 if sql.startswith('REVOKE EXECUTE'):
  output=run('BEGIN;'+sql+suite+'ROLLBACK;',True)
  assert 'M4B_ASSERT:' in output or 'permission denied for function' in output,output
 else: run('BEGIN;'+sql+suite+'ROLLBACK;',True,'M4B_ASSERT:')
print(f'PASS: {len(mutations)} M4b ACL/RLS mutations all RED')
H='51000000-0000-0000-0000-000000000001'; U='51000000-0000-0000-0000-000000000002'; C='52000000-0000-0000-0000-000000000001'; P='53000000-0000-0000-0000-000000000001'
def identity(uid): return f'''SET ROLE authenticated; SET request.jwt.claims='{{"sub":"{uid}","role":"authenticated","is_anonymous":false}}';'''
def write(op,hole=1,version=0): return f"SELECT public.write_score('{C}',NULL,'{P}',{hole},'set',4,{version},'{op}','race');"
def revoke(): return f"SELECT public.revoke_membership('{C}','{U}');"
def seed():
 run(f"INSERT INTO auth.users(id) VALUES('{H}'),('{U}'); INSERT INTO public.contests(id,owner_id,course,protocol,sync_enabled,invite_code) VALUES('{C}','{H}','{{}}',1,true,'M4BRAC'); INSERT INTO public.contest_players(id,contest_id,name) VALUES('{P}','{C}','Race'); INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES('{C}','{U}','player','{P}','approved');")
def cleanup():
 run(f"DELETE FROM public.contests WHERE id='{C}'; DELETE FROM auth.users WHERE id IN ('{H}','{U}'); DELETE FROM realtime.messages WHERE topic='snapscore:{C}';")
def race(first,second,expected):
 # A holds the common lock; B must be observed waiting on a PostgreSQL lock.
 a=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
 a.stdin.write('BEGIN;'+first+"SELECT 'M4B_READY';\n"); a.stdin.flush()
 out=''
 while 'M4B_READY' not in out:
  line=a.stdout.readline(); assert line, out; out+=line
 b=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env={**os.environ,'PGAPPNAME':'m4b-contender'})
 b.stdin.write(second);b.stdin.close();b.stdin=None
 deadline=time.monotonic()+8
 while time.monotonic()<deadline:
  if run("SELECT count(*) FROM pg_stat_activity WHERE application_name='m4b-contender' AND wait_event_type='Lock';").strip()=='1':break
  assert b.poll() is None,'contender bypassed common contest lock'
  time.sleep(.02)
 else: raise AssertionError('contender never observed waiting on lock')
 a.stdin.write('COMMIT;\n');a.stdin.close();a.stdin=None
 tail=a.communicate(timeout=10)[0]; assert a.returncode==0,out+tail
 bout=b.communicate(timeout=10)[0]
 assert expected in bout,bout
 return bout
try:
 seed()
 op1='54000000-0000-0000-0000-000000000001';op2='54000000-0000-0000-0000-000000000002'
 # Deliberately remove the contest lock on this disposable target. Require the
 # precise first-cell uniqueness failure; an infrastructure error is not red proof.
 run(definition.replace('WHERE id=$1 FOR UPDATE;', 'WHERE id=$1;'))
 try:
  race(identity(U)+write(op1),identity(H)+write(op2),'score_events_cell_version')
  print('EXPECTED RED: unsafe no-lock first-cell race hit unique cell constraint')
 finally:
  run(definition)
  cleanup();seed()
 race(identity(U)+write(op1),identity(U)+write(op2),'conflict')
 assert run(f"SELECT count(*) FROM public.score_events WHERE contest_id='{C}';").strip()=='1'
 print('PASS: two-session absent-cell CAS (one accept/one conflict)')
 race(identity(U)+write('54000000-0000-0000-0000-000000000003',1,1),identity(U)+write('54000000-0000-0000-0000-000000000004',1,1),'conflict')
 print('PASS: two-session existing-cell CAS')
 race(identity(U)+write('54000000-0000-0000-0000-000000000010',3),identity(U)+write('54000000-0000-0000-0000-000000000011',4),'accepted')
 print('PASS: simultaneous distinct-cell writes both accepted')
 race(identity(H)+revoke(),identity(U)+write('54000000-0000-0000-0000-000000000005',2),'FORBIDDEN')
 print('PASS: revoke locks first -> queued write denied')
 cleanup();seed()
 race(identity(U)+write(op1),identity(H)+revoke(),'revoked')
 run(identity(U)+f"SELECT public.fetch_snapshot('{C}');",True,'FORBIDDEN')
 print('PASS: write locks first -> accepted then revoked; subsequent fetch denied')
 cleanup();seed()
 # Transfer uses the same lock, and old credentials never authorize replay.
 request=run(identity('51000000-0000-0000-0000-000000000002')+"SELECT public.request_join('M4BRAC','Pending');")
 # Use a third distinct identity to claim the occupied slot.
 V='51000000-0000-0000-0000-000000000003'
 run(f"INSERT INTO auth.users(id) VALUES('{V}');")
 run(identity(V)+"SELECT public.request_join('M4BRAC','Recovery');")
 req=run(f"SELECT id FROM public.contest_join_requests WHERE contest_id='{C}' AND requester='{V}';").strip()
 transfer=identity(H)+f"SELECT public.decide_join_request('{req}',true,'{P}');"
 race(transfer,identity(U)+write(op1),'FORBIDDEN')
 run(identity(U)+f"SELECT public.fetch_snapshot('{C}');",True,'FORBIDDEN')
 print('PASS: transfer locks first -> old identity queued write/fetch denied')
 cleanup(); run(f"DELETE FROM auth.users WHERE id='{V}';");seed()
 run(f"INSERT INTO auth.users(id) VALUES('{V}');")
 run(identity(V)+"SELECT public.request_join('M4BRAC','Recovery');")
 req=run(f"SELECT id FROM public.contest_join_requests WHERE contest_id='{C}' AND requester='{V}';").strip()
 race(identity(U)+write(op1),identity(H)+f"SELECT public.decide_join_request('{req}',true,'{P}');",'approved')
 run(identity(U)+write(op1),True,'FORBIDDEN')
 print('PASS: write locks first -> accepted, transfer revokes old replay')
 cleanup();run(f"DELETE FROM auth.users WHERE id='{V}';");seed()
 race(identity(U)+f"SELECT public.fetch_snapshot('{C}');",identity(H)+revoke(),'revoked')
 run(identity(U)+f"SELECT public.fetch_snapshot('{C}');",True,'FORBIDDEN')
 cleanup();seed()
 race(identity(H)+revoke(),identity(U)+f"SELECT public.fetch_snapshot('{C}');",'FORBIDDEN')
 print('PASS: fetch/revoke in both lock orders')
 cleanup();seed()
 # Final-schema group completion: two real sessions, both lock orders.
 def group_seed():
  run(f"UPDATE public.contests SET course='{{\"holes\":[{{\"num\":1,\"par\":4}}]}}' WHERE id='{C}'; UPDATE public.contest_rounds SET id='55000000-0000-0000-0000-000000000001',course_data=NULL WHERE contest_id='{C}' AND round_number=1; INSERT INTO public.contest_groups(id,contest_id,round_id,name) VALUES('56000000-0000-0000-0000-000000000001','{C}','55000000-0000-0000-0000-000000000001','Group'); INSERT INTO public.round_player_assignments(contest_id,round_id,player_id,group_id) VALUES('{C}','55000000-0000-0000-0000-000000000001','{P}','56000000-0000-0000-0000-000000000001');")
  run(identity(H)+write(op1))
 def rev(): return int(run(f"SELECT sync_revision FROM public.contests WHERE id='{C}';").strip())
 def submit(expected): return f"SELECT public.submit_group('{C}','55000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000001',{expected});"
 def finalize(expected): return f"SELECT public.finalize_tournament('{C}',{expected});"
 group_seed()
 # Ordinary player is not an assigned group scorer; direct table writes stay denied.
 run(identity(U)+submit(rev()),True,'SCORER_REQUIRED')
 run(identity(H)+finalize(rev()),True,'SUBMISSIONS_REQUIRED')
 before=rev()
 race(identity(H)+submit(before),identity(U)+write(op2,1,1),'accepted')
 assert run(f"SELECT count(*) FROM public.group_submissions WHERE contest_id='{C}';").strip()=='0'
 print('PASS: submit locks first -> later edit invalidates submission')
 cleanup();seed();group_seed();before=rev()
 race(identity(U)+write(op2,1,1),identity(H)+submit(before),'REVISION_CONFLICT')
 print('PASS: edit locks first -> stale submission denied')
 run(identity(H)+submit(rev()));before=rev()
 race(identity(H)+finalize(before),identity(U)+write('54000000-0000-0000-0000-000000000021',1,2),'SYNC_PAUSED')
 assert run(f"SELECT status FROM public.contests WHERE id='{C}';").strip()=='completed'
 print('PASS: finalize locks first -> late score denied')
 cleanup();seed();group_seed();run(identity(H)+submit(rev()));before=rev()
 race(identity(U)+write(op2,1,1),identity(H)+finalize(before),'REVISION_CONFLICT')
 run(identity(H)+finalize(rev()),True,'SUBMISSIONS_REQUIRED')
 assert run(f"SELECT status FROM public.contests WHERE id='{C}';").strip()=='active'
 print('PASS: write locks first -> finalization CAS denied; submission invalidated')
 run(f"UPDATE public.contest_memberships SET role='scorer',player_id=NULL WHERE contest_id='{C}' AND user_id='{U}'; INSERT INTO public.round_scorer_scopes(contest_id,round_id,group_id,user_id) VALUES('{C}','55000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000001','{U}');")
 run(identity(U)+submit(rev()))
 run(identity(H)+revoke())
 run(identity(H)+finalize(rev()),True,'SUBMISSIONS_REQUIRED')
 run(identity(U)+submit(rev()),True,'SCORER_REQUIRED')
 run(identity(H)+submit(rev()))
 run(f"UPDATE public.contest_rounds SET assignment_revision=assignment_revision+1 WHERE contest_id='{C}';")
 run(identity(H)+finalize(rev()),True,'SUBMISSIONS_REQUIRED')
 print('PASS: scoped scorer submission; revoked scorer and stale assignment submissions cannot finalize')
 run(identity(H)+submit(rev()))
 run(identity(H)+finalize(rev()))
 print('PASS: refreshed resubmission/finalization succeeds')
 cleanup();seed()
 down=(root/'rollback/20261029180000_sync_api.down.sql').read_text()
 race(identity(U)+write(op1),down,'M4B_DOWN_UNSAFE')
 assert run(f"SELECT count(*) FROM public.score_events WHERE contest_id='{C}';").strip()=='1'
 print('PASS: down waits for committed writer, refuses and preserves accepted data')
 pause=(root/'rollback/20261029180000_sync_api.pause.sql').read_text()
 # Roll back the operational pause fixture so the harness can compare exact down.
 pause=pause.replace('COMMIT;','ROLLBACK;')
 pause=pause.replace('ROLLBACK;',f"""DO $$$$ BEGIN
 IF EXISTS(SELECT 1 FROM public.contests WHERE id='{C}' AND sync_enabled) OR
 has_function_privilege('authenticated','public.write_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text)','EXECUTE') OR
 (SELECT count(*) FROM public.score_events WHERE contest_id='{C}')<>1 THEN
 RAISE EXCEPTION 'M4B_ASSERT: operational pause lost data or left writes open'; END IF; END $$$$;
 ROLLBACK;""".replace('$$$$','$$'))
 run(pause)
 print('PASS: operational pause closes writes, retains one accepted event (fixture rolled back)')
 cleanup()
finally:
 # On failure, local harness still destroys the entire disposable cluster.
 pass
