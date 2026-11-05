const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const strict = require('node:assert/strict');
const assert = Object.assign((...args)=>strict(...args), strict, {deepEqual:(a,b)=>strict.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)))});
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/account-merge.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:exportsObject});
const run = body => new (Object.getPrototypeOf(async function(){}).constructor)('assert','mod', `
const {mergeRoundHistory, accountHandoff, ACCOUNT_HANDOFF_KEY}=mod;
const row=(contest_id,player_id='p',status='approved')=>({contest_id,player_id,status,role:'player'});
${body}`)(assert,exportsObject);
test('handoff persists before preparation, pins target and retries after lost claim response', () => run(`
const data=new Map(); let lost=true, claims=0;
const storage={getItem:async k=>data.get(k)??null,setItem:async(k,v)=>{data.set(k,v)},removeItem:async k=>{data.delete(k)}};
const api=accountHandoff(storage,async(name,args)=>{
 assert(data.has(ACCOUNT_HANDOFF_KEY));
 if(name==='claim_account_handoff') {
  claims++; assert.equal(args.p_target,'account');
  assert.equal(JSON.parse(data.get(ACCOUNT_HANDOFF_KEY)).target,'account');
  if(lost){lost=false;throw Error('lost response')};
  return {transferred:2,conflicts:1};
 }
},()=> 'a'.repeat(64));
await api.prepare('guest'); await api.prepare('guest');
await assert.rejects(()=>api.claim('account'));
await assert.rejects(()=>api.claim('different'));
assert.equal(claims,1);
assert.deepEqual(await api.claim('account'),{transferred:2,conflicts:1});
assert.equal(await api.claim('account'),null); assert.equal(claims,2);
`));
test('failed prepare retains the same capability, guest never consumes its own claim', () => run(`
const data=new Map(); let fail=true, tokens=0;
const storage={getItem:async k=>data.get(k)??null,setItem:async(k,v)=>{data.set(k,v)},removeItem:async k=>{data.delete(k)}};
const api=accountHandoff(storage,async()=>{if(fail)throw Error('offline')},()=>{tokens++;return 'b'.repeat(64)});
await assert.rejects(()=>api.prepare('guest')); fail=false; await api.prepare('guest');
assert.equal(tokens,1); assert.equal(await api.claim('guest'),null);
await assert.rejects(()=>api.prepare('other-guest'));
`));

test('history merge keeps account scorecards intact, has no duplicate rounds and survives repeated claims',()=>run(`
const account=[{id:'r1',scores:[4,5]}], guest=[{id:'r1',scores:[3,3]},{id:'r2',scores:[5,4]},{id:'r2',scores:[6,6]}];
const result=mergeRoundHistory(account,guest);
assert.deepEqual(result,[account[0],guest[1]]);
assert.deepEqual(mergeRoundHistory(result,guest),result);
assert.deepEqual(account,[{id:'r1',scores:[4,5]}]);
`));
