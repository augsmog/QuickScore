#!/usr/bin/env python3
"""Identity green, deliberate drift red, including archived SQL facts."""
import copy, json, pathlib, subprocess, sys, tempfile
from drift import HERE, load, differences, ledger
snapshot = load(HERE.parent / 'schema-snapshot/live.json')

def check(name, mutate):
    x = copy.deepcopy(snapshot)
    mutate(x)
    assert differences(snapshot, x), name + ' escaped detection'
    with tempfile.TemporaryDirectory() as d:
        p = pathlib.Path(d) / 'mutation.json'
        p.write_text(json.dumps(x))
        r = subprocess.run([sys.executable, str(HERE / 'drift.py'), 'compare', str(HERE.parent / 'schema-snapshot/live.json'), str(p)],capture_output=True,text=True)
        assert r.returncode == 1 and 'live/' in r.stdout and 'local/' in r.stdout, (name,r)
        x['migrations'] = load(HERE / 'expected-ledger.json')
        p.write_text(json.dumps(x))
        guard = subprocess.run(['bash', str(HERE / 'preapply-check.sh'), str(p)], capture_output=True, text=True)
        assert guard.returncode != 0 and 'supabase migration repair' not in guard.stdout, (name, guard)
    print('PASS detected: ' + name)

assert not differences(snapshot, snapshot)
r = subprocess.run([sys.executable, str(HERE / 'drift.py'), 'compare', str(HERE.parent / 'schema-snapshot/live.json'), str(HERE.parent / 'schema-snapshot/live.json')], capture_output=True, text=True)
assert r.returncode == 0, r
print('PASS identity')
check('added column', lambda x:x['columns'].append(dict(x['columns'][0],col='unexpected')))
check('removed column', lambda x:x['columns'].pop())
check('column default', lambda x:x['columns'][0].update(default='42'))
check('removed policy', lambda x:x['policies'].pop())
check('policy qual', lambda x:x['policies'][0].update(qual='false'))
check('extra anon EXECUTE ACL', lambda x:next(f for f in x['functions'] if f['name']=='chat_contest').update(acl='{postgres=X/postgres,service_role=X/postgres,anon=X/postgres}'))
check('extra routine grant', lambda x:x['routine_grants'].append({'routine':'chat_contest','grantee':'anon','priv':'EXECUTE'}))
check('function search_path', lambda x:x['functions'][0].update(config=['search_path=evil']))
check('SECURITY DEFINER', lambda x:x['functions'][0].update(secdef=not x['functions'][0]['secdef']))
check('removed publication member', lambda x:x['publication'].pop())
check('changed auth trigger', lambda x:next(t for t in x['triggers'] if t['schema']=='auth').update({'def':'CREATE TRIGGER broken'}))
check('removed auth trigger', lambda x:x.update(triggers=[t for t in x['triggers'] if t['schema']!='auth']))
check('RLS disabled', lambda x:x['rls'][0].update(rls=False))
check('extra default ACL', lambda x:x['default_acls'].append({'role':'postgres','schema':'public','objtype':'T','acl':'{anon=U/postgres}'}))
check('sequence ACL', lambda x:next(o for o in x['owners'] if o['kind']=='S').update(acl='{postgres=rwU/postgres}'))
check('view owner', lambda x:x['views'][0].update(owner='anon'))
# Minimal allowlist must not hide new extension names or PostgreSQL major changes.
check('unexpected extension', lambda x:x['extensions'].append({'name':'unexpected_extension','schema':'extensions','version':'1'}))
check('PostgreSQL major', lambda x:x.update(server_version_major=18))
# Minimal catalog-shaped counterexample grounded in the archived SQL, not a claim
# to have executed that incompatible chain. One incompatible table is sufficient.
archive=HERE.parent/'archive/pre-baseline'
sql=(archive/'001_initial_schema.sql').read_text()
assert 'CREATE TABLE public.hole_scores' in sql or 'CREATE TABLE IF NOT EXISTS public.hole_scores' in sql
assert 'contest_rounds' in (archive/'008_tournament_rounds.sql').read_text()
def old_shape(x):
    x['columns'].append({'table':'hole_scores','col':'id','pos':1,'type':'uuid','udt':'uuid','nullable':'NO','default':'gen_random_uuid()'})
    x['regclass_checks']['hole_scores']='hole_scores'
    x['regclass_checks']['contest_rounds']='contest_rounds'
check('archived 001–008 shape',old_shape)
for mode in ('live','local'):
    good={'migrations':load(HERE/'expected-ledger.json')+([{'version':'20261027000000','name':'live_baseline'},{'version':'20261027120000','name':'sync_foundation'},{'version':'20261027130000','name':'guest_write_guard'}] if mode=='local' else [])}
    ledger(good,mode)
    for bad in (good['migrations'][:-1],good['migrations']+[{'version':'008','name':'tournament_rounds'}]):
        try: ledger({'migrations':bad},mode)
        except ValueError: pass
        else: raise AssertionError('bad ledger accepted')
print('PASS ledger identity and rejection (live/local)')

from drift import normalize
reviewed = load(HERE / 'reviewed-default-acls.json')
assert normalize({'default_acls': reviewed['expected']})['default_acls'] == [a for a in snapshot['default_acls'] if a['role'] != 'postgres']
check('generated column', lambda x:x['identity_generated'][0].update(generated='s'))
check('identity removed', lambda x:x['identity_generated'].pop())
check('sequence dependency', lambda x:x['seq_deps'][0].update(deptype='a'))
check('sequence dependency removed', lambda x:x['seq_deps'].pop())
for field,value in [('type','integer'),('start','2'),('min','0'),('max','9223372036854775806'),('inc',2),('cycle',True),('cache',2)]:
    check('sequence '+field, lambda x,f=field,v=value:x['sequences'][0].update({f:v}))
check('schema owner', lambda x:x['schema_acl'].update(owner='postgres'))
for field,value in [('event','sql_drop'),('fn_schema','evil'),('fn','other'),('owner','anon'),('enabled','R'),('tags',['CREATE TABLE'])]:
    check('event trigger '+field, lambda x,f=field,v=value:x['event_triggers'][0].update({f:v}))

print('All JSON drift fixtures and preapply rejections passed')
