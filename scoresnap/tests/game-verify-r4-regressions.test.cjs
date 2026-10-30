const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
import fs from 'node:fs';
const r=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
const {calcNassauRules}=await import('./src/engine/calculators/nassau.ts').then(m=>m.default??m);
const {calcSkins}=await import('./src/engine/calculators/skins.ts').then(m=>m.default??m);
// Before the helper exists, execute the pinned live expression to expose the numerical failure.
const liveCourse=r.liveRoundCourse??(c=>c.course);
const course=(name,par=4)=>({name,holes:Array.from({length:18},(_,i)=>({num:i+1,par,hcp:i+1}))});
function fixture(){const players=['A','B'].map(name=>({id:name,name,handicap:0,courseHandicaps:{Copper:0,Silver:name==='A'?18:0},scores:Array(18).fill(4)}));const group={id:'g',name:'Group',players};return {groups:[group],course:course('Copper'),games:['nassau'],betUnit:1,gameConfig:{rulesVersion:1,inputRulesVersion:1,netHandicap:true},isTournament:true,currentRound:2,rounds:[{id:'r1',number:1,course:course('Copper'),groups:[group]},{id:'r2',number:2,course:course('Silver'),groups:[group]}]};}
${source}`]);}
test('Round 2 Nassau live preview agrees with primary results and $1 settlement',()=>check(`
const c=fixture(),players=c.rounds[1].groups[0].players;
const live=calcNassauRules(players,liveCourse(c),false,c.gameConfig);
assert.deepEqual([live.front,live.back,live.overall],[9,9,18]);
const primary=r.contestPrimaryRounds(c)[1].contest;
assert.deepEqual(live,calcNassauRules(primary.groups[0].players,primary.course,false,primary.gameConfig));
assert.deepEqual(r.calculateContestSettlement(c).netByPlayer,{A:3,B:-3});
`));
test('Round 2 Skins birdie multiplier uses changed course pars',()=>check(`
const c=fixture();c.games=['skins'];c.gameConfig={rulesVersion:1,skinsMode:'gross',birdieMultiplier:true};
c.rounds[1].course=course('Silver',5);
c.rounds[0].groups=[{...c.groups[0],players:c.groups[0].players.map(p=>({...p,scores:Array(18).fill(4)}))}];
c.rounds[1].groups=[{...c.groups[0],players:c.groups[0].players.map((p,i)=>({...p,scores:Array(18).fill(i?5:4)}))}];
const players=c.rounds[1].groups[0].players;
const live=calcSkins(players,liveCourse(c),false,'gross',c.gameConfig);
assert.deepEqual(live.totals,{A:36,B:0});
assert.deepEqual(calcSkins(players,c.course,false,'gross',c.gameConfig).totals,{A:18,B:0});
const primary=r.contestPrimaryRounds(c)[1].contest;
assert.deepEqual(live,calcSkins(primary.groups[0].players,primary.course,false,'gross',primary.gameConfig));
assert.deepEqual(r.calculateContestSettlement(c).netByPlayer,{A:18,B:-18});
`));
test('Round 3 selects by round number and falls back for absent round/course',()=>check(`
const c=fixture();c.rounds.unshift({id:'r3',number:3,course:course('Gold',3),groups:c.groups});c.currentRound=3;
assert.equal(liveCourse(c),c.rounds[0].course);
c.rounds[0].course=undefined;assert.equal(liveCourse(c),c.course);
c.currentRound=99;assert.equal(liveCourse(c),c.course);
`));
test('Legacy and single-round course identity is preserved',()=>check(`
for(const config of [undefined,{}, {rulesVersion:1}]){const c={...fixture(),isTournament:false,gameConfig:config};assert.equal(liveCourse(c),c.course);}
const c=fixture();c.rounds=undefined;assert.equal(liveCourse(c),c.course);
`));
test('Live UI routes course reads through the tested helper',()=>check(`
const ui=fs.readFileSync('app/contest/[id]/scorecard.tsx','utf8');
assert.ok(!/calc(?:NassauRules|Skins)\\(players,\\s*contest\\.course/.test(ui));
assert.ok(ui.includes('const course = liveRoundCourse(contest)'));
assert.ok(ui.includes('calcNassauRules(players, course,'));assert.ok(ui.includes('calcSkins(players, course,'));
assert.ok(ui.includes('[group.players, currentHole, contest.games, course, contest.gameConfig, auxiliary]'));
const daily=fs.readFileSync('app/contest/[id]/index.tsx','utf8');assert.ok(daily.includes('scoreView === "daily" ? liveRoundCourse(contest) : contest.course'));
`));
