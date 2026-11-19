import type {Contest} from '../stores/contest-store';
import {AuxiliaryData,GameType,validateVariationSetup} from './types';
import {canHostTournament,canUseGame,Tier} from '../services/entitlements';
import {scopeKey,scopedAuxiliary} from './contest-results';
export function validateHostContest(contest:Contest,tier:Tier) {
 if(!canHostTournament(contest,tier) || contest.games.some(g=>!canUseGame(g,tier))) throw new Error('Your plan does not include this hosting configuration');
 if(contest.gameConfig?.rulesVersion===1){
  const identities=new Map<string,string>();const names=new Map<string,string>();
  for(const round of contest.rounds??[{groups:contest.groups}])for(const group of round.groups)for(const p of group.players){if(identities.has(p.id) && identities.get(p.id)!==p.name || names.has(p.name) && names.get(p.name)!==p.id)throw new Error('Tournament player IDs and names must remain consistent across rounds');identities.set(p.id,p.name);names.set(p.name,p.id);}

  for(const round of contest.isTournament && contest.rounds?.length?contest.rounds:[{groups:contest.groups}]){
   const error=validateVariationSetup(round.groups,contest.games,contest.gameConfig,contest.betUnit);if(error)throw new Error(error);
  }
 }
}
export function validateContestChange(before:Contest,after:Contest) {
 const moneyKeys=['gameConfig','games','betUnit','teams','hasTeams','teamAName','teamBName','auxiliaryData','auxiliaryByScope'] as const;
 const changed=moneyKeys.some(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
 const started=(before.rounds??[{groups:before.groups}]).some(r=>r.groups.some(g=>g.players.some(p=>p.scores.some(n=>n>0)))) || !!before.auxiliaryByScope;
 const structuralChanged=['course','groups','rounds'].some(k=>JSON.stringify(before[k as keyof Contest])!==JSON.stringify(after[k as keyof Contest]));
 if(structuralChanged && started)throw new Error('Roster, course and imported scores must use their dedicated validated actions after play starts');
 if(changed && (started || before.status==='completed' || before.gameConfig?.rulesVersion!==after.gameConfig?.rulesVersion)) throw new Error('Rules and money are locked after play starts. Create a separate contest to adopt changed rules. Legacy outcomes are preserved.');
 if(before.status==='completed' && (JSON.stringify(before.groups)!==JSON.stringify(after.groups) || JSON.stringify(before.rounds)!==JSON.stringify(after.rounds))) throw new Error('Completed scorecards are locked');
}
export function validateAuxiliaryWrite(contest:Contest,groupId:string,key:keyof AuxiliaryData,hole:number,value:any) {
 const round=contest.isTournament?contest.rounds?.find(r=>r.number===contest.currentRound):undefined;
 const group=(round?.groups??contest.groups).find(g=>g.id===groupId);if(!group)throw new Error('Unknown input group');
 const course=round?.course??contest.course, players=group.players, ids=new Set(players.map(p=>p.id));
 const existing=scopedAuxiliary(contest,groupId,round?.id);
 if(!Number.isInteger(hole) || hole<(key==='jokerDeclarations'?0:1) || hole>course.holes.length)throw new Error('Invalid hole');
 if(key==='jokerDeclarations'){
  if(existing.jokerDeclarations?.[0] && JSON.stringify(existing.jokerDeclarations[0])!==JSON.stringify(value))throw new Error("Public Joker choices are locked");
  if(players.some(p=>p.scores.some(n=>n>0)))throw new Error('Joker choices must be recorded before the round');
  if(!players.every(p=>Array.isArray(value?.[p.id]) && value[p.id].length===2 && new Set(value[p.id]).size===2 && value[p.id].every((n:number)=>Number.isInteger(n)&&n>=1&&n<=course.holes.length)))throw new Error('Record two distinct valid Joker holes for every player');
 }
 if(key==='bisque'){
  if(existing.bisque?.[hole] && JSON.stringify(existing.bisque[hole])!==JSON.stringify(value))throw new Error("Bisque declarations are locked");
  if(players.some(p=>p.scores[hole-1]>0))throw new Error('Bisques must be declared before playing the hole');
  if(value?.beforePlay!==true)throw new Error('Confirm pre-play declaration');
  for(const p of players){const n=value?.strokes?.[p.id], budget=Math.round(p.courseHandicaps?.[course.name]??p.handicap);const used=Object.entries(existing.bisque??{}).reduce((sum,[h,e])=>sum+(Number(h)===hole?0:e.strokes[p.id]??0),0);if(!Number.isInteger(n)||n<0||n>2||budget<0||used+n>budget)throw new Error('Bisque budget exceeded (0–2 per hole, full nonnegative course handicap)');}
 }
 if(key==='wolf'){
  const wolf=players[(hole-1)%4];
  if(players.length!==4 || !value || typeof value.isLoneWolf!=='boolean' || value.partnerId!==null && (!ids.has(value.partnerId)||value.partnerId===wolf.id))throw new Error('Invalid Wolf partner');
  if(value.beforePlay && players.some(p=>p.scores[hole-1]>0))throw new Error('Pre-play Wolf choices are locked after scoring');
  if(existing.wolf?.[hole]?.beforePlay && JSON.stringify(existing.wolf[hole])!==JSON.stringify(value))throw new Error('Pre-play Wolf choice is already locked');
  if(value.blind && (!contest.gameConfig?.blindWolf || !value.beforePlay || !value.isLoneWolf || value.partnerId!==null || value.refused))throw new Error('Blind Wolf requires a pre-tee solo declaration');
  if(value.refused && (!contest.gameConfig?.pigVariation || !value.beforePlay || !value.partnerId || value.isLoneWolf || value.blind))throw new Error('Pig requires the selected partner to refuse before play');
 }
 if(key==='snake' && (!Array.isArray(value)||new Set(value).size!==value.length||value.some((id:string)=>!ids.has(id))))throw new Error('Record unique three-putters in chronological order');
 if(key==='greenies' && (course.holes[hole-1].par!==3 || value!==null && !ids.has(value)))throw new Error('Invalid par-3 greenie');
 if(key==='bbb' && ['bingo','bango','bongo'].some(k=>value?.[k]!==null && !ids.has(value?.[k])))throw new Error('Confirm every BBB award or explicitly select no award');
 if(key==='hammer' && (!value || typeof value.hammered!=='boolean' || typeof value.accepted!=='boolean' || value.hammered && !ids.has(value.hammerBy)))throw new Error('Invalid hammer decision');
 if(key==='junk' && (!value || !Array.isArray(value.sandies)||!Array.isArray(value.barkies)||[...value.sandies,...value.barkies].some((id:string)=>!ids.has(id)||players.find(p=>p.id===id)!.scores[hole-1]>course.holes[hole-1].par) || value.greenie!==null && !ids.has(value.greenie)))throw new Error('Confirm actual qualifying junk feats');
}
export function validateScoreWrite(contest:Contest,groupId:string,playerId:string,hole:number,strokes:number) {
 const round=contest.isTournament?contest.rounds?.find(r=>r.number===contest.currentRound):undefined;
 const group=(round?.groups??contest.groups).find(g=>g.id===groupId),course=round?.course??contest.course;
 if(!group?.players.some(p=>p.id===playerId) || !Number.isInteger(hole)||hole<1||hole>course.holes.length || !Number.isInteger(strokes)||strokes<0||strokes>99)throw new Error('Invalid score entry');
 if(contest.status==='completed')throw new Error('Completed scorecards are locked');
 if(contest.gameConfig?.rulesVersion!==1 || contest.gameConfig.inputRulesVersion!==1 || strokes===0)return;
 const aux=scopedAuxiliary(contest,groupId,round?.id);
 if(contest.gameConfig.jokerEnabled && !aux.jokerDeclarations?.[0])throw new Error('Record public Joker choices before scoring or importing');
 if(contest.gameConfig.bisqueHandicap && !aux.bisque?.[hole])throw new Error('Declare Bisque strokes before scoring or importing this hole');
}
