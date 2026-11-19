const fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}) {const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(id=>{if(id in deps)return deps[id];throw Error(id);},m,m.exports);return m.exports;}
const {restoreOwnerContest}=load('src/services/restore-owner-contest.ts',{'./owner-invite':{snapshotOwnerInviteCode:()=> 'ABC234'}});
function setup() {
 const syncScore=jest.fn(async()=>{});
 const snapshot={contest_id:'contest',name:'Restored',protocol:1,course:{holes:[{num:1,par:4}]},games:[],id_map:[{kind:'round',local_id:'local-round',server_id:'server-round'},{kind:'group',local_id:'local-group',server_id:'server-group'},{kind:'player',local_id:'local-player',server_id:'server-player'}],rounds:[{id:'server-round',number:1,name:'Round',course:{holes:[{num:1,par:4}]},groups:[{id:'server-group',name:'Group'}],players:[{id:'server-player',displayName:'Host',group_id:'server-group',cells:[{hole:1,strokes:null}]}]}]};
 const deps={'./online-store':{useOnlineStore:{getState:()=>({events:{contest:{snapshot}}})}},'../services/ocr-review':{},'../config/auth':{REAL_AUTH_CONFIGURED:true},'./auth-store':{},'../services/guest-join':{},zustand:require('zustand'),'zustand/middleware':{persist:f=>f,createJSONStorage:()=>({})},'@react-native-async-storage/async-storage':{},'./persisted-keys':{},'../services/tournament-sync':{syncScore},'expo-crypto':{randomUUID:()=> 'edit'}};
 const {useContestStore:store}=load('src/stores/contest-store.ts',deps);
 return {store,syncScore,snapshot};
}
test('restored single-round score uses the mapped round rather than the contest ID',()=>{
 const {store,syncScore,snapshot}=setup(),c=restoreOwnerContest(snapshot);
 expect(c.isTournament).toBe(false);expect(c.rounds[0].id).not.toBe(c.id);
 store.setState({contests:[c]});store.getState().updateScore(c.id,'local-group','local-player',1,4);
 expect(store.getState().contests[0].groups[0].players[0].scores[0]).toBe(4);
 expect(syncScore).toHaveBeenCalledWith('contest','local-round','local-player',1,4,1,'edit');
});
test('ordinary single rounds retain the contest-ID sync contract',()=>{
 const {store,syncScore,snapshot}=setup(),c={...restoreOwnerContest(snapshot),remoteRestored:false};delete c.rounds;
 store.setState({contests:[c]});store.getState().updateScore(c.id,'local-group','local-player',1,4);
 expect(syncScore).toHaveBeenCalledWith('contest','contest','local-player',1,4,1,'edit');
});
test('restored tournaments still select their current round',()=>{
 const {store,syncScore,snapshot}=setup(),c=restoreOwnerContest(snapshot);
 c.rounds.push({...c.rounds[0],id:'local-round-2',number:2});c.isTournament=true;c.currentRound=2;
 store.setState({contests:[c]});store.getState().updateScore(c.id,'local-group','local-player',1,5);
 expect(syncScore).toHaveBeenCalledWith('contest','local-round-2','local-player',1,5,2,'edit');
});
