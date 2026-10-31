const fs=require('fs'),path=require('path'),os=require('os'),ts=require('typescript');
const {inventory,scan,invalid}=require('./helpers/game-copy-guard.cjs');
const root=path.resolve(__dirname,'../..');
test('all discovered customer copy obeys the sole permitted count',()=>expect(scan(root)).toEqual([]));
test('base games + options + format support 50+',()=>{
 const m={exports:{}};
 new Function('exports','require','module',ts.transpileModule(fs.readFileSync('src/engine/types.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText) (m.exports,()=>({FREE_GAMES:[]}),m);
 expect(m.exports.PLAYABLE_GAME_COUNT).toBeGreaterThanOrEqual(50);
});
const bad=['30 game modes','30 supported game modes','57 available game modes','30 currently supported game modes','30 spectacular game modes','25+ game modes','57 ways to play','fifty game modes','50 game modes','50+ games','50+ ways to play','over 50 game modes','55+ game modes','4 core games','33 games','dozens of games','tons of games','endless games','every game','a library of N','{PLAYABLE_GAME_COUNT}','{count} game modes','THIRTY\n GAME MODES','twenty-one formats','50+ Game Modes'];
const categories=['scoresnap/src/ui/new-copy.ts','scoresnap/app/new-onboarding.tsx','scoresnap/src/services/new-provider.ts','scoresnap/src/engine/new-caption.ts','scoresnap/supabase/functions/new-mail/index.ts','GolfScorecardApp.jsx','site/new-page.html','scoresnap/docs/STORE_LISTING_DRAFT.md','scoresnap/tests/fixtures/new-figma.json'];
let scratch;
beforeAll(()=>{scratch=fs.mkdtempSync(path.join(os.tmpdir(),'ll-qs50plus-mutations-'));});
afterAll(()=>fs.rmSync(scratch,{recursive:true,force:true}));
function mutation(file,source){
 const target=path.join(scratch,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 try {expect(inventory(scratch)).toContain(file);expect(scan(scratch).some(e=>e.startsWith(file+':'))).toBe(true);}finally{fs.unlinkSync(target);}
}
test.each(categories)('newly discovered %s rejects every bad string with filename',file=>{
 for(const text of bad)mutation(file,/\.(html|md)$/.test(file)?text:JSON.stringify(text));
});
test.each([
 '<Text>30 ga<Text>me</Text> modes</Text>',
 '<span>30 ga<span>me</span> modes</span>',
 '<Text>30 sup<Text>ported</Text> game modes</Text>',
 '<Text>30 game mo<Text>des</Text></Text>',
 '<View><Text>30</Text><Text>game modes</Text></View>',
 '<div><span>30</span><span>game modes</span></div>',
 '<><span>30</span><span>game modes</span></>',
 '<Text>30&#32;game&nbsp;modes</Text>',
 'const n="30"; const copy=`${n} game modes`;',
 'const copy="30" + " game modes";',
 'const n=30; const copy=<Text>{n} game modes</Text>;',
])('assembled mutation: %s',source=>mutation('scoresnap/app/discovered.tsx',source));
test.each(['50+ game modes','$30/year','7-day free trial','3 scans a month','18 holes','Score: 57','Choose one preset for each game','STEP 02 Select Game Modes'])('positive control %s',s=>{
 expect(invalid(s)).toBe(false);
 const file='scoresnap/app/positive.tsx',target=path.join(scratch,file);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'const copy='+JSON.stringify(s));
 try{expect(scan(scratch).filter(e=>e.startsWith(file+':'))).toEqual([]);}finally{fs.unlinkSync(target);}
});
test('exact contextual contest allowlist works and stale entries fail',()=>{
 expect(scan(root).filter(e=>/Stale/.test(e))).toEqual([]);
 expect(scan(scratch).filter(e=>/Stale/.test(e))).toHaveLength(4);
});
test('imported template provider and assembled consumer are scanned',()=>{
 const provider=path.join(scratch,'scoresnap/src/services/n.ts');fs.mkdirSync(path.dirname(provider),{recursive:true});fs.writeFileSync(provider,'export const N="30"; export const T=`25+ game modes`;');
 try{mutation('scoresnap/app/discovered.tsx','import {N} from "../src/services/n"; const copy=`${N} game modes`;');}finally{fs.unlinkSync(provider);}
});

test('approved count preserves text across nested inline elements',()=>{
 const file='scoresnap/app/positive.tsx',target=path.join(scratch,file);
 fs.writeFileSync(target,'const copy=<span>50+ ga<span>me</span> modes</span>;');
 try{expect(scan(scratch).filter(e=>e.startsWith(file+':'))).toEqual([]);}finally{fs.unlinkSync(target);}
});

// Round-three independent verifier reproductions exercise the real discovery path.
test.each([
 '<p>30 ga<span>me mo</span>des</p>',
 '<p>30 ga<strong>me</strong> modes</p>',
 '<div><span>30</span><span>game modes</span></div>',
])('HTML inline adjacency rejects %s',source=>mutation('site/verify-independent.html',source));
test.each([
 'const copy=<Text>{["30", " game modes"].join("")}</Text>;',
 'const parts=["30", "game modes"]; const copy=<Text>{parts.join(" ")}</Text>;',
 'const copy=["25+", "game modes"].join(" ");',
])('array join assembly rejects %s',source=>mutation('scoresnap/app/verify-independent.tsx',source));
test.each([
 ['site/positive.html','<p>50+ ga<span>me mo</span>des</p>'],
 ['scoresnap/app/positive.tsx','const copy=<Text>{["50+", " game modes"].join("")}</Text>;'],
])('approved assembled copy passes in %s',(file,source)=>{
 const target=path.join(scratch,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 try{expect(scan(scratch).filter(e=>e.startsWith(file+":"))).toEqual([]);}finally{fs.unlinkSync(target);}
});

// An approved paragraph must not exempt unrelated separated labels in the file.
test('approved HTML does not hide the verifier separated-label reproduction',()=>
 mutation('site/verify-r3-independent.html','<p>50+ game modes</p><div><span style="display:block">30</span><span style="display:block">game</span><span style="display:block">modes</span></div>'));
test.each(['50+ game modes','<p>50+ game modes</p>'])('approved HTML alone passes: %s',source=>{
 const file='site/approved-only.html',target=path.join(scratch,file);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 try{expect(scan(scratch).filter(e=>e.startsWith(file+':'))).toEqual([]);}finally{fs.unlinkSync(target);}
});

// Round-two fixes for the independent qs50plusb verifier.
test.each(['ensp','thinsp','emsp','numsp','puncsp','hairsp','MediumSpace','ThickSpace','Tab','NewLine'])('HTML named whitespace %s rejects forbidden copy',entity=>
 mutation('site/verify-r1-own.html',`<p>30&${entity};game modes</p>`));
test('CSS flex order rejects visually assembled forbidden count',()=>
 mutation('site/verify-r1-own.html','<div style="display:flex"><span style="order:3">modes</span><span style="order:2">game </span><span style="order:1">30 </span></div>'));

test.each(['flex','grid'])('approved visually ordered %s copy passes',display=>{
 const file='site/approved-order.html',target=path.join(scratch,file);
 fs.writeFileSync(target,`<div style="display:${display}"><span style="order:3">modes</span><span style="order:1">50+ </span><span style="order:2">game </span></div>`);
 try{expect(scan(scratch).filter(e=>e.startsWith(file+':'))).toEqual([]);}finally{fs.unlinkSync(target);}
});
