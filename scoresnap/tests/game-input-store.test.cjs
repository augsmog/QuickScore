const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const validators=await import('./src/engine/contest-validation.ts').then(m=>m.default??m),results=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
const persistedKeys=fs.existsSync('src/stores/persisted-keys.ts') ? await import('./src/stores/persisted-keys.ts').then(m=>m.default??m) : undefined;
let tier='pro';const deps={'./persisted-keys':persistedKeys,'../services/ocr-review':await import('./src/services/ocr-review.ts').then(m=>m.default??m),'../config/auth':{REAL_AUTH_CONFIGURED:false},'./auth-store':{useAuthStore:{getState:()=>({})}},'../services/guest-join':{generateJoinCode:()=> 'ABC234'},zustand:require('zustand'),'zustand/middleware':{persist:f=>f,createJSONStorage:()=>({})},'@react-native-async-storage/async-storage':{},'../services/tournament-sync':{syncScore:async()=>{},syncRound:async()=>{},syncRoundGroups:async()=>{},syncContestTournamentMeta:async()=>{}},'../engine/contest-validation':validators,'../engine/contest-results':results,'./scan-store':{useScanStore:{getState:()=>({tier})}}};
const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/stores/contest-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(id=>{if(id in deps)return deps[id];throw Error('Unexpected dependency '+id);},module,module.exports);
const store=module.exports.useContestStore;
const course={name:'Rules',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:100}))};const players=['A','B','C','D'].map((name,i)=>({id:name,name,team:i<2?'Red':'Blue',handicap:4,scores:Array(18).fill(0)}));
const fixture={id:'x',name:'x',createdAt:'',course,status:'active',games:['chapman'],betUnit:.03,hasTeams:true,groups:[{id:'g',name:'g',players}],gameConfig:{rulesVersion:1,inputRulesVersion:1}};
${source}
`]);}
test('Store canonical team cards survive reload and roster reorder; incomplete completion is blocked',()=>check(`
 tier='free';assert.throws(()=>store.getState().addContest(fixture),/plan/);tier='pro';store.getState().addContest(fixture);
 assert.throws(()=>store.getState().completeContest('x'),/Confirm every/);
 store.getState().updateScore('x','g','B',1,4);assert.equal(store.getState().contests[0].auxiliaryByScope['default/g'].teamCards[1].Red,4);assert.ok(store.getState().contests[0].groups[0].players.every(p=>p.scores[0]===0));
 store.setState({contests:JSON.parse(JSON.stringify(store.getState().contests))});
 for(let h=1;h<=18;h++){store.getState().updateScore('x','g','A',h,4);store.getState().updateScore('x','g','D',h,5);}
 assert.equal(results.calculateContestSettlement(store.getState().contests[0]).netByPlayer.A,.03);
 assert.throws(()=>store.getState().importScores('x','g',[{playerId:'A',scores:Array(18).fill(4),source:'ocr'}]),/canonical team/);
 store.getState().completeContest('x');assert.equal(store.getState().contests[0].status,'completed');assert.throws(()=>store.getState().updateScore('x','g','A',1,5),/locked/);
`));
test('Guest event writes stay free and persist to the selected round/group; final BBB hole can be confirmed',()=>check(`
 tier='td';const groups=[{id:'g1',name:'g1',players:players.slice(0,2)},{id:'g2',name:'g2',players:players.slice(2)}];const contest={...fixture,hasTeams:false,games:['bingo_bango_bongo'],groups,isTournament:true,currentRound:1,rounds:[{id:'r1',number:1,name:'r1',groups},{id:'r2',number:2,name:'r2',groups}]};store.getState().addContest(contest);
 tier='free';store.getState().updateAuxiliaryData('x','bbb',18,{bingo:'A',bango:null,bongo:null},'g1');store.getState().setCurrentRound('x',2);store.getState().updateAuxiliaryData('x','bbb',18,{bingo:'B',bango:null,bongo:null},'g1');
 const saved=JSON.parse(JSON.stringify(store.getState().contests[0]));assert.equal(saved.auxiliaryByScope['r1/g1'].bbb[18].bingo,'A');assert.equal(saved.auxiliaryByScope['r2/g1'].bbb[18].bingo,'B');assert.equal(saved.auxiliaryByScope['r2/g2'],undefined);assert.equal(results.calculateContestSettlement(saved).pending,true);
 assert.throws(()=>store.getState().updateAuxiliaryData('x','bbb',1,{bingo:'C',bango:null,bongo:null},'g1'),/every BBB/);
`));
test('Store/import cannot bypass public Joker declarations, Bisque budgets, locked money or legacy adoption',()=>check(`
 const contest={...fixture,hasTeams:false,games:['stableford'],gameConfig:{...fixture.gameConfig,jokerEnabled:true}};store.getState().addContest(contest);
 assert.throws(()=>store.getState().importScores('x','g',[{playerId:'A',scores:Array(18).fill(4),source:'ocr'}]),/Joker/);
 store.getState().updateAuxiliaryData('x','jokerDeclarations',0,{A:[1,2],B:[3,4],C:[5,6],D:[7,8]},'g');store.getState().updateScore('x','g','A',1,4);
 assert.throws(()=>store.getState().updateContest('x',{betUnit:10}),/locked/);assert.throws(()=>store.getState().updateAuxiliaryData('x','jokerDeclarations',0,{A:[2,3],B:[3,4],C:[5,6],D:[7,8]},'g'),/locked/);
 store.setState({contests:[{...fixture,gameConfig:undefined}]});assert.throws(()=>store.getState().updateContest('x',{gameConfig:fixture.gameConfig}),/Legacy outcomes/);
`));
test('Adding a tournament round preserves the original round and migrates its event namespace',()=>check(`
 tier='td';store.getState().addContest({...fixture,games:['bingo_bango_bongo'],hasTeams:false});store.getState().updateAuxiliaryData('x','bbb',1,{bingo:'A',bango:null,bongo:null},'g');store.getState().addRound('x','Next');const c=store.getState().contests[0];assert.equal(c.rounds.length,2);assert.equal(c.currentRound,2);assert.equal(c.rounds[0].groups[0].id,'g');assert.equal(c.auxiliaryByScope[results.scopeKey(c.rounds[0].id,'g')].bbb[1].bingo,'A');assert.equal(c.auxiliaryByScope[results.scopeKey(c.rounds[1].id,c.rounds[1].groups[0].id)],undefined);
`));
test('Premium sample contest respects the same store tier gate as real hosted contests',()=>check(`
 const sample=module.exports.createSampleContest();tier='free';assert.throws(()=>store.getState().addContest(sample),/plan/);tier='pro';store.getState().addContest(sample);assert.equal(store.getState().contests.length,1);assert.equal(store.getState().contests[0].isDemo,true);
`));
