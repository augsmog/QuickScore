#!/usr/bin/env python3
"""OFFLINE-ONLY emulation: copy exact live rows for hosted platform extensions plain PG17 cannot install."""
import json, sys
PLATFORM = ('supabase_vault', 'pg_graphql', 'pg_stat_statements')
def inject(live, cat):
    have = {e['name'] for e in cat.get('extensions') or []}
    for e in live.get('extensions') or []:
        if e['name'] in PLATFORM and e['name'] not in have:
            cat.setdefault('extensions', []).append(dict(e))
    return cat
if __name__ == '__main__':
    live = json.load(open(sys.argv[1])); cat = json.load(open(sys.argv[2]))
    json.dump(inject(live, cat), open(sys.argv[2], 'w'))
    print('offline: emulated platform extensions ' + ', '.join(PLATFORM))
