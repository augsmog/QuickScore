import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const deps = {
  './online-store': { useOnlineStore: { getState: () => ({ events: {} }) } },
  '../services/ocr-review': { completeScores: scores => [...scores] },
  '../config/auth': { REAL_AUTH_CONFIGURED: false },
  './auth-store': { useAuthStore: { getState: () => ({}) } },
  '../services/guest-join': { generateJoinCode: () => 'ABC234' },
  zustand: require('zustand'),
  'zustand/middleware': { persist: creator => creator, createJSONStorage: () => ({}) },
  '@react-native-async-storage/async-storage': {},
  './persisted-keys': { CONTEST_STORAGE_KEY: 'test', createGatedStorage: storage => storage },
  '../services/tournament-sync': { syncScore: async () => {}, syncRound: async () => {}, syncRoundGroups: async () => {}, syncContestTournamentMeta: async () => {} },
  '../engine/contest-validation': { validateScoreWrite: (contest, groupId, playerId, hole, strokes) => {
    if (contest.gameConfig?.rulesVersion !== 1) return;
    const round = contest.isTournament ? contest.rounds?.find(r => r.number === contest.currentRound) : undefined;
    const group = (round?.groups ?? contest.groups).find(g => g.id === groupId);
    if (!group?.players.some(p => p.id === playerId) || !Number.isInteger(hole) || hole < 1 || hole > 18 || !Number.isInteger(strokes) || strokes < 0 || strokes > 99) throw Error('Invalid score entry');
    if (contest.status === 'completed') throw Error('Completed scorecards are locked');
  } },
  '../engine/contest-results': { scopeKey: (roundId, groupId) => [roundId || 'default', groupId].join('/') },
  './scan-store': { useScanStore: { getState: () => ({ tier: 'pro' }) } },
};
const module = { exports: {} };
const sourceText = fs.readFileSync('src/stores/contest-store.ts', 'utf8');
const code = ts.transpileModule(sourceText, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
new Function('require', 'module', 'exports', code)(id => {
  if (!(id in deps)) throw Error('Unexpected dependency ' + id);
  return deps[id];
}, module, module.exports);
const store = module.exports.useContestStore;
const holes = Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 }));
const player = id => ({ id, name: id, accountId: 'account-' + id, userId: 'user-' + id, handicap: 3, scores: Array(18).fill(0) });
const fixture = () => {
  const six = Array.from({ length: 6 }, (_, i) => player('p' + i));
  six[0].scores[1] = 5;
  six[1].scores[1] = 3;
  return {
    id: 'contest-1', name: 'Tournament', status: 'active', createdAt: '', course: { name: 'Course', holes },
    betUnit: 1, hasTeams: false, games: [], isTournament: true, currentRound: 1,
    groups: [{ id: 'legacy-group', name: 'Legacy', players: [player('legacy')] }],
    rounds: [
      { id: 'round-1', number: 1, name: 'Round 1', course: { name: 'Course', holes }, groups: [{ id: 'group-1', name: 'Six', players: six }, { id: 'other-group', name: 'Other', players: [player('other')] }] },
      { id: 'round-2', number: 2, name: 'Round 2', course: { name: 'Course 2', holes }, groups: [{ id: 'round-2-group', name: 'Round 2 group', players: [player('later')] }] },
    ],
  };
};
function install(contest) { store.setState({ contests: [contest], activeContestId: 'another-active-contest' }); }

const {PartialImportSession} = await import('../src/services/partial-import-session.ts');
const {confirmPartialImportToStore, nextHoleToScore} = await import('../src/services/partial-import-confirm.ts');
const ctx = {accountId:'acct',contestId:'contest-1',roundId:'round-1',groupId:'group-1'};
function sessionFor(c=ctx, ids=['p0','p1','p2','p3','p4','p5']) {
  const s = new PartialImportSession(); s.setAccount('acct');
  const token=s.beginReview('acct',c);
  s.completeReview(token,c,{
    rows:ids.map(id=>({name:id,source:'ocr',matchedPlayerId:id,requiredHoles:[10],scores:[4],confidence:[.99],nameConfidence:.99})),
    players:ids.map(id=>({id,name:id,scores:{}})),holeIdentities:[10],playedHoles:new Set([10]),coverage:'full-group'
  });
  return s;
}
let passed=0, failed=0;
function probe(name,fn) {try {fn();passed++;console.log('PASS '+name);} catch(e){failed++;console.log('FAIL '+name+' '+e.stack);}}
probe('six-player real-store patch preserves identities, other groups, rounds, and holes',()=>{
 const c=fixture();install(c);const before=structuredClone(c);const s=sessionFor();
 const out=confirmPartialImportToStore(s,'acct',ctx,store.getState());assert.equal(out.ok,true);
 const actual=store.getState().contests[0];
 for(let i=0;i<6;i++){const expected=structuredClone(before.rounds[0].groups[0].players[i]);expected.scores[9]=4;assert.deepEqual(actual.rounds[0].groups[0].players[i],expected);}
 assert.deepEqual(actual.rounds[0].groups[1],before.rounds[0].groups[1]);assert.deepEqual(actual.rounds[1],before.rounds[1]);assert.deepEqual(actual.groups,before.groups);
 const once=store.getState();assert.equal(confirmPartialImportToStore(s,'acct',ctx,store.getState()).ok,true);assert.equal(store.getState(),once);
});
probe('real-store conflict is atomic, draft retained, no false-success retry',()=>{
 const c=fixture();c.rounds[0].groups[0].players[5].scores[9]=7;install(c);const before=store.getState(),s=sessionFor();
 assert.deepEqual(confirmPartialImportToStore(s,'acct',ctx,store.getState()),{ok:false,error:'Reviewed import conflicts with an existing score',needsReReview:true});
 assert.equal(store.getState(),before);assert.equal(s.getState().status,'draft');assert.equal(confirmPartialImportToStore(s,'acct',ctx,store.getState()).ok,false);
});
probe('locked contest and changed active round reject without writes',()=>{
 for(const kind of ['locked','round']){const c=fixture();if(kind==='locked')c.status='completed';else c.currentRound=2;install(c);const before=store.getState();
 const out=confirmPartialImportToStore(sessionFor(),'acct',ctx,store.getState());assert.equal(out.ok,false);assert.equal(out.needsReReview,true);assert.equal(store.getState(),before);}
});
probe('single-round null context writes to correct contest',()=>{
 const c=fixture();c.isTournament=false;delete c.rounds;delete c.currentRound;c.groups=[{id:'group-1',players:[player('p0')]}];install(c);
 const context={...ctx,roundId:null};assert.equal(confirmPartialImportToStore(sessionFor(context,['p0']),'acct',context,store.getState()).ok,true);
 assert.equal(store.getState().contests[0].groups[0].players[0].scores[9],4);
});
probe('signout clears draft and denies binder call',()=>{
 const c=fixture();install(c);const before=store.getState(),s=sessionFor();s.setAccount(null);
 assert.equal(confirmPartialImportToStore(s,'acct',ctx,store.getState()).ok,false);assert.equal(store.getState(),before);assert.equal(s.getState().status,'empty');
});
probe('non-Error store rejection is caught and draft retained',()=>{
 const s=sessionFor();const out=confirmPartialImportToStore(s,'acct',ctx,{applyReviewedPartialImport(){throw 'denied';}});
 assert.deepEqual(out,{ok:false,error:'denied',needsReReview:true});assert.equal(s.getState().status,'draft');
});
probe('shotgun rotation, unrelated players and partial holes',()=>{
 assert.equal(nextHoleToScore([18,1,2],['a','b'],[{playerId:'a',hole:18},{playerId:'b',hole:18},{playerId:'a',hole:1},{playerId:'outsider',hole:1}]),1);
 assert.equal(nextHoleToScore([],['a'],[]),null);
 assert.equal(nextHoleToScore([9],['a'],[{playerId:'a',hole:9}]),null);
});
console.log(JSON.stringify({passed,failed}));process.exitCode=failed?1:0;
