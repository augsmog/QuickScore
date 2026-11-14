// AUG-1129: Back from edit / tournament-rounds returns to the originating tab, even after a reload
// (no in-memory history). The tab travels in ?from=, not in router history.
const fs=require('fs'),ts=require('typescript');
const load=()=>{const m={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync('src/ui/contest-back.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports);return m.exports;};
const {contestBackHref,contestChildHref,contestTabFromPathname}=load();

test.each(['scorecard','leaderboard','games','settlement'])('Back target returns to %s',t=>{
 expect(contestBackHref('c',t)).toBe('/contest/c/'+t);
 expect(contestChildHref('c','edit',t)).toBe('/contest/c/edit?from='+t);
});
test('missing, unknown, or array-valued from falls back to scorecard / first value',()=>{
 expect(contestBackHref('c')).toBe('/contest/c/scorecard');
 expect(contestBackHref('c','evil/../x')).toBe('/contest/c/scorecard');
 expect(contestBackHref('c',['games','x'])).toBe('/contest/c/games');
});
test('active tab is derived from pathname',()=>{
 expect(contestTabFromPathname('/contest/c/settlement')).toBe('settlement');
 expect(contestTabFromPathname('/contest/c')).toBe('scorecard');
});
test.each(['edit','tournament-rounds'])('%s screen Back replaces to the from-tab, never router.back()',f=>{
 const src=fs.readFileSync(`app/contest/[id]/${f}.tsx`,'utf8');
 expect(src).not.toMatch(/router\.back\(\)/);
 expect(src).toMatch(/router\.replace\(contestBackHref\(id!, from\)/);
});
test('header buttons carry the active tab into the nested route',()=>{
 const src=fs.readFileSync('app/contest/[id]/_layout.tsx','utf8');
 expect(src).toMatch(/contestChildHref\(id, "edit", activeTab\)/);
 expect(src).toMatch(/contestChildHref\(id, "tournament-rounds", activeTab\)/);
});
