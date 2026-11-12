#!/usr/bin/env python3
"""Assert M2b cannot widen M2 client policy or ACL inventory."""
import json
import sys

def check(before, after):
    def rows(catalog, key):
        value = catalog[key]
        if isinstance(value, dict):
            value = [value]
        return {json.dumps(row, sort_keys=True) for row in (value or [])}
    added = [json.loads(row) for row in rows(after, 'policies') - rows(before, 'policies')]
    assert all(row['permissive'] == 'RESTRICTIVE' for row in added), added
    assert rows(before, 'policies') <= rows(after, 'policies'), 'M2 policies removed/changed'
    for key in ('grants', 'column_acls', 'routine_grants', 'default_acls', 'schema_acl', 'app_role_memberships', 'functions', 'app_roles', 'sequences'):
        added = [json.loads(row) for row in rows(after, key) - rows(before, key)]
        # All non-table/column ACL categories must remain exactly unchanged.
        if key not in ('grants', 'column_acls'):
            assert not added and rows(before, key) == rows(after, key), (key, added)
        else:
            for row in added:
                if key == 'column_acls':
                    assert row in [dict(table='profiles', col=col, acl='{authenticated=w/postgres}') for col in ('display_name', 'avatar_url')], row
                    continue
                if row.get('grantee') not in ('anon', 'authenticated'):
                    continue
                raise AssertionError(('new client table grant', row))
    print('PASS: M2b adds no permissive policies or client grants except profile presentation UPDATE')

if __name__ == '__main__':
    check(*(json.load(open(path)) for path in sys.argv[1:]))
