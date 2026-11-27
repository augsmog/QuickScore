import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { validate, diff, flatten } from '../validate-and-diff';
const p=JSON.parse(fs.readFileSync(path.join(__dirname,'../en-US.payload.json'),'utf8'));
assert.deepStrictEqual(validate(p),[]);
assert.deepStrictEqual(diff(flatten(p),flatten(p)),[]);
assert.strictEqual(diff(flatten(p),{...flatten(p),subtitle:'Old'}).length,1);
assert.strictEqual(flatten(p).promotionalText,'Pick your players and games. SnapScore keeps score and works out who owes what across Skins, Nassau and Wolf. Got a paper card? Scan it, check it, done.');
// AUG-1639: the copyright line must name the one legal entity, and nothing else may ride along.
assert.strictEqual(p.appStoreVersion.copyright,'2026 Autumn8me, Inc.');
for(const bad of [undefined,{},{copyright:''},{copyright:'2026 August Industries'},{copyright:'2026 John August Jones'},{copyright:'Autumn8me, Inc.'},{copyright:'\u00a9 2026 Autumn8me, Inc.'},{copyright:'2026 Autumn8me, Inc.',releaseType:'MANUAL'}])
 assert.ok(validate({...p,appStoreVersion:bad}).some(e=>e.startsWith('appStoreVersion.')),JSON.stringify(bad));
console.log('13 payload checks passed');
