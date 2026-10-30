import { Player, NassauResult } from "../types";

export function calcNassau(p1: Player, p2: Player, _course?: import("../types").Course): NassauResult {
  let front = 0;
  let back = 0;

  for (let i = 0; i < 9; i++) {
    if (p1.scores[i] < p2.scores[i]) front++;
    else if (p2.scores[i] < p1.scores[i]) front--;
  }

  for (let i = 9; i < 18; i++) {
    if (p1.scores[i] < p2.scores[i]) back++;
    else if (p2.scores[i] < p1.scores[i]) back--;
  }

  const overall = front + back;
  return { p1: p1.name, p2: p2.name, front, back, overall };
}

/** Version-one Nassau: one ledger shared by the result view and cash settlement. */
export function calcNassauRules(players: Player[], course: import('../types').Course, pressed: boolean, config: import('../types').GameConfig) {
  if (players.length !== 2 && players.length !== 4) throw new Error('Nassau requires two individuals or two pairs');
  if (config.alohaPressOn18 && config.noPressLast) throw new Error('Aloha and No Press on 9/18 conflict');
  if (!pressed && (config.pressThePress || config.noPressLast)) throw new Error('Select Nassau with Presses');
  const teams = players.length === 2 ? players.map(p => [p]) : [...new Set(players.map(p => p.team))].map(t => players.filter(p => p.team === t));
  if (teams.length !== 2 || teams.some(t => t.length !== players.length / 2 || (players.length === 4 && !t[0].team))) throw new Error('Nassau requires two complete pairs');
  const handicap = (p: Player) => Math.round(p.courseHandicaps?.[course.name] ?? p.handicap);
  const lowest = Math.min(...players.map(handicap));
  const strokes = (hcp: number, index: number) => Math.floor(hcp / 18) + (index <= hcp % 18 ? 1 : 0);
  const outcomes: number[] = [];
  for (let i = 0; i < 18; i++) {
    if (players.some(p => !Number.isFinite(p.scores[i]) || p.scores[i] <= 0)) break;
    const best = teams.map(t => Math.min(...t.map(p => p.scores[i] - (config.netHandicap ? strokes(handicap(p) - lowest, course.holes[i].hcp) : 0))));
    outcomes.push(Math.sign(best[1] - best[0]));
  }
  const weights = config.nassauWeights ?? [1,1,1];
  if (weights.length !== 3 || weights.some((w,i) => w !== [1,1,2][i]) && weights.some(w => w !== 1)) throw new Error('Unsupported Nassau weights');
  type Bet = {id:string;parent?:string;start:number;end:number;stake:number;status:number;child:boolean;complete:boolean};
  const bets: Bet[] = [
    {id:'front',start:1,end:9,stake:weights[0],status:0,child:false,complete:false},
    {id:'back',start:10,end:18,stake:weights[1],status:0,child:false,complete:false},
    {id:'overall',start:1,end:18,stake:weights[2],status:0,child:false,complete:false},
  ];
  for (let hole = 1; hole <= outcomes.length; hole++) {
    for (const bet of [...bets]) {
      if (hole < bet.start || hole > bet.end) continue;
      bet.status += outcomes[hole - 1];
      bet.complete = hole === bet.end;
      const next = hole + 1;
      if (pressed && (!bet.parent || config.pressThePress) && !bet.child && Math.abs(bet.status) >= 2 && next <= bet.end && !(config.noPressLast && (next === 9 || next === 18))) {
        bet.child = true;
        bets.push({id:`${bet.id}/${next}`,parent:bet.id,start:next,end:bet.end,stake:bet.stake,status:0,child:false,complete:false});
      }
    }
  }
  if (config.alohaPressOn18) bets.push({id:'aloha',start:18,end:18,stake:.5,status:outcomes[17] ?? 0,child:false,complete:outcomes.length === 18});
  const totals = Object.fromEntries(players.map(p => [p.name,0]));
  for (const bet of bets.filter(b => b.complete)) {
    const value = Math.sign(bet.status) * bet.stake;
    teams.forEach((team,i) => team.forEach(p => { totals[p.name] += value * (i === 0 ? 1 : -1) / team.length; }));
  }
  return {p1:teams[0].map(p => p.name).join(' + '),p2:teams[1].map(p => p.name).join(' + '),front:bets[0].status,back:bets[1].status,overall:bets[2].status,bets,totals};
}
