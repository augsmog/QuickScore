import type { Contest } from '../stores/contest-store';
import { AuxiliaryData, GameType, SettlementSummary } from './types';
import { calculateSettlement } from './settlement';
import { calcMatchPlay } from './calculators/match-play';
import { calcStableford } from './calculators/stableford';
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

/** Use the same round/group declarations for the points leaderboard and settlement. */
export function contestStableford(contest: Contest) {
  const rounds = contest.isTournament && contest.rounds?.length ? contest.rounds : [{id:undefined, course:contest.course, groups:contest.groups}];
  const totals = new Map<string, ReturnType<typeof calcStableford>[number]>();
  for (const round of rounds) {
    const choices = Object.assign({}, ...round.groups.map(g => scopedAuxiliary(contest,g.id,round.id).jokerDeclarations?.[0] ?? {}));
    for (const result of calcStableford(round.groups.flatMap(g=>g.players),round.course ?? contest.course,contest.gameConfig,{jokerDeclarations:{0:choices}})) {
      const previous = totals.get(result.playerId);
      totals.set(result.playerId, previous ? {...result,points:previous.points+result.points,holePoints:[...previous.holePoints,...result.holePoints]} : result);
    }
  }
  return [...totals.values()].sort((a,b)=>b.points-a.points);
}

/** Display independent matches with the same round cards, course and events used for cash. */
export function contestMatchPlay(contest: Contest) {
  const rounds = contest.isTournament && contest.rounds?.length ? contest.rounds : [{id:undefined, name:undefined, course:contest.course, groups:contest.groups}];
  return rounds.flatMap(round => round.groups.filter(group => group.players.length >= 2).map(group => {
    const [p1,p2] = group.players;
    return {key:scopeKey(round.id,group.id),roundName:round.name,p1,p2,
      status:calcMatchPlay(p1,p2,round.course ?? contest.course,contest.gameConfig,scopedAuxiliary(contest,group.id,round.id)).finalStatus};
  }));
}

/** Primary game cards are independent round results, just like constituent cash ledgers.
 * Keep legacy/single-round objects intact; remap event namespaces only for versioned tournaments.
 */
export function contestPrimaryRounds(contest: Contest): {key:string;roundName?:string;contest:Contest}[] {
  if (contest.gameConfig?.rulesVersion !== 1 || !contest.isTournament || !contest.rounds?.length) {
    return [{key:'single',contest}];
  }
  return contest.rounds.map(round => ({
    key:round.id,
    roundName:round.name || `Round ${round.number}`,
    contest:{...contest,isTournament:false,rounds:undefined,course:round.course ?? contest.course,groups:round.groups,
      auxiliaryData:{},auxiliaryByScope:Object.fromEntries(round.groups.map(group =>
        [scopeKey(undefined,group.id),scopedAuxiliary(contest,group.id,round.id)]))},
  }));
}
