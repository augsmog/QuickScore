import type { Contest } from '../stores/contest-store';
import { AuxiliaryData, GameType, SettlementSummary } from './types';
import { calculateSettlement } from './settlement';
import { calcMatchPlay } from './calculators/match-play';
import { calcScopedSkins } from './calculators/skins';
import { calcStableford } from './calculators/stableford';
import type { PartialImportCell } from '../services/partial-import';
import { planPartialImportGames, type PartialImportGameState } from '../services/partial-import-games';
export const scopeKey=(roundId:string|undefined,groupId:string)=>`${roundId??'default'}/${groupId}`;
// Lazy require, same as the contest-store wrappers: contest-validation.ts imports scopeKey/
// scopedAuxiliary from this module, so a static import back here would be circular.
function validateScoreWrite(...args: Parameters<typeof import('./contest-validation').validateScoreWrite>) {
  if (args[0].gameConfig?.rulesVersion === 1) return require('./contest-validation').validateScoreWrite(...args);
}
export function scopedAuxiliary(contest:Contest,groupId:string,roundId?:string):AuxiliaryData {
  if (contest.gameConfig?.rulesVersion!==1) return contest.auxiliaryData??{};
  const scoped=contest.auxiliaryByScope?.[scopeKey(roundId,groupId)];
  if (scoped) return scoped;
  return !contest.isTournament && contest.groups.length===1 ? contest.auxiliaryData??{} : {};
}
/** The explicit reviewed-played scope for a partial import, never inferred from scores. */
export function confirmedPlayedHoles(contest: Contest, roundId: string | undefined, groupId: string): number[] {
  return [...(contest.confirmedPlayedHolesByScope?.[scopeKey(roundId, groupId)] ?? [])];
}

/**
 * Applies a reviewed partial-import patch (AUG-1172/AUG-1396) and records the explicitly
 * confirmed played-hole scope for the contest/round/group, even when the patch itself is empty
 * (every reviewed cell was an identical no-op -- see partial-import.ts). Pure and atomic: throws
 * before any mutation on an invalid patch/scope, and returns the same `contest` reference when
 * nothing actually changes so a caller can skip persisting/re-rendering.
 */
export function applyReviewedPartialImportToContest(
  contest: Contest,
  roundId: string | null,
  groupId: string,
  patch: readonly PartialImportCell[],
  playedHoles: readonly number[]
): Contest {
  let round: NonNullable<Contest['rounds']>[number] | undefined;
  if (contest.isTournament) {
    round = contest.rounds?.find(r => r.id === roundId);
    if (!round || round.number !== contest.currentRound) throw new Error("Reviewed import round is no longer active");
  } else if (roundId !== null) {
    throw new Error("Reviewed import round does not match contest context");
  }
  const groups = round?.groups ?? contest.groups;
  const group = groups.find(g => g.id === groupId);
  const course = round?.course ?? contest.course;
  if (!group || !Array.isArray(patch) || !Array.isArray(playedHoles)) throw new Error("Invalid reviewed import group or patch");
  if (contest.status === "completed") throw new Error("Completed scorecards are locked");
  if (![9, 18].includes(course.holes.length) || course.holes.some(h => !Number.isInteger(h.num) || h.num < 1 || h.num > 18) ||
      new Set(course.holes.map(h => h.num)).size !== course.holes.length) throw new Error("Course hole mapping requires manual entry");
  const courseHoleNums = new Set(course.holes.map(h => h.num));
  if (!playedHoles.length || playedHoles.some(h => !Number.isInteger(h) || !courseHoleNums.has(h))) {
    throw new Error("Reviewed import played holes must be explicitly reviewed course holes");
  }

  const seen = new Set<string>();
  const cells = patch.map(cell => {
    if (!cell || typeof cell.playerId !== "string" || !cell.playerId || !Number.isInteger(cell.hole) ||
        typeof cell.strokes !== "number" || !Number.isSafeInteger(cell.strokes) || cell.strokes < 1 || cell.strokes > 99) {
      throw new Error("Invalid reviewed import cell");
    }
    const playerMatches = group.players.filter(p => p.id === cell.playerId);
    const holeIndex = course.holes.findIndex(h => h.num === cell.hole);
    if (playerMatches.length !== 1 || holeIndex < 0) throw new Error("Reviewed import cell is outside the selected group or course");
    const key = JSON.stringify([cell.playerId, cell.hole]);
    if (seen.has(key)) throw new Error("Reviewed import patch contains duplicate cells");
    seen.add(key);
    const player = playerMatches[0];
    const existing = player.scores[holeIndex];
    if (existing !== undefined && existing !== null && existing !== 0 && existing !== cell.strokes) {
      throw new Error("Reviewed import conflicts with an existing score");
    }
    validateScoreWrite(contest, groupId, cell.playerId, holeIndex + 1, cell.strokes);
    return { playerId: cell.playerId, holeIndex, strokes: cell.strokes };
  });

  const scope = scopeKey(round?.id, groupId);
  const existingScope = contest.confirmedPlayedHolesByScope?.[scope] ?? [];
  const mergedScope = [...new Set([...existingScope, ...playedHoles])].sort((a, b) => a - b);
  const scopeChanged = mergedScope.length !== existingScope.length;
  const scoreChanged = cells.some(cell => group.players.find(p => p.id === cell.playerId)?.scores[cell.holeIndex] !== cell.strokes);
  if (!scoreChanged && !scopeChanged) return contest;

  const updatedGroups = groups.map(g => g.id !== groupId ? g : ({
    ...g,
    players: g.players.map(p => {
      const changes = cells.filter(cell => cell.playerId === p.id && p.scores[cell.holeIndex] !== cell.strokes);
      if (!changes.length) return p;
      const scores = [...p.scores];
      for (const cell of changes) scores[cell.holeIndex] = cell.strokes;
      return { ...p, scores };
    }),
  }));

  const confirmedPlayedHolesByScope = { ...(contest.confirmedPlayedHolesByScope ?? {}), [scope]: mergedScope };
  return round
    ? { ...contest, confirmedPlayedHolesByScope, rounds: contest.rounds!.map(r => r.id === round!.id ? { ...r, groups: updatedGroups } : r) }
    : { ...contest, confirmedPlayedHolesByScope, groups: updatedGroups };
}

/**
 * Bridges the persisted confirmed-played scope and canonical scoped auxiliary/team data to the
 * pure `planPartialImportGames` model, so outstanding side-game history questions (AUG-1397) are
 * asked only for explicitly confirmed-played holes -- never every course hole.
 */
export function planPartialImportGamesForScope(
  contest: Contest,
  roundId: string | undefined,
  groupId: string,
  games: readonly GameType[] = contest.games
): PartialImportGameState[] {
  const round = contest.isTournament ? contest.rounds?.find(r => r.id === roundId) : undefined;
  const group = (round?.groups ?? contest.groups).find(g => g.id === groupId);
  if (!group) throw new Error("Unknown group for partial-import game plan");
  const course = round?.course ?? contest.course;
  const parByHole = Object.fromEntries(course.holes.map(h => [h.num, h.par]));
  const teamByPlayer = Object.fromEntries(group.players.map(p => [p.id, p.team ?? null]));
  return planPartialImportGames({
    games,
    playedHoles: confirmedPlayedHoles(contest, roundId, groupId),
    parByHole,
    teamByPlayer,
    playerIds: group.players.map(p => p.id),
    aux: scopedAuxiliary(contest, groupId, round?.id),
  });
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

/** Live cards and previews use the active round's course, including course handicaps. */
export function liveRoundCourse(contest: Contest) {
  const round = contest.isTournament ? contest.rounds?.find(r => r.number === contest.currentRound) : undefined;
  return round?.course ?? contest.course;
}

/** Same current-round competition boundary as primary Skins cards and cash. */
export function liveSkinsStatus(contest: Contest, groupId: string) {
  const groups = contest.isTournament && contest.rounds && contest.currentRound
    ? contest.rounds.find(r => r.number === contest.currentRound)?.groups ?? []
    : contest.groups;
  const index = groups.findIndex(g => g.id === groupId);
  if (index < 0) return undefined;
  const results = calcScopedSkins(groups, liveRoundCourse(contest), contest.games.includes('skins_carry'), contest.gameConfig);
  return results[contest.gameConfig?.skinsScope === 'group' ? index : 0]?.result;
}

/** Engine sides may be pairs; never infer their labels from roster position. */
export function liveNassauLabels(result: {p1:string;p2:string}, status: number) {
  return {leader:status > 0 ? result.p1 : status < 0 ? result.p2 : null,
    down:status > 0 ? result.p2 : result.p1};
}
