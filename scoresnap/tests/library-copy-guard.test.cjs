const fs=require('fs');
const path=require('path');
const {root,discover,scan}=require('./helpers/library-copy-guard.cjs');
const files=()=>Object.fromEntries(discover().map(p=>[p,fs.readFileSync(path.join(root,p),'utf8')]));
test('all discovered production copy is free of library inventory counts',()=>expect(scan(files(),true)).toEqual([]));
test.each(['30 game modes','50+ games','thirty modes','fifty-seven ways to play','THIRTY\n GAME   MODES','Play Skins and 25+ others','Library: 25 more','${PLAYABLE_GAME_COUNT} games','{PLAYABLE_GAME_COUNT} games'])('rejects %s',phrase=>{
 expect(scan({'scoresnap/app/probe.tsx':'const copy = `'+phrase+'`;'})).toEqual([expect.objectContaining({file:'scoresnap/app/probe.tsx'})]);
});
test('legitimate scan/trial counts and computed contest totals pass',()=>{
 const inventory=files();
 inventory['scoresnap/app/probe.tsx']='const a = "3 scans a month"; const b = "7-day free trial";';
 expect(scan(inventory)).toEqual([]);
});
test.each(['scoresnap/app/','scoresnap/src/ui/','scoresnap/src/components/','scoresnap/docs/APP_STORE_LISTING.md','scoresnap/app/onboarding.tsx','scoresnap/src/engine/','scoresnap/src/web/','scoresnap/supabase/functions/','scoresnap/site/','scoresnap/tests/fixtures/'])('real scanner detects mutation in %s',prefix=>{
 const inventory=files(); const file=Object.keys(inventory).find(p=>p.startsWith(prefix));
 expect(file).toBeDefined();
 inventory[file]+=/\.[jt]sx?$/.test(file)?'\nconst regression = "30 game modes";':'\n30 game modes';
 expect(scan(inventory)).toContainEqual(expect.objectContaining({file}));
});
test('walker discovers a newly added source file without an inventory edit',()=>{
 const file=path.join(root,'scoresnap/src/ui/__library_guard_probe.ts');
 try { fs.writeFileSync(file,'export const copy = "30 game modes";',{flag:'wx'});
 expect(scan(files())).toContainEqual(expect.objectContaining({file:'scoresnap/src/ui/__library_guard_probe.ts'}));
 } finally {fs.rmSync(file,{force:true});}
});

test('concatenation and JSX interpolation cannot hide inventory counts',()=>{
 for(const source of ['const a = PLAYABLE_GAME_COUNT + " games";', 'const a = <Text>{PLAYABLE_GAME_COUNT} games</Text>;', 'const a = `Available: ${PLAYABLE_GAME_COUNT} games`;'])
 expect(scan({'scoresnap/app/probe.tsx':source}).length).toBeGreaterThan(0);
});
test('removed exceptions fail stale checks and path changes do not inherit them',()=>{
 expect(scan({},true).every(h=>h.text==='stale allowlist entry')).toBe(true);
 expect(scan({'scoresnap/app/probe.tsx':'const a = `${t.games.length} Games`;'})).toHaveLength(1);
});
