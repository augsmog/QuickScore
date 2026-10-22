const { execFileSync } = require('node:child_process');
const run = body => void execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e', `
import assert from 'node:assert/strict';
const mod = await import('./src/services/guest-join.ts');
const {generateJoinCode,validJoinCode,normalizeJoinCode,bindGuest,localContestJoinService,claimGuestHistory} = mod.default ?? mod;
const contest={id:'c',status:'active',joinCode:'ABC234',groups:[{id:'g',players:[{id:'p'},{id:'q'}]}]};
${body}`], {encoding:'utf8'});
test('codes have six unambiguous characters and normalized validation',()=>run(`
for(let i=0;i<1000;i++){const c=generateJoinCode(); assert.equal(c.length,6); assert(validJoinCode(c)); assert(!/[01IO]/.test(c));}
assert(validJoinCode(' abc234 ')); assert.equal(normalizeJoinCode(' abc234 '),'ABC234');
for(const c of ['','ABC23','ABC2345','AB0123','ABC!23']) assert(!validJoinCode(c));`));
test('code allocation avoids collisions and fails boundedly',()=>run(`
assert.throws(()=>generateJoinCode(['AAAAAA'],()=>0));
let i=0; assert.equal(generateJoinCode(['AAAAAA'],()=>i++<6?0:0.5).length,6);`));
test('guest binding persists identity, trims name and is idempotent',()=>run(`
let s=bindGuest({guestId:null,bindings:[]},contest,'p',' Sam ',()=> 'random-id');
assert.equal(s.guestId,'random-id'); assert.equal(s.bindings[0].displayName,'Sam');
s=bindGuest(JSON.parse(JSON.stringify(s)),contest,'p','Sam',()=>{throw Error('must reuse identity')});
assert.equal(s.bindings.length,1); assert.equal(s.bindings[0].groupId,'g');
assert.throws(()=>bindGuest(s,contest,'q','Sam',()=>''));`));
test('guest rejects missing names, nonexistent slots and completed rounds',()=>run(`
const s={guestId:null,bindings:[]};
assert.throws(()=>bindGuest(s,contest,'p',' ',()=>''));
assert.throws(()=>bindGuest(s,contest,'missing','Sam',()=>''));
assert.throws(()=>bindGuest(s,{...contest,status:'completed'},'p','Sam',()=>''));
assert.equal(s.bindings.length,0);`));
test('local lookup is normalized, has no cross-device fallback; claim explains retention',()=>run(`
const service=localContestJoinService(()=>[contest]);
assert.equal((await service.lookup(' abc234 ')).id,'c');
assert.equal(await service.lookup('XYZ234'),undefined);
await assert.rejects(()=>service.lookup('bad'));
assert.match(claimGuestHistory(),/coming soon/); assert.match(claimGuestHistory(),/saved on this device/);`));
