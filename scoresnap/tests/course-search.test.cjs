const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: name => { if (!(name in dependencies)) throw Error(`Unexpected import ${name}`); return dependencies[name]; }, ...globals });
  return exports;
}
const logic = load('supabase/functions/course-data/logic.ts');
const detail = require('./fixtures/golfcore-detail.json');
const search = require('./fixtures/golfcore-search.json');
const feature = flag => load('src/config/features.ts',{}, { process: { env: { EXPO_PUBLIC_FEATURE_COURSE_SEARCH: flag } } });
test.each([undefined,'false','','TRUE',' true ','1','true'])('flag alone enables only literal true: %s',flag => expect(feature(flag).COURSE_SEARCH_ENABLED).toBe(flag === 'true'));
function api(enabled, invoke) { return load('src/services/course-api.ts', { '../config/features': { COURSE_SEARCH_ENABLED: enabled }, '../db/supabase': { supabase: { functions: { invoke } } }, '../../supabase/functions/course-data/logic': logic }); }
test('disabled API stays offline',async () => { const invoke = jest.fn(); const a=api(false,invoke); expect(await a.searchCourses('torrey')).toEqual([]); expect(await a.getCourseDetail(detail.slug)).toBeNull(); expect(invoke).not.toHaveBeenCalled(); });
test('enabled API uses Supabase GET and maps responses',async () => { const invoke=jest.fn().mockResolvedValueOnce({data:search}).mockResolvedValueOnce({data:{course:detail}}); const a=api(true,invoke); expect((await a.searchCourses('torrey pines'))[0].id).toBe(detail.slug); expect((await a.getCourseDetail(detail.slug)).teeBoxes).toHaveLength(3); expect(invoke.mock.calls[0]).toEqual(['course-data?q=torrey%20pines',{method:'GET'}]); });
test('quota state works for cached payload and 503',async () => { const invoke=jest.fn().mockResolvedValueOnce({data:{...search,quota_exhausted:true}}).mockResolvedValueOnce({error:{context:{json:async()=>({error:'quota_exhausted'})}}}); const a=api(true,invoke); await a.searchCourses('torrey'); expect(a.courseSearchResting).toBe(true); expect(await a.searchCourses('torrey')).toEqual([]); expect(a.courseSearchResting).toBe(true); });
test('Torrey Pines mapping retains tee-specific cards and gender ratings',() => { const c=logic.mapCourse(detail); const black=c.teeBoxes.find(t=>t.name==='Black'); expect(black.courseRating).toBe(78.8); expect(black.slopeRating).toBe(148); expect(black.holes).toHaveLength(18); expect(black.holes[0]).toMatchObject({number:1,par:4,handicap:5,yards:451}); expect(c.teeBoxes.find(t=>t.name==='White (W)').holes[0].handicap).toBe(7); expect(c.teeBoxes.find(t=>t.name==='White (M)').holes[0].handicap).toBe(5); });
test('missing data stays null; explicit empty/partial cards never borrow reference data',() => { const c=logic.mapCourse({layouts:[{holes:[{position:1,par:4,stroke_index:2,yards:999}],tees:[{name:'Empty',holes:[]},{name:'Partial',holes:[{position:1}]},{name:'Absent'}]}]}); expect(c.holes).toBeNull(); expect(c.teeBoxes[0]).toMatchObject({courseRating:null,slopeRating:null,totalYards:null,holes:[]}); expect(c.teeBoxes[1].holes[0]).toMatchObject({par:null,handicap:null,yards:null}); expect(c.teeBoxes[2].holes[0]).toMatchObject({par:4,handicap:2,yards:null}); expect(api(true,jest.fn()).teeBoxToCourse('Unknown',c.teeBoxes[1])).toBeNull(); });
test.each([[500,0,null,false],[499,10,null,false],[1,1,0,false],[499,9,1,true],[0,0,null,true]])('guard %s %s %s', (calls,minute,remaining,expected)=>expect(logic.guardDecision(calls,minute,remaining)).toBe(expected));
test('cache hit does not spend a call',()=>expect(logic.guardDecision(500,10,0,500,10,true)).toBe(true));
test('custom caps',()=>expect(logic.guardDecision(5,0,null,5,2)).toBe(false));
test('projection uses partial days of UTC calendar month',()=> { expect(logic.projectMonth(100,new Date('2026-10-16T12:00:00Z'))).toBeCloseTo(200); expect(logic.projectMonth(100,new Date('2026-02-15T00:00:00Z'))).toBeCloseTo(200); expect(logic.projectMonth(0,new Date('2026-10-01T00:00:00Z'))).toBe(0); });
test('query normalization',()=>expect(logic.normalizeQuery('  TORREY   Pines\n South ')).toBe('torrey pines south'));
test('public provider credential removed from source/app',()=> { const forbidden=['EXPO_PUBLIC','GOLF_COURSE','API_KEY'].join('_'); for(const dir of ['src','app']) { const walk = p => { for(const entry of fs.readdirSync(p,{withFileTypes:true})) { const full=path.join(p,entry.name); if(entry.isDirectory()) walk(full); else expect(fs.readFileSync(full,'utf8')).not.toContain(forbidden); } }; walk(path.join(__dirname,'..',dir)); } });

// Execute the actual handler with a mocked Supabase database and fetch; no network/key needed.
function edge({cached=null,allowed=1,response={status:200,body:search},role='anon'}={}) {
 let handler; const rows=[]; let writes=[];
 const db={ from: table => { let operation='select',value; const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:cached}),single:async()=>({data:{calls:0}}),upsert:v=>{writes.push(v);return Promise.resolve({data:null})},update:v=>{operation='update';value=v;return chain},then:resolve=>resolve({data:null})}; const eq=chain.eq; chain.eq=(...args)=>{if(operation==='update') rows.push(value);return eq(...args)};return chain; }, rpc:jest.fn(async()=>({data:allowed})) };
 const fetch=jest.fn(async()=>({status:response.status,ok:response.status<400,headers:new Headers({'X-RateLimit-Limit':'500','X-RateLimit-Remaining':'499','X-RateLimit-Reset':'reset','Retry-After':'60'}),json:async()=>response.body}));
 load('supabase/functions/course-data/index.ts',{'https://deno.land/std@0.177.0/http/server.ts':{serve:fn=>handler=fn},'https://esm.sh/@supabase/supabase-js@2':{createClient:()=>db},'./logic.ts':logic},{Deno:{env:{get:name=>name==='GOLFCORE_API_KEY'?'fixture-placeholder':undefined}},Response,URL,URLSearchParams,AbortSignal,atob,fetch,console:{error:jest.fn()}});
 return {call:query=>handler(new Request(`https://example.test/?${query}`,{headers:{authorization:`Bearer x.${Buffer.from(JSON.stringify({role})).toString('base64url')}.x`}})),fetch,rows,writes,db};
}
test('edge cache hit skips fetch and ledger reservation',async()=>{ const e=edge({cached:{payload:search,fetched_at:new Date().toISOString()}});const r=await e.call('q=torrey');expect((await r.json()).source).toBe('cache');expect(e.fetch).not.toHaveBeenCalled();expect(e.db.rpc).not.toHaveBeenCalled(); });
test('edge records upstream status and official rate headers',async()=>{const e=edge();expect((await e.call('q=torrey')).status).toBe(200);expect(e.rows[0]).toMatchObject({status:200,ratelimit_limit:500,ratelimit_remaining:499,ratelimit_reset:'reset',retry_after:'60',is_quota_error:false});expect(e.fetch.mock.calls[0][0]).toBe('https://api.golfcore.org/v1/courses?q=torrey&limit=20');});
test('edge exhausted guard never calls upstream; stale cache survives',async()=>{ const e=edge({allowed:null,cached:{payload:search,fetched_at:'2020-01-01'}});const r=await (await e.call('q=torrey')).json();expect(r.quota_exhausted).toBe(true);expect(r.source).toBe('cache');expect(e.fetch).not.toHaveBeenCalled(); });
test('edge quota error is logged and fails open',async()=>{const e=edge({response:{status:429,body:{error:'quota_exhausted'}}});const r=await e.call('q=torrey');expect(r.status).toBe(503);expect(await r.json()).toMatchObject({error:'quota_exhausted',fallback:'manual'});expect(e.rows[0].is_quota_error).toBe(true);});
test.each(['usage=1','count=1'])('admin %s denied for anon',async query=>{const e=edge();expect((await e.call(query)).status).toBe(403);expect(e.fetch).not.toHaveBeenCalled();});
test.each(['q=x','near=91,0','near=1,2&radius=51','slug=../usage','q=test&limit=51','q=test&slug=test'])('rejects unsafe query %s',async query=>{const e=edge();expect((await e.call(query)).status).toBe(400);expect(e.fetch).not.toHaveBeenCalled();});
test('count measures four totals and reserves each call',async()=>{const e=edge({role:'service_role'});const r=await (await e.call('count=1')).json();expect(Object.keys(r.totals)).toHaveLength(4);expect(e.fetch).toHaveBeenCalledTimes(4);expect(e.db.rpc).toHaveBeenCalledTimes(4);});
test('complete card converts but a truncated card requires manual entry',()=>{const a=api(true,jest.fn());const tee=logic.mapCourse(detail).teeBoxes[0];expect(a.teeBoxToCourse(detail.name,tee).holes).toHaveLength(18);expect(a.teeBoxToCourse(detail.name,{...tee,holes:tee.holes.slice(0,4)})).toBeNull();});
test('old-month cache refresh and detail response preserve attribution URL',async()=>{const e=edge({response:{status:200,body:detail}});const r=await (await e.call(`slug=${detail.slug}`)).json();expect(r.course.slug).toBe(detail.slug);expect(r.attribution).toContain(detail.url);expect(e.writes[0].source).toBe('golfcore');});
test('provider error body never leaks into response',async()=>{const e=edge({response:{status:500,body:{error:'private upstream debug'}}});const r=await e.call('q=torrey');expect(r.status).toBe(503);expect(await r.text()).not.toContain('private');expect(e.rows[0].status).toBe(500);});
test.each([[429,{},true],[200,{quota_exceeded:true},true],[403,{error:{code:'monthly_quota_exceeded'}},true],[200,search,false]])('quota body recognition %s', (status,body,expected)=>expect(logic.isQuotaResponse(status,body)).toBe(expected));
test('quota ceilings are hard: env can only lower 500/month and 10/minute', () => {
  const handler = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/course-data/index.ts'), 'utf8');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/006_course_data.sql'), 'utf8');
  expect(handler).toContain('Math.min(positive("GOLFCORE_MONTHLY_CAP", 500), 500)');
  expect(handler).toContain('Math.min(positive("GOLFCORE_PER_MIN_CAP", 10), 10)');
  expect(sql).toMatch(/LEAST\(coalesce\(p_monthly_cap, 500\), 500\)/);
  expect(sql).toMatch(/LEAST\(coalesce\(p_minute_cap, 10\), 10\)/);
});
