import { buildTeeSheet } from '../tee-sheet';
import { contestGroupStatuses, type ContestGroupStatus } from '../contest-group-status';
import type { Contest } from '../../stores/contest-store';
declare const describe: any, it: any, expect: any;
const row = (groupId: string, hole = 1, wave?: 'A' | 'B', teeTime?: string): ContestGroupStatus =>
  ({ groupId, name: groupId, startSlot: { hole, wave }, teeTime, status: { kind: 'not_started' } });

describe('tee sheet', () => {
  it('orders 18 shotgun groups by numeric hole, A/B/no wave, then input order', () => {
    const input = [row('10B',10,'B'), row('1none'), row('1B',1,'B'), row('10A',10,'A'),
      row('1A',1,'A'), row('1Atie',1,'A'), ...Array.from({length:12},(_,i)=>row(`h${i+2}`,i+2))];
    const result = buildTeeSheet(input, 'shotgun');
    expect(result).toHaveLength(18);
    expect(result.slice(0,4).map(r=>r.groupId)).toEqual(['1A','1Atie','1B','1none']);
    expect(result.filter(r=>r.startSlot.hole===10).map(r=>r.startKey)).toEqual(['10A','10B','10']);
    expect(result.map(r=>r.startSlot.hole)).toEqual([...input.map(r=>r.startSlot.hole)].sort((a,b)=>a-b));
  });
  it('orders midnight, morning, noon and afternoon, preserving equal-time input order', () => {
    const input = ['1:00 PM','12:30 PM','12:00 AM','11:59 AM','12:00 PM','12:30 PM'].map((t,i)=>row(`${i}`,1,undefined,t));
    for (const type of [undefined, 'tee_times'] as const) {
      expect(buildTeeSheet(input,type).map(r=>r.groupId)).toEqual(['2','3','4','1','5','0']);
      expect(buildTeeSheet(input,type).map(r=>r.startKey)).toEqual(['12:00 AM','11:59 AM','12:00 PM','12:30 PM','12:30 PM','1:00 PM']);
    }
  });
  it('keeps input order if any tee time is missing or invalid', () => {
    for (const time of [undefined,'13:00 PM','9:60 AM','10:03','nonsense']) {
      const input = [row('later',1,undefined,'1:00 PM'),row('missing',1,undefined,time),row('earlier',1,undefined,'8:00 AM')];
      expect(buildTeeSheet(input).map(r=>r.groupId)).toEqual(['later','missing','earlier']);
      expect(buildTeeSheet(input)[1].startKey).toBe(time ?? null);
    }
  });
  it('returns an empty field and never mutates frozen inputs', () => {
    expect(buildTeeSheet([],'shotgun')).toEqual([]);
    const input = [row('b',10,'B'),row('a',1,'A')];
    const before = JSON.stringify(input);
    input.forEach(r=>{Object.freeze(r.startSlot);Object.freeze(r.status);Object.freeze(r);});Object.freeze(input);
    expect(buildTeeSheet(input,'shotgun').map(r=>r.groupId)).toEqual(['a','b']);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('adapts real tournament group statuses and preserves progress', () => {
    const contest: Contest = {id:'c',name:'c',course:{name:'course',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:300}))},
      status:'active',betUnit:1,hasTeams:false,groups:[],games:[],createdAt:'',isTournament:true,currentRound:1,
      rounds:[{id:'r',number:1,name:'r',groups:[{id:'b',name:'B',players:[]},{id:'a',name:'A',players:[{id:'p',name:'p',handicap:0,scores:[4]}]}]}]};
    const statuses = contestGroupStatuses(contest,{now:'2026-11-12',startType:'shotgun',startSlots:{a:{hole:1,wave:'A'},b:{hole:10,wave:'B'}}});
    expect(buildTeeSheet(statuses,'shotgun')).toEqual([
      {...statuses[1],startKey:'1A'}, {...statuses[0],startKey:'10B'},
    ]);
    expect(buildTeeSheet(statuses,'shotgun')[0].status).toEqual({kind:'thru',n:1});
  });
});
