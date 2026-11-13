import { ANALYTICS_CONTRACT } from '../analytics-contract';
declare const describe: any, it: any, expect: any;
const path = require('node:path');
const { scan, inventory, validate } = require('./analytics-contract-scan.cjs');
const root = path.resolve(__dirname,'../../..');
describe('analytics contract',()=>{
  it('covers every literal event, logger method, property and web allow-list entry',()=>{
    const found = inventory(root);
    expect(found.calls.length).toBeGreaterThan(20);
    expect(found.web).toHaveLength(6);
    expect(validate(ANALYTICS_CONTRACT,found)).toEqual([]);
  });
  it('deeply freezes the inventory',()=>{
    expect(Object.isFrozen(ANALYTICS_CONTRACT)).toBe(true);
    for(const entry of Object.values(ANALYTICS_CONTRACT)){
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.files)).toBe(true);
      expect(Object.isFrozen(entry.allowedProps)).toBe(true);
    }
  });
  it('tracks round finalization at its routed screen and rejects the old emitter path',()=>{
    const event = {round_finalized: ANALYTICS_CONTRACT.round_finalized};
    const call = 'posthog?.capture("round_finalized", {})';
    expect(validate(event,scan(call,'app/contest/[id]/index.tsx'))).toEqual([]);
    expect(validate(event,scan(call,'app/contest/[id]/scorecard.tsx')))
      .toContain('file:round_finalized:app/contest/[id]/scorecard.tsx');
  });
  it('rejects missing, removed, renamed and unknown-property events in negative controls',()=>{
    const fixture = {known:{files:['fixture.tsx'],allowedProps:['count']}};
    expect(validate(fixture,scan('posthog?.capture("known", { count: 1 })','fixture.tsx'))).toEqual([]);
    expect(validate(fixture,scan('posthog?.capture("new_name", {})','fixture.tsx'))).toContain('missing:new_name');
    expect(validate(fixture,scan('// removed capture','fixture.tsx'))).toContain('stale:known');
    expect(validate(fixture,scan("posthog?.capture('known', { count: 1, private_field: 2 })",'fixture.tsx'))).toContain('property:known:private_field');
    expect(validate(fixture,scan('posthog?.capture("known")','other.tsx'))).toContain('file:known:other.tsx');
  });
  it('scans logger calls and web allow-list changes, ignoring strings and comments',()=>{
    const fixture={'posthogAppLogger.saved':{files:['fixture.tsx'],allowedProps:['count']}};
    expect(validate(fixture,scan('posthogAppLogger.saved({count:1})','fixture.tsx'))).toEqual([]);
    expect(validate(fixture,scan('posthogAppLogger.saved({extra:true})','fixture.tsx'))).toContain('property:posthogAppLogger.saved:extra');
    expect(scan('const text = `capture("fake")`; // posthogAppLogger.fake()','fixture.tsx').calls).toEqual([]);
    const web=scan('const PROPERTY_KEYS = { known: ["private_field"] }','fixture.tsx');
    expect(validate({known:{files:[],allowedProps:[]}},web)).toContain('web-property:known:private_field');
    expect(validate({},web)).toContain('web-missing:known');
  });
});
