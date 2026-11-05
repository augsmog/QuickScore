const { execFileSync } = require('node:child_process');
test('confirmed tournament totals isolate rounds, courses and player identities', () => {
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
import assert from 'node:assert/strict';
import * as loaded from './src/services/tournament-totals.ts';
const {confirmedRoundTotal, confirmedTournamentTotals} = loaded.default ?? loaded;
const player=(id, scores, status='active')=>({id,displayName:'Same name',status,cells:scores.map(([hole,strokes])=>({hole,strokes,version:1}))});
const round=(id,holes,players)=>({id,name:id,course:{holes:holes.map(num=>({num}))},players});
const first=round('r1',[1,2],[player('p1',[[1,4],[2,5]]),player('p2',[[1,3],[2,null]])]);
const second=round('r2',[1],[player('p1',[[1,6],[2,15]])]);
let totals=confirmedTournamentTotals({rounds:[first,second]});
assert.equal(totals.length,2);
assert.equal(totals[0].strokes,15); // r2 hole 2 belongs to no hole on its own course
assert.equal(totals[0].complete,true);
assert.equal(totals[1].strokes,3);
assert.equal(totals[1].complete,false); // cleared cell and absent from second round
assert.deepEqual(totals[1].rounds[1],{roundId:'r2',strokes:null,scored:0,holes:1,complete:false});
first.players[0].cells[0].strokes=null; // authoritative clear removes strokes and completion
assert.equal(confirmedTournamentTotals({rounds:[first,second]})[0].strokes,11);
assert.equal(confirmedTournamentTotals({rounds:[first,second]})[0].complete,false);
assert.equal(confirmedRoundTotal(round('broken',[],[player('p1',[[1,4]])]),'p1').strokes,null);
assert.equal(confirmedRoundTotal(round('broken',[],[player('p1',[[1,4]])]),'p1').complete,false);
assert.equal(confirmedRoundTotal(round('wd',[1],[player('p1',[[1,4]],'WD')]),'p1').complete,false);
assert.equal(confirmedRoundTotal(round('empty',[1],[player('p1',[])]),'p1').strokes,null);
assert.equal(confirmedRoundTotal(round('bad',[1,1,0,null,19],[player('p1',[[1,4]])]),'p1').holes,1);
assert.deepEqual(confirmedTournamentTotals({rounds:[]}),[]);
`], { stdio: 'pipe' });
});
