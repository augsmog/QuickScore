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
assert.ok(even.lines.every(l=>l.endsWith('No net payouts')));
}
const {sampleRecap}=await import('./src/ui/recap/fixture.ts').then(m=>m.default??m);
assert.equal(sampleRecap.winner.name,'Alex Rivera');
assert.equal(sampleRecap.players.reduce((sum,p)=>sum+Math.round(p.net*100),0),0);
`], { stdio: 'pipe' });
});
