import type { Contest } from '../stores/contest-store';
import { AuxiliaryData, GameType, SettlementSummary } from './types';
import { calculateSettlement } from './settlement';
export const scopeKey=(roundId:string|undefined,groupId:string)=>`${roundId??'default'}/${groupId}`;
export function scopedAuxiliary(contest:Contest,groupId:string,roundId?:string):AuxiliaryData {
  if (contest.gameConfig?.rulesVersion!==1) return contest.auxiliaryData??{};
  const scoped=contest.auxiliaryByScope?.[scopeKey(roundId,groupId)];
  if (scoped) return scoped;
  return !contest.isTournament && contest.groups.length===1 ? contest.auxiliaryData??{} : {};
}
/** Settle constituent rounds with their own courses/events; never sum unrelated hole cards. */
export function calculateContestSettlement(contest:Contest,games:GameType[]=contest.games,bet=contest.betUnit):SettlementSummary {
  if(contest.gameConfig?.rulesVersion!==1) return calculateSettlement(contest.groups.flatMap(g=>g.players),contest.course,games,bet,contest.auxiliaryData,contest.gameConfig,contest.groups);
  const rounds=contest.isTournament && contest.rounds?.length?contest.rounds:[{id:undefined,course:contest.course,groups:contest.groups}];
  const results=rounds.map(round=>{
    const groups=round.groups;
    // Field skins keep their cross-group economy. All event games are group scoped.
    return games.flatMap(game=>{
      if(game==='stableford'){
        const choices=Object.assign({},...groups.map(g=>scopedAuxiliary(contest,g.id,round.id).jokerDeclarations?.[0]??{}));
        return [calculateSettlement(groups.flatMap(g=>g.players),round.course??contest.course,[game],bet,{jokerDeclarations:{0:choices}},contest.gameConfig,groups)];
      }
      if (!['wolf','hammer','snake','greenies','bingo_bango_bongo','alternate_shot','chapman','match_play','nassau','nassau_press'].includes(game)) return [calculateSettlement(groups.flatMap(g=>g.players),round.course??contest.course,[game],bet,undefined,contest.gameConfig,groups)];
      return groups.map(g=>calculateSettlement(g.players,round.course??contest.course,[game],bet,scopedAuxiliary(contest,g.id,round.id),contest.gameConfig));
    });
  }).flat();
  const netByPlayer=Object.fromEntries(contest.groups.flatMap(g=>g.players).map(p=>[p.name,0]));
  if(results.some(r=>r.pending)) return {transactions:[],netByPlayer,pending:true};
  const transactions=results.flatMap(r=>r.transactions);
  for(const t of transactions){netByPlayer[t.to]=(netByPlayer[t.to]??0)+t.amount;netByPlayer[t.from]=(netByPlayer[t.from]??0)-t.amount;}
  for(const name of Object.keys(netByPlayer)) netByPlayer[name]=Math.round(netByPlayer[name]*100)/100;
  return {transactions,netByPlayer};
}
/** Shared-ball leaderboard cards come only from canonical team inputs, never a player's guessed score. */
export function teamCardPlayers(contest:Contest,currentOnly=false) {
 const rounds=contest.isTournament && contest.rounds?.length?(currentOnly?contest.rounds.filter(r=>r.number===contest.currentRound):contest.rounds):[{id:undefined,course:contest.course,groups:contest.groups}];
 const cards=new Map<string,import('./types').Player>();
 for(const round of rounds)for(const group of round.groups)for(const team of new Set(group.players.map(p=>p.team!))){
  const aux=scopedAuxiliary(contest,group.id,round.id),key=`${group.id}/${team}`;
  const scores=(round.course??contest.course).holes.map((_,i)=>aux.teamCards?.[i+1]?.[team]??0);
  const old=cards.get(key);if(old){old.scores=old.scores.map((n,i)=>n+(scores[i]??0));}else cards.set(key,{id:key,name:`Team ${team}`,handicap:0,team,scores});
 }
 return [...cards.values()];
}
