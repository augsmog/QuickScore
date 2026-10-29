const {execFileSync}=require('node:child_process');
const run=body=>void execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`import assert from 'node:assert/strict'; const load=async p=>{const m=await import(p);return m.default??m}; ${body}`],{encoding:'utf8'});
test('real session derivation separates anonymous auth and preserves provider',()=>run(`
const {deriveSession}=await load('./src/services/auth-session.ts');
const result=deriveSession({user:{id:'uuid',is_anonymous:true,app_metadata:{provider:'email'}},refresh_token:'SECRET'});
assert(result.isAnonymous);assert.equal(result.user.provider,'anonymous');assert.equal(result.remoteUserId,'uuid');assert(!JSON.stringify(result).includes('SECRET'));
assert.equal(deriveSession({user:{id:'a',app_metadata:{provider:'apple'}}}).user.provider,'apple');assert.equal(deriveSession(null).remoteUserId,null);
`));
test('SecureStore large unicode session, legacy migration, read-back and surfaced failure',()=>run(`
const {secureSessionStorage}=await load('./src/db/secure-session-storage.ts');const values=new Map();let n=0,fail=false,corrupt=false;
const storage={getItemAsync:async k=>values.get(k)??null,setItemAsync:async(k,v)=>{if(fail)throw Error('full');assert(Buffer.byteLength(v)<2048);values.set(k,corrupt?'bad':v)},deleteItemAsync:async k=>{values.delete(k)}};
const adapter=secureSessionStorage(storage,()=> 'id-'+(++n));values.set('s','legacy');assert.equal(await adapter.getItem('s'),'legacy');
const large=JSON.stringify({refresh_token:'x'.repeat(9000),name:'🏌'.repeat(1000)});await adapter.setItem('s',large);assert.equal(await adapter.getItem('s'),large);
fail=true;await assert.rejects(adapter.setItem('s','next'),/full/);fail=false;assert.equal(await adapter.getItem('s'),large);
corrupt=true;await assert.rejects(adapter.setItem('s','next'),/read-back/);corrupt=false;assert.equal(await adapter.getItem('s'),large);
await adapter.removeItem('s');assert.equal(await adapter.getItem('s'),null);
`));
const setup=`const {scoreOutbox}=await load('./src/services/score-outbox.ts');let raw=null,n=0,fail=false;const calls=[];
const storage={getItem:async()=>raw,setItem:async(k,v)=>{if(fail)throw Error('disk full');raw=v}};
const draft={contest_id:'c',round_id:'r',player_id:'p',hole:1,action:'set',strokes:4};const ids=()=> 'op-'+(++n);`;
test('lost response retries immutable request; successor materializes after durable receipt',()=>run(setup+`
const first=scoreOutbox(storage,'actor',ids,async a=>{calls.push(a);throw Error('lost')});await first.enqueue(draft,0);await first.enqueue({...draft,strokes:5},0);await assert.rejects(first.replay());assert.equal((await first.inspect()).entries[1].request,undefined);
const restarted=scoreOutbox(storage,'actor',ids,async a=>{calls.push(a);return {status:'accepted',version:a.expected_version+1,strokes:a.strokes,revision:1}});await restarted.replay();assert.deepEqual(calls[0],calls[1]);assert.equal(calls[2].expected_version,1);assert.equal((await restarted.inspect()).entries.length,0);
`));
test('conflict blocks successor after restart; explicit choice creates new id',()=>run(setup+`
const make=()=>scoreOutbox(storage,'actor',ids,async a=>{calls.push(a);return {status:'conflict',version:9,strokes:3,revision:12}});let box=make();const id=await box.enqueue(draft,0);await box.enqueue({...draft,strokes:5},0);await box.replay();box=make();await box.replay();assert.equal(calls.length,1);await assert.rejects(box.resolve(id,'use-mine',false));await box.resolve(id,'use-mine',true);const state=await box.inspect();assert.equal(state.entries.length,1);assert.notEqual(state.entries[0].id,id);assert.equal(state.entries[0].expected,9);
`));
test('persistence failure and corruption surface without losing materialized requests',()=>run(setup+`
const box=scoreOutbox(storage,'actor',ids,async a=>{fail=true;return {status:'accepted',version:1,strokes:4,revision:1}});fail=true;await assert.rejects(box.enqueue(draft,0));fail=false;assert.equal((await box.inspect()).entries.length,0);await box.enqueue(draft,0);await assert.rejects(box.replay());fail=false;assert.equal((await box.inspect()).entries.length,1);raw='bad';await assert.rejects(box.inspect());
`));
test('rejoin repairs approved membership, clears revoked data and keeps pending private',()=>run(`
const {onlineClient}=await load('./src/services/online-client.ts');let approved=true;const calls=[],repairs=[];const client=onlineClient(async(name,args)=>{calls.push({name,args});return {error:null,data:name==='my_membership'?(approved?{role:'player',status:'approved',player_id:'p'}:null):name==='tournament_snapshot'?{revision:1,rounds:[]}:{status:'pending',roster:['private']}}},(...a)=>repairs.push(a));assert.deepEqual(await client.requestJoin(' abc234 ',' Sam '),{status:'pending'});await client.rejoin('c');assert.equal(repairs.at(-1)[1].player_id,'p');approved=false;await client.rejoin('c');assert.equal(repairs.at(-1)[2],null);assert.equal(calls.filter(x=>x.name==='tournament_snapshot').length,1);await client.decide('req',true,'p');assert.deepEqual(calls.at(-1).args,{request_id:'req',approve:true,player_id:'p'});
`));
test('foreground restore reads session before repair and background stops refresh',()=>run(`
const {authLifecycle}=await load('./src/services/auth-lifecycle.ts');const calls=[];const lifecycle=authLifecycle({startAutoRefresh:()=>calls.push('start'),stopAutoRefresh:()=>calls.push('stop'),getSession:async()=>{calls.push('read');return {error:null}}},async()=>{calls.push('apply')},()=>assert.fail());lifecycle.change('active');await new Promise(r=>setTimeout(r,0));lifecycle.change('background');assert.deepEqual(calls,['start','read','apply','stop']);lifecycle.stop();
`));
test('denied requests pause and retain drafts; other rounds remain independent',()=>run(setup+`
const box=scoreOutbox(storage,'actor',ids,async a=>{calls.push(a);if(a.round_id==='r')throw {code:'42501'};return {status:'accepted',version:1,strokes:4,revision:1}});
await box.enqueue(draft,0);await box.enqueue({...draft,strokes:5},0);await box.enqueue({...draft,round_id:'r2'},0);await box.replay();assert.equal(calls.length,2);assert.equal((await box.inspect()).entries[0].state,'denied');await box.replay();assert.equal(calls.length,2);
`));
test('revision hints discard duplicates and foreground poll stops on cleanup',()=>run(`
const {foregroundSync}=await load('./src/services/online-client.ts');let calls=0;
const sync=foregroundSync(async()=>{calls++;return {revision:5,rounds:[]}},()=>assert.fail(),10);
await new Promise(r=>setTimeout(r,2));sync.hint(4);sync.hint({revision:6,private:'ignored'});assert.equal(calls,1);sync.hint(6);await new Promise(r=>setTimeout(r,2));assert.equal(calls,2);
await new Promise(r=>setTimeout(r,20));assert(calls>=3);sync.stop();const before=calls;await new Promise(r=>setTimeout(r,20));assert.equal(calls,before);
`));
test('owner rejoin requires host-only authorization before repairing organizer state',()=>run(`
const {onlineClient}=await load('./src/services/online-client.ts');let allowed=false;const calls=[],repairs=[];
const client=onlineClient(async(name)=>{calls.push(name);return name==='list_join_requests'&&!allowed?{data:null,error:{code:'42501'}}:{data:name==='list_join_requests'?[]:{revision:1,rounds:[]},error:null}},(...a)=>repairs.push(a));
await assert.rejects(client.rejoinHost('c'));assert.equal(repairs.at(-1)[1],null);assert.equal(calls.length,1);allowed=true;await client.rejoinHost('c');assert.equal(repairs.at(-1)[1].role,'host');assert.equal(calls.at(-1),'tournament_snapshot');
`));
test('an identity switch discards a late authorized snapshot response',()=>run(`
const {onlineClient}=await load('./src/services/online-client.ts');let release;const repairs=[];
const client=onlineClient(async name=>({error:null,data:name==='my_membership'?{role:'player',status:'approved',player_id:'p'}:await new Promise(r=>{release=r})}),(...a)=>repairs.push(a));
const restoring=client.rejoin('c');await new Promise(r=>setTimeout(r,0));client.invalidate();release({revision:1,rounds:[]});await assert.rejects(restoring,/Identity changed/);assert.equal(repairs.length,0);
`));
