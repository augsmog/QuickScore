#!/usr/bin/env python3
"""Active migration manifest: exact names, content hashes and git tracking."""
import hashlib,json,pathlib,subprocess,sys
here=pathlib.Path(__file__).resolve().parent
folder=here.parent/'migrations'
actual={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.glob('*.sql'))}
manifest=here/'active-migrations.json'
if '--record' in sys.argv:
 manifest.write_text(json.dumps(actual,indent=2)+'\n')
else:
 assert actual==json.loads(manifest.read_text()),'Active SQL manifest mismatch: review names and SHA256 hashes'
 tracked=subprocess.check_output(['git','ls-files','--',str(folder)],text=True).splitlines()
 assert {pathlib.Path(p).name for p in tracked}==set(actual),'Untracked active SQL (or tracked migration removed)'
 print('PASS: active SQL names, SHA256 hashes and tracking')
