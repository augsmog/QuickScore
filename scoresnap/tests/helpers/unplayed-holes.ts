import assert from 'node:assert/strict';
import { calcStableford, calcModStableford, calcQuota, calcChicago, calcDots, calcAcesDeuces } from '../../src/engine/calculators';
import { calculateSettlement } from '../../src/engine/settlement';
import type { GameType } from '../../src/engine/types';
const course = { name: 'Unplayed', holes: Array.from({length:18}, (_, i) => ({num:i+1,par:4,hcp:i+1})) };
const games: GameType[] = ['stableford','mod_stableford','quota','chicago','dots','aces_deuces'];
// Includes uneven progress: an unplayed opponent must not generate an ace.
for (const played of [[], [0,1,2,3,4,5,6,7,8], [0,2,5,11]]) {
  for (const missing of [false, true]) {
    const players = ['A','B'].map((name,p) => ({id:name,name,handicap:p*10,
      scores:Array.from({length:18}, (_,i) => played.includes(i) && (p===0 || i%2===0) ? (p===0 ? 3 : 6) : 0)}));
    if (missing) for (const p of players) {
      // Sparse slots, explicit undefined, and truncated arrays all mean unplayed.
      for (let i=0;i<p.scores.length;i++) if (!p.scores[i]) delete p.scores[i];
      p.scores[17] = undefined as any;
      while (p.scores.length && p.scores.at(-1) == null) p.scores.pop();
    }
    for (const p of players) {
      const n = p.scores.filter(s=>s>0).length;
      const a = p.name==='A';
      for (const [calc,per] of [[calcStableford,a?3:0],[calcModStableford,a?5:-3]] as const) {
        const row=calc([p],course)[0];
        assert.equal(row.points,n*per || 0);
        assert.equal(row.holePoints.length,18);
        course.holes.forEach((_,i)=>assert.equal(row.holePoints[i],p.scores[i]>0?per:0));
      }
      const q=calcQuota([p],course)[0], c=calcChicago([p],course)[0];
      assert.equal(q.points,n*(a?3:0)); assert.equal(c.grossPoints,q.points);
      assert.equal(q.quota,36-p.handicap); assert.equal(c.quota,q.quota);
      assert.equal(q.overUnder,q.points-q.quota); assert.equal(c.netScore,c.grossPoints-c.quota);
      const dots=calcDots([p],course);
      assert.equal(dots.totals[p.name],n*(a?2:-1) || 0);
      assert.deepEqual(dots.breakdown[p.name],{birdies:a?n:0,pars:0,bogeys:0,doubles:a?0:n});
    }
    const events=calcAcesDeuces(players,course);
    const aces=players[0].scores.flatMap((s,i)=>s>0?[{hole:i+1,playerName:'A'}]:[]);
    const deuces=players[1].scores.flatMap((s,i)=>s>0?[{hole:i+1,playerName:'B'}]:[]);
    assert.deepEqual(events.aces,aces); assert.deepEqual(events.deuces,deuces);
    assert.deepEqual(events.totals,{A:aces.length+deuces.length,B:0-aces.length-deuces.length});
    for (const game of games) {
      const settlement=calculateSettlement(players,course,[game],1);
      if (!played.length) assert.deepEqual(settlement.transactions,[]);
      else {
        assert.ok(settlement.netByPlayer.A>0,game);
        assert.equal(settlement.netByPlayer.A,-settlement.netByPlayer.B);
      }
    }
  }
}
console.log('unplayed-hole regressions passed');
