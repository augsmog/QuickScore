import { validateFlightRule, validateHostContest } from '../contest-validation';
import { contestFlightStandings } from '../contest-flights';
import type { FlightRule } from '../flights';
import type { Contest } from '../../stores/contest-store';
declare const describe: any, it: any, expect: any;
const base = (flightRule?: FlightRule): Contest => ({id:'c',name:'c',course:{name:'c',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:300}))},status:'active',betUnit:1,hasTeams:false,groups:[{id:'g',name:'g',players:[{id:'p',name:'p',handicap:5,scores:Array(18).fill(4)}]}],games:[],createdAt:'',...(flightRule ? {flightRule} : {})});
const bands: FlightRule = {mode:'bands',bands:[{name:'Low',maxHandicap:10},{name:'High',maxHandicap:30}]};
const manual: FlightRule = {mode:'manual',assignments:{p:'Blue'}};
describe('stored flight rules',()=>{
  it('accepts legacy contests without adding a field and returns no_flights',()=>{
    const contest = base(); const before = JSON.stringify(contest);
    expect(()=>validateFlightRule(contest)).not.toThrow();
    expect(()=>validateHostContest(contest,'pro')).not.toThrow();
    expect(contestFlightStandings(contest,undefined,{rankMode:'gross'})).toBe('no_flights');
    expect(contestFlightStandings(contest)).toBe('no_flights');
    expect(JSON.stringify(contest)).toBe(before);
  });
  it('validates bands and manual rules and round trips through JSON',()=>{
    for(const rule of [bands,manual,{mode:"manual",assignments:{},fallback:"All"} as FlightRule]){
      const contest = base(rule), restored: Contest = JSON.parse(JSON.stringify(contest));
      expect(()=>validateHostContest(restored,'pro')).not.toThrow();
      expect(restored.flightRule).toEqual(rule);
      expect(contestFlightStandings(restored,undefined,{rankMode:'gross'})).toEqual(contestFlightStandings(contest,rule,{rankMode:'gross'}));
    }
  });
  it('prefers an explicit rule over the stored rule',()=>{
    expect(contestFlightStandings(base(bands),manual,{rankMode:'gross'}).map(f=>f.name)).toEqual(['Blue']);
    const stored = contestFlightStandings(base(bands),undefined,{rankMode:'gross'});
    expect(stored === 'no_flights' ? [] : stored.map(f=>f.name)).toEqual(['Low','High']);
  });
  it('rejects every invalid rule at both validation boundaries',()=>{
    const invalid: FlightRule[] = [
      {mode:'bands',bands:[]}, {mode:'bands',bands:[{name:' ',maxHandicap:1}]},
      {mode:'bands',bands:[{name:'A',maxHandicap:1},{name:'A',maxHandicap:2}]},
      {mode:'bands',bands:[{name:'A',maxHandicap:2},{name:'B',maxHandicap:1}]},
      {mode:'bands',bands:[{name:'A',maxHandicap:NaN}]}, {mode:'bands',bands:[{name:'A',maxHandicap:Infinity}]},
      {mode:'manual',assignments:{absent:' '}}, {mode:'manual',assignments:{},fallback:' '},
    ];
    for(const rule of invalid){
      expect(()=>validateFlightRule(base(rule))).toThrow(RangeError);
      expect(()=>validateHostContest(base(rule),'pro')).toThrow(RangeError);
    }
  });
});
