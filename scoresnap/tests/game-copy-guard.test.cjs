const fs=require('fs'),path=require('path'),os=require('os'),ts=require('typescript');
const {inventory,scan,invalid}=require('./helpers/game-copy-guard.cjs');
const root=path.resolve(__dirname,'../..');
test('all discovered customer copy obeys the sole permitted count',()=>expect(scan(root)).toEqual([]));
test('base games + options + format support 50+',()=>{
 const m={exports:{}};
 new Function('exports','require','module',ts.transpileModule(fs.readFileSync('src/engine/types.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText) (m.exports,()=>({FREE_GAMES:[]}),m);
 expect(m.exports.PLAYABLE_GAME_COUNT).toBeGreaterThanOrEqual(50);
});
const bad=['30 game modes','25+ game modes','57 ways to play','fifty game modes','50 game modes','50+ games','50+ ways to play','over 50 game modes','55+ game modes','4 core games','33 games','dozens of games','tons of games','endless games','every game','a library of N','{PLAYABLE_GAME_COUNT}','{count} game modes','THIRTY\n GAME MODES','twenty-one formats','50+ Game Modes'];
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
 '<View><Text>30</Text><Text>game modes</Text></View>',
 '<div><span>30</span><span>game modes</span></div>',
 '<><span>30</span><span>game modes</span></>',
 '<Text>30&#32;game&nbsp;modes</Text>',
 'const n="30"; const copy=`${n} game modes`;',
 'const copy="30" + " game modes";',
 'const n=30; const copy=<Text>{n} game modes</Text>;',
])('assembled mutation: %s',source=>mutation('scoresnap/app/discovered.tsx',source));
test.each(['50+ game modes','$30/year','7-day free trial','3 scans a month','18 holes','Score: 57'])('positive control %s',s=>{
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
