import { AuxiliaryData, Course, GameConfig, GameType, Player, configForGame } from './types';

export const ACTUAL_INPUT_GAMES: GameType[] = ['wolf','hammer','snake','greenies','bingo_bango_bongo'];
/** One event ledger for previews and cash. Stops at the first unconfirmed hole. */
export function actualInputLedger(game: GameType, players: Player[], course: Course, auxiliary: AuxiliaryData = {}, config: GameConfig = {}) {
  if(config.rulesVersion===1)config=configForGame(config,game);
  auxiliary=normalizeAuxiliaryData(auxiliary);
  if(new Set(players.map(p=>p.id)).size!==players.length || new Set(players.map(p=>p.name)).size!==players.length)throw new Error("Use unique player IDs and names");
  const totals = Object.fromEntries(players.map(p => [p.name, 0]));
  let holes = 0, snakeHolder = '', changes = 0, carry = 1;
  const events: {hole:number;playerName:string}[] = [];
  const wolfHoles: import('./calculators/wolf').WolfHoleResult[]=[];
  const hammerHoles: import('./calculators/hammer').HammerResult['holeResults']=[];
  const greenieHoles: import('./calculators/greenies').GreenieResult[]=[];
  const bbbHoles: import('./calculators/bingo-bango-bongo').BBBResult['holeResults']=[];
  const result=()=>({totals,holes,pending:holes!==course.holes.length,snakeHolder,events,wolfHoles,hammerHoles,greenieHoles,bbbHoles});
  const pay = (winner: Player, loser: Player, units: number) => { totals[winner.name] += units; totals[loser.name] -= units; };
  const find = (id: string | null) => players.find(p => p.id === id);
  if (game === 'wolf' && players.length !== 4 || game === 'hammer' && players.length !== 2) return result();
  for (let i=0; i<course.holes.length; i++) {
    const hole=i+1;
    if (players.some(p => !Number.isInteger(p.scores[i]) || p.scores[i]<=0)) break;
    if (game === 'nassau' || game === 'nassau_press') {
      const event=auxiliary.junk?.[hole];if(!event || !Array.isArray(event.sandies) || !Array.isArray(event.barkies) || [...event.sandies,...event.barkies].some(id=>!find(id)) || event.greenie!==null && !find(event.greenie)) break;
      for(const winner of players){
        if((event.sandies.includes(winner.id)||event.barkies.includes(winner.id)) && winner.scores[i]>course.holes[i].par) throw new Error('Junk feats require par or better');
        const units=Number(winner.scores[i]<course.holes[i].par)+Number(event.sandies.includes(winner.id))+Number(event.barkies.includes(winner.id))+Number(course.holes[i].par===3 && event.greenie===winner.id && winner.scores[i]<=3);
        for(const loser of players.filter(p=>p!==winner))pay(winner,loser,units);
      }
    } else if (game === 'wolf') {
      const event=auxiliary.wolf?.[hole]; if (!event || typeof event.isLoneWolf!=="boolean" || event.isLoneWolf && event.partnerId!==null) break;
      const wolf=players[i%4], partner=find(event.partnerId);
      if (!event.isLoneWolf && (!partner || partner===wolf)) break;
      if(event.blind && (!config.blindWolf || !event.beforePlay || !event.isLoneWolf || event.partnerId!==null || event.refused)) break;
      if(event.refused && (!config.pigVariation || !event.beforePlay || !partner || partner===wolf || event.blind || event.isLoneWolf)) break;
      const solo=event.isLoneWolf || event.refused;
      const side=solo?[wolf]:[wolf,partner!], field=players.filter(p=>!side.includes(p));
      const diff=Math.min(...field.map(p=>p.scores[i]))-Math.min(...side.map(p=>p.scores[i]));
      const rate=event.blind?3:event.refused?4:event.isLoneWolf?2:1;
      wolfHoles.push({hole,wolfName:wolf.name,partnerName:solo?null:partner!.name,wolfTeamScore:Math.min(...side.map(p=>p.scores[i])),fieldScore:Math.min(...field.map(p=>p.scores[i])),wolfWon:diff>0,points:Math.sign(diff)*rate*carry*field.length});
      if (diff) {
        for (const a of side) for (const b of field) pay(diff>0?a:b,diff>0?b:a,rate*carry);
        carry=1;
      } else if (config.wolfCarryover) carry++;
    } else if (game === 'hammer') {
      const event=auxiliary.hammer?.[hole]; if (!event || typeof event.hammered!=="boolean" || typeof event.accepted!=="boolean" || event.hammered && !find(event.hammerBy)) break;
      const diff=players[1].scores[i]-players[0].scores[i];
      const winner=event.hammered && !event.accepted?find(event.hammerBy):diff?players[diff>0?0:1]:undefined;
      const points=winner?(event.hammered && event.accepted?2:1):0;
      if (winner) pay(winner,players.find(p=>p!==winner)!,points);
      hammerHoles.push({hole,winnerName:winner?.name??'Push',points});
    } else if (game === 'snake') {
      const ordered=auxiliary.snake?.[hole]; if (!Array.isArray(ordered) || ordered.some(id=>!find(id)) || new Set(ordered).size!==ordered.length) break;
      for (const id of ordered) {
        const player=find(id)!;
        if (snakeHolder && snakeHolder!==player.name) changes++;
        snakeHolder=player.name; events.push({hole,playerName:player.name});
      }
    } else if (game === 'greenies') {
      if (course.holes[i].par===3) {
        const id=auxiliary.greenies?.[hole]; if (id===undefined || id!==null && !find(id)) break;
        const winner=find(id!);
        greenieHoles.push({hole,par:3,winnerName:winner?.name??null,winnerScore:winner?.scores[i]??0,qualified:!!winner && winner.scores[i]<=3});
        if (winner && winner.scores[i]<=3) for (const loser of players.filter(p=>p!==winner)) pay(winner,loser,1);
      }
    } else if (game === 'bingo_bango_bongo') {
      const event=auxiliary.bbb?.[hole]; if (!event || ['bingo','bango','bongo'].some(k=>event[k as keyof typeof event]!==null && !find(event[k as keyof typeof event]))) break;
      bbbHoles.push({hole,bingo:find(event.bingo)?.name??null,bango:find(event.bango)?.name??null,bongo:find(event.bongo)?.name??null});
      for (const id of [event.bingo,event.bango,event.bongo]) {
        const winner=find(id); if (!winner) continue;
        const points=config.bbbBirdieDouble && winner.scores[i]===course.holes[i].par-1?2:1;
        for (const loser of players.filter(p=>p!==winner)) pay(winner,loser,points/players.length);
      }
    }
    holes++;
  }
  if (game==='snake' && holes===course.holes.length && snakeHolder) {
    const units=config.progressiveSnake?2**changes:1;
    if (!Number.isSafeInteger(units)) throw new Error('Unsafe Snake exposure');
    const holder=players.find(p=>p.name===snakeHolder)!;
    for (const winner of players.filter(p=>p!==holder)) pay(winner,holder,units);
  }
  return result();
}

/** Accept the historic scan alias only when unambiguous; conflicting events require review. */
export function normalizeAuxiliaryData(data:AuxiliaryData):AuxiliaryData {
  const alias=(data as AuxiliaryData & {bingo_bango_bongo?:AuxiliaryData['bbb']}).bingo_bango_bongo;
  if(!alias)return data;
  if(data.bbb && JSON.stringify(Object.keys(data.bbb).sort().map(h=>[h,data.bbb![Number(h)].bingo,data.bbb![Number(h)].bango,data.bbb![Number(h)].bongo]))!==JSON.stringify(Object.keys(alias).sort().map(h=>[h,alias[Number(h)].bingo,alias[Number(h)].bango,alias[Number(h)].bongo])))throw new Error('Conflicting BBB input aliases require scorer review');
  return {...data,bbb:data.bbb??alias};
}
