const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';import fs from 'node:fs';
const r=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
const s=await import('./src/engine/calculators/skins.ts').then(m=>m.default??m);
const n=await import('./src/engine/calculators/nassau.ts').then(m=>m.default??m);
const course=(name,par=4)=>({name,holes:Array.from({length:18},(_,i)=>({num:i+1,par,hcp:i+1}))});
const group=(id,names,scores)=>({id,name:id,players:names.map((name,i)=>({id:name,name,handicap:0,team:i<2?'red':'blue',scores:Array(18).fill(scores[i])}))});
function fixture(){const g=group('g',['A','B'],[4,4]);return {course:course('Old'),groups:[g],games:['skins_carry'],betUnit:1,gameConfig:{rulesVersion:1,skinsMode:'gross',skinsScope:'field'},isTournament:true,currentRound:2,rounds:[{id:'r1',number:1,course:course('Old'),groups:[g]},{id:'r2',number:2,course:course('New',5),groups:[g,group('other',['Z'],[3])]}]};}
const liveSkins=r.liveSkinsStatus??((c,id)=>s.calcSkins(c.rounds?.find(r=>r.number===c.currentRound)?.groups.find(g=>g.id===id).players??c.groups.find(g=>g.id===id).players,r.liveRoundCourse(c),c.games.includes('skins_carry'),c.gameConfig.skinsMode,c.gameConfig));
const labels=r.liveNassauLabels??((result,status,players)=>({leader:status>0?players[0].name:status<0?players[1].name:null,down:status>0?players[1].name:players[0].name}));
${source}`]);}
test('Whole-field current round Skins agrees with primary and combined cash',()=>check(`
const c=fixture(),live=liveSkins(c,'g');assert.equal(live.remaining,0);assert.equal(live.totals.Z,18);
const primary=r.contestPrimaryRounds(c)[1].contest;assert.deepEqual(live,s.calcScopedSkins(primary.groups,primary.course,true,c.gameConfig)[0].result);
assert.deepEqual(r.calculateContestSettlement(c).netByPlayer,{A:-6,B:-6,Z:12});
c.rounds.reverse();assert.deepEqual(liveSkins(c,'other'),live);
`));
test('Group scope isolates selected group including a one-player other group',()=>check(`
const c=fixture();c.gameConfig.skinsScope='group';assert.equal(liveSkins(c,'g').remaining,18);assert.equal(liveSkins(c,'other').totals.Z,18);
assert.deepEqual(liveSkins(c,'g'),s.calcScopedSkins(c.rounds[1].groups,c.rounds[1].course,true,c.gameConfig)[0].result);
`));
test('Single round multi-group field and team Skins preserve primary scope',()=>check(`
const c=fixture();c.isTournament=false;c.groups=c.rounds[1].groups;assert.equal(liveSkins(c,'g').remaining,0);
c.groups=[group('g',['A','B'],[5,5]),group('other',['C','D'],[3,3])];c.groups[1].players.forEach(p=>p.team='blue');c.gameConfig.teamSkins=true;
assert.deepEqual(liveSkins(c,'g'),s.calcScopedSkins(c.groups,c.course,true,c.gameConfig)[0].result);assert.deepEqual(liveSkins(c,'g').totals,{A:0,B:0,C:9,D:9});
`));
for(const positive of [false,true])test('Paired Nassau full side labels '+(positive?'positive':'negative'),()=>check(`
const c=fixture();c.games=['nassau'];c.rounds.forEach(round=>round.groups=[group('g',['A','B','C','D'],${positive?'[3,3,6,6]':'[6,6,3,3]'})]);
const p=c.rounds[1].groups[0].players,result=n.calcNassauRules(p,r.liveRoundCourse(c),false,c.gameConfig);
assert.equal(labels(result,result.front,p).leader,'${positive?'A + B':'C + D'}');assert.equal(labels(result,result.front,p).down,'${positive?'C + D':'A + B'}');
assert.equal(labels(result,0,p).leader,null);assert.deepEqual(r.calculateContestSettlement(c).netByPlayer,${positive?'{A:3,B:3,C:-3,D:-3}':'{A:-3,B:-3,C:3,D:3}'});
`));
test('Legacy Nassau keeps engine labels for two players',()=>check(`
const {calcNassauPress}=await import('./src/engine/calculators/nassau-press.ts').then(m=>m.default??m);const p=group('g',['Alice Smith','Bob Jones'],[3,4]).players;const result=calcNassauPress(...p);assert.equal(labels(result,2,p).leader,'Alice Smith');assert.equal(labels(result,2,p).down,'Bob Jones');
`));
test('UI uses scoped helper, side labels, complete dependencies and daily round context',()=>check(`
const ui=fs.readFileSync('app/contest/[id]/scorecard.tsx','utf8');assert.ok(!ui.includes('calcSkins(players'));assert.ok(!ui.includes('players[1].name'));assert.ok(ui.includes('liveSkinsStatus(contest, group.id)'));assert.ok(ui.includes('liveNassauLabels(result, nineStatus)'));assert.ok(!ui.includes('leader?.split'));assert.ok(!ui.includes('downPlayer.split'));assert.ok(ui.includes('[group.players, currentHole, contest.games, course, contest.gameConfig, auxiliary, activeGroups, group.id]'));assert.ok(ui.includes('calcStrokePlay([player], course)[0].toPar'));
const daily=fs.readFileSync('app/contest/[id]/index.tsx','utf8');assert.ok(daily.includes('teamCardPlayers(contest,scoreView === "daily")'));assert.ok(daily.includes('(scoreView === "daily" ? liveRoundCourse(contest) : contest.course).name'));assert.ok(daily.includes('scoreView === "daily" ? getActiveGroups(contest) : contest.groups'));
`));
test('Shared-ball daily cards select current round, cumulative includes both and labels teams',()=>check(`
const c=fixture();c.games=['alternate_shot'];c.rounds.forEach((round,i)=>{round.groups=[group('g',['A','B','C','D'],[9,9,9,9])];});c.auxiliaryByScope={'r1/g':{teamCards:{1:{red:4,blue:5}}},'r2/g':{teamCards:{1:{red:3,blue:4}}}};
assert.deepEqual(r.teamCardPlayers(c,true).map(p=>[p.name,p.scores[0]]),[['Team red',3],['Team blue',4]]);
assert.deepEqual(r.teamCardPlayers(c,false).map(p=>[p.name,p.scores[0]]),[['Team red',7],['Team blue',9]]);
`));
test('Scorecard gapped played holes use current-round indexed pars',()=>check(`
const {calcStrokePlay}=await import('./src/engine/calculators/stroke-play.ts').then(m=>m.default??m);const c=fixture(),p=group('g',['A'],[0]).players[0];p.scores[1]=5;c.rounds[1].course.holes[0].par=3;
assert.equal(calcStrokePlay([p],r.liveRoundCourse(c))[0].toPar,0);assert.equal(5-r.liveRoundCourse(c).holes[0].par,2);
`));
test('Weighted pending carry banner avoids incorrect fixed next-win promises',()=>check(`
const c=fixture();c.gameConfig.skinsScope='group';c.gameConfig.skinsTier='progressive';assert.equal(liveSkins(c,'g').remaining,171);
const ui=fs.readFileSync('app/contest/[id]/scorecard.tsx','utf8');assert.ok(!ui.includes('x value next win'));assert.ok(ui.includes('Unawarded units in this scope'));
`));
