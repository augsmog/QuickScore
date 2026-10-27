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
# The fixture is explicit: the guard must not accept an arbitrary baseline.
applied = load(HERE/'expected-ledger.json')
assert applied == load(HERE/'fixtures/live-applied-ledger.json')
adopted = applied[:-2]
assert adopted == load(HERE/'fixtures/live-adopted-ledger.json')
for mode, entries in [('live', applied), ('baseline', adopted), ('pre-adoption', adopted[:-1]),
                      ('local', adopted + [{'version':'20261027120000','name':'sync_foundation'},
                                           {'version':'20261027130000','name':'guest_write_guard'}])]:
    ledger({'migrations': entries}, mode)
    if mode != 'live':
        ledger({'migrations': entries[::-1]}, mode)
    for bad in (entries[:-1], entries + [entries[0]]):
        try:
            ledger({'migrations': bad}, mode)
        except ValueError:
            pass
        else:
            raise AssertionError('bad ledger accepted: ' + mode)

bad_ledgers = {
    'seven pre-adoption': adopted[:-1],
    'nine M2 applied': adopted + [{'version':'20261027120000','name':'sync_foundation'}],
    'eight adopted': adopted,
    'eleven extra': applied + [{'version':'99999999999999','name':'unexpected'}],
    'ten renamed': applied[:-1] + [dict(applied[-1], name='renamed')],
    'ten reordered': applied[:-2] + applied[-2:][::-1],
    'ten duplicate': applied[:-1] + [applied[-2]],
    'missing': adopted[:2] + adopted[3:],
    'reordered': [adopted[1], adopted[0]] + adopted[2:],
    'duplicate': adopted[:-1] + [adopted[0]],
    'extra': adopted + [{'version':'99999999999999','name':'unexpected'}],
    'renamed': [dict(adopted[0], name='renamed')] + adopted[1:],
    'wrong baseline name': adopted[:-1] + [dict(adopted[-1], name='other_baseline')],
    'wrong baseline version': adopted[:-1] + [dict(adopted[-1], version='20261027000001')],
}
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / 'capture.json'
    for name, entries in [('applied ten', applied), *bad_ledgers.items()]:
        capture = copy.deepcopy(snapshot)
        capture['migrations'] = entries
        p.write_text(json.dumps(capture))
        guard = subprocess.run(['bash', str(HERE/'preapply-check.sh'), str(p)], capture_output=True, text=True)
        if name == 'applied ten':
            assert guard.returncode == 0, guard
            assert guard.stdout.splitlines() == [
                'Schema matches', 'Ledger matches: live', 'Guard passed.',
                'Next: M3 requires separate approval; no approved apply is pending.'], guard
        else:
            assert guard.returncode == 1 and 'live ledger mismatch' in guard.stderr, (name, guard)
            assert 'Guard passed.' not in guard.stdout and 'Next:' not in guard.stdout, (name, guard)
        assert 'migration repair' not in guard.stdout, guard
        print('PASS preapply ledger: ' + name)

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

# Catalog permission gate must reject policy and ACL widening independently.
import runpy
permission_gate = runpy.run_path(str(HERE / 'guest-guard-catalog.py'))['check']
permission_gate(snapshot, snapshot)
for key, row in [
    ('policies', dict(snapshot['policies'][0], policyname='unexpected_permissive')),
    ('grants', dict(table='contest_players', grantee='authenticated', priv='UNEXPECTED')),
    ('column_acls', dict(table='profiles', col='is_premium', acl='{authenticated=w/postgres}')),
]:
    changed = copy.deepcopy(snapshot)
    changed[key].append(row)
    try:
        permission_gate(snapshot, changed)
    except AssertionError:
        print('PASS: permission gate rejects ' + key)
    else:
        raise AssertionError('permission widening escaped: ' + key)

# Probe SQL columns come from the full-chain snapshot, never application src/.
import re
expected = load(HERE.parent / 'schema-snapshot/expected-after.json')
columns = {}
for row in expected['columns']:
    columns.setdefault(row['table'], set()).add(row['col'])
suite = (HERE.parent / 'tests/guest-write-guard.sql').read_text()
for sql in re.findall(r'\$q\$(.*?)\$q\$', suite, re.S):
    insert = re.match(r'INSERT INTO public\.(\w+)\(([^)]+)\)', sql)
    update = re.match(r'UPDATE public\.(\w+) SET (.*?)(?: WHERE |$)', sql)
    if insert:
        table, names = insert.groups()
        used = set(names.split(','))
    elif update:
        table, assignments = update.groups()
        used = set(re.findall(r'(?:^|,)\s*(\w+)\s*=', assignments))
    else:
        continue
    assert {name.strip() for name in used} <= columns[table], sql
print('PASS: every INSERT/UPDATE probe uses expected-after.json columns')
