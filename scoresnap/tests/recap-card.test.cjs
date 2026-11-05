const { execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
test('recap uses settlement nets and game ledger, with ties, even and empty rounds', async () => {
  await run(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
import assert from 'node:assert/strict';
const {buildRecapModel}=await import('./src/ui/recap/model.ts').then(m=>m.default??m);
const details={title:'Round',course:'Pines',games:['skins','nassau'],completed:true,liveUrl:'https://example.com/r/test'};
const settlement={netByPlayer:{Zed:-10,Amy:15,Ben:-5,Even:0},transactions:[
{from:'Zed',to:'Amy',amount:10,gameType:'skins'},
{from:'Ben',to:'Amy',amount:5,gameType:'nassau'}]};
const before=JSON.stringify(settlement);
const model=buildRecapModel(settlement,details);
assert.deepEqual(model.players.map(p=>p.name),['Amy','Even','Ben','Zed']);
assert.deepEqual(model.players.map(p=>p.amount),['+$15.00','Even','-$5.00','-$10.00']);
assert.equal(model.winner.name,'Amy');
assert.ok(model.lines[0].endsWith('Amy +$10.00'));
assert.equal(model.lines[1],'Nassau: Amy +$5.00');
assert.equal(model.liveUrl,details.liveUrl);
assert.equal(JSON.stringify(settlement),before);
const tie=buildRecapModel({netByPlayer:{Ben:5,Amy:5,Zed:-10},transactions:[]},details);
assert.equal(tie.headline,'Shared honors');
assert.equal(tie.winnerNames,'Amy & Ben');
for(const netByPlayer of [{},{Amy:0,Ben:0}]) {
const even=buildRecapModel({netByPlayer,transactions:[]},details);
assert.equal(even.winner,null);
assert.equal(even.headline,'All square');
assert.ok(even.lines.every(l=>l.endsWith('No net settlement amounts')));
}
const {sampleRecap}=await import('./src/ui/recap/fixture.ts').then(m=>m.default??m);
assert.equal(sampleRecap.winner.name,'Alex Rivera');
assert.equal(sampleRecap.players.find(p=>p.name==='Alex Rivera').grossScore,66);
assert.equal(sampleRecap.players.find(p=>p.name==='Alex Rivera').netScore,60);
const course={name:'Pines',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:380}))};
const scorecard={course,players:[
{id:'a',name:'Amy',handicap:12,scores:Array.from({length:18},(_,i)=>i<12?5:4)},
{id:'b',name:'Ben',handicap:0,scores:[4,0,5]},
{id:'z',name:'Zed',scores:[5,0,6]},
{id:'e',name:'Even',handicap:18,scores:[]},
]};
const scoreBefore=JSON.stringify(scorecard);
const scored=buildRecapModel(settlement,{...details,scorecard});
const amy=scored.players.find(p=>p.name==='Amy');
assert.equal(amy.grossScore,84);
assert.equal(amy.netScore,72);
assert.equal(amy.scoreLabel,'Gross 84 · Net 72');
const ben=scored.players.find(p=>p.name==='Ben');
assert.equal(ben.grossScore,9);
assert.equal(ben.netScore,9);
assert.equal(ben.holesPlayed,2);
assert.equal(ben.scoreLabel,'Gross 9 · Net 9 · 2 holes played');
const zed=scored.players.find(p=>p.name==='Zed');
assert.equal(zed.grossScore,11);
assert.equal(zed.netScore,11);
assert.equal(zed.holesPlayed,2);
assert.equal(scored.players.find(p=>p.name==='Even').scoreLabel,'No scores yet');
assert.equal(model.players[0].grossScore,null);
assert.equal(model.players[0].scoreLabel,'Scores unavailable');
assert.equal(JSON.stringify(scorecard),scoreBefore);
// Only deduct strokes on entered holes, including non-contiguous holes.
const partial=buildRecapModel(settlement,{...details,scorecard:{course,players:[
{id:'a',name:'Amy',handicap:20,scores:[5,0,6]},
]}}).players.find(p=>p.name==='Amy');
assert.equal(partial.grossScore,11);
assert.equal(partial.netScore,8);
const plus=buildRecapModel(settlement,{...details,scorecard:{course,players:[
{id:'a',name:'Amy',handicap:-2,scores:Array(18).fill(4)},
]}}).players.find(p=>p.name==='Amy');
assert.equal(plus.netScore,74);
assert.equal(sampleRecap.players.reduce((sum,p)=>sum+Math.round(p.net*100),0),0);
`], { stdio: 'pipe' });
});
