#!/usr/bin/env python3
"""Build a reviewable Management API JSON body. Never connects or reads credentials."""
import json,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parent.parent
mode=sys.argv[1]
paths={'apply':'migrations/20261029180000_sync_api.sql','down':'rollback/20261029180000_sync_api.down.sql','pause':'rollback/20261029180000_sync_api.pause.sql'}
original=(root/paths[mode]).read_text()
# These reviewed files have exactly one top-level BEGIN/COMMIT pair.
assert len(re.findall(r'^BEGIN;$',original,re.M))==1
assert len(re.findall(r'^COMMIT;$',original,re.M))==1
body=re.sub(r'^BEGIN;\n','',original,flags=re.M)
body=re.sub(r'^COMMIT;\s*$','',body,flags=re.M)
quote=lambda s:"'"+s.replace("'","''")+"'"
if mode=='apply':
 body+="\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('20261029180000','sync_api',ARRAY["+quote(original)+"]::text[]);\nNOTIFY pgrst, 'reload schema';\n"
elif mode=='down':
 body+="\nDELETE FROM supabase_migrations.schema_migrations WHERE version='20261029180000' AND name='sync_api';\nNOTIFY pgrst, 'reload schema';\n"
print(json.dumps({'query':'BEGIN;\n'+body+'\nCOMMIT;'}))
