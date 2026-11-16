// AUG-1151: the New Contest wizard's multi-day toggle and round count must persist.
const fs=require('node:fs');
const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const validators=await import('./src/engine/contest-validation.ts').then(m=>m.default??m),results=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
const __ent=await import('./src/services/entitlements.ts').then(m=>m.default??m);__ent.setProEnabled(true);
const persistedKeys=fs.existsSync('src/stores/persisted-keys.ts') ? await import('./src/stores/persisted-keys.ts').then(m=>m.default??m) : undefined;
let tier='td';const deps={'./online-store':{useOnlineStore:{getState:()=>({events:{}})}},'./persisted-keys':persistedKeys,'../services/ocr-review':await import('./src/services/ocr-review.ts').then(m=>m.default??m),'../config/auth':{REAL_AUTH_CONFIGURED:false},'./auth-store':{useAuthStore:{getState:()=>({})}},'../services/guest-join':{generateJoinCode:()=> 'ABC234'},zustand:require('zustand'),'zustand/middleware':{persist:f=>f,createJSONStorage:()=>({})},'@react-native-async-storage/async-storage':{},'../services/tournament-sync':{syncScore:async()=>{},syncRound:async()=>{},syncRoundGroups:async()=>{},syncContestTournamentMeta:async()=>{}},'../engine/contest-validation':validators,'../engine/contest-results':results,'./scan-store':{useScanStore:{getState:()=>({tier})}}};
const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/stores/contest-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(id=>{if(id in deps)return deps[id];throw Error('Unexpected dependency '+id);},module,module.exports);
const {useContestStore:store,buildTournamentRounds}=module.exports;
const course={name:'Rules',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:100}))};
const names=['Augie','Lee','Kai','Ty','Sam','Max','Ray','Bo'];
const mk=name=>({id:'p-'+name,name,team:null,host:name==='Augie',handicap:0,scores:Array(18).fill(0)});
const groups=[{id:'g1',name:'Group 1',players:names.slice(0,4).map(mk)},{id:'g2',name:'Group 2',players:names.slice(4).map(mk)}];
let n=0;const ids=()=>'id-'+(++n);
const base={id:'c1',name:'Multi',createdAt:'',course,status:'active',games:['skins'],betUnit:1,hasTeams:false,groups};
${source}
`]);}
test('Multi-day rounds keep all players and groups, with no shared groups or score arrays',()=>check(`
 const rounds=buildTournamentRounds(groups,course,2,ids);
 assert.deepEqual(rounds.map(r=>[r.number,r.name]),[[1,'Round 1'],[2,'Round 2']]);
 assert.equal(new Set(rounds.map(r=>r.id)).size,2);
 assert.equal(rounds[0].groups,groups,'round 1 is the configured groups, as addRound seeds it');
 for(const r of rounds){assert.equal(r.groups.length,2);assert.equal(r.groups.flatMap(g=>g.players).length,8);assert.equal(r.course,course);}
 assert.deepEqual(rounds[1].groups.map(g=>g.players.map(p=>p.id)),groups.map(g=>g.players.map(p=>p.id)));
 assert.deepEqual(rounds[1].groups.map(g=>g.name),['Group 1','Group 2']);
 for(let i=0;i<2;i++){assert.notEqual(rounds[1].groups[i].id,groups[i].id);for(let j=0;j<4;j++){assert.notEqual(rounds[1].groups[i].players[j].scores,groups[i].players[j].scores);assert.notEqual(rounds[1].groups[i].players[j],groups[i].players[j]);}}
 rounds[1].groups[0].players[0].scores[0]=5;assert.equal(groups[0].players[0].scores[0],0);
 assert.equal(buildTournamentRounds(groups,course,4,ids).length,4);
`));
test('Single-round contests stay unchanged',()=>check(`
 for(const c of [1,0,NaN,2.5])assert.equal(buildTournamentRounds(groups,course,c,ids),undefined);
 store.getState().addContest(base);
 const saved=JSON.parse(JSON.stringify(store.getState().contests[0]));
 assert.equal('isTournament' in saved,false);assert.equal('rounds' in saved,false);assert.equal('currentRound' in saved,false);
`));
test('Wizard tournament contest persists through save/reload and scores stay per round',()=>check(`
 const rounds=buildTournamentRounds(groups,course,2,ids);
 store.getState().addContest({...base,isTournament:true,rounds,currentRound:1});
 store.setState({contests:JSON.parse(JSON.stringify(store.getState().contests))});
 const c=store.getState().contests[0];
 assert.equal(c.isTournament,true);assert.equal(c.currentRound,1);assert.equal(c.rounds.length,2);
 assert.deepEqual(c.groups.map(g=>g.players.map(p=>p.name)),[names.slice(0,4),names.slice(4)]);
 for(const r of c.rounds)assert.equal(r.groups.flatMap(g=>g.players).length,8);
 store.getState().updateScore('c1','g1','p-Augie',1,4);
 const after=store.getState().contests[0];
 assert.equal(after.rounds[0].groups[0].players[0].scores[0],4);
 assert.ok(after.rounds[1].groups.every(g=>g.players.every(p=>p.scores.every(s=>s===0))),'round 2 untouched');
`));
test('New Contest wizard writes the tournament rounds it collected',()=>{
 const src=fs.readFileSync(require('node:path').join(__dirname,'../app/contest/new.tsx'),'utf8');
 expect(src).toMatch(/const rounds = isTournament \? buildTournamentRounds\(groups, course, numRounds\) : undefined;/);
 expect(src).toMatch(/\.\.\.\(rounds \? \{ isTournament: true, rounds, currentRound: 1 \} : \{\}\)/);
});
