import * as c from '../../src/engine/calculators';
import { calculateSettlement } from '../../src/engine/settlement';
import { ALL_GAMES } from '../../src/engine/types';
const course = {name:'Golden',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:350}))};
const players = ['A','B','C','D'].map((name,i)=>({id:name,name,team:i<2?'Red':'Blue',handicap:i*3,scores:Array.from({length:18},(_,h)=>3+(i+h*3)%5)}));
const teams = ['Red','Blue'].map(name=>({name,players:players.filter(p=>p.team===name),score:players.find(p=>p.team===name)!.scores}));
const calls:Record<string,()=>unknown> = {
 stroke_play:()=>c.calcStrokePlay(players,course),match_play:()=>c.calcMatchPlay(players[0],players[1],course),
 stableford:()=>c.calcStableford(players,course),mod_stableford:()=>c.calcModStableford(players,course),
 skins:()=>c.calcSkins(players,course),skins_carry:()=>c.calcSkins(players,course,true),nassau:()=>c.calcNassau(players[0],players[1]),nassau_press:()=>c.calcNassauPress(players[0],players[1]),
 wolf:()=>c.calcWolf(players,course),banker:()=>c.calcBanker(players,course),hammer:()=>c.calcHammer(players[0],players[1],course),snake:()=>c.calcSnake(players,course),bingo_bango_bongo:()=>c.calcBingoBangoBongo(players,course),dots:()=>c.calcDots(players,course),rabbit:()=>c.calcRabbit(players,course),defender:()=>c.calcDefender(players,course),nines:()=>c.calcNines(players,course),vegas:()=>c.calcVegas(players.slice(0,2),players.slice(2),course),sixes:()=>c.calcSixes(players,course),closeout:()=>c.calcCloseout(players[0],players[1],course),quota:()=>c.calcQuota(players,course),chicago:()=>c.calcChicago(players,course),greenies:()=>c.calcGreenies(players,course),aces_deuces:()=>c.calcAcesDeuces(players,course),best_ball:()=>c.calcBestBall(teams,course),scramble:()=>c.calcScramble(teams,course),shamble:()=>c.calcShamble(teams,course),alternate_shot:()=>c.calcAlternateShot(teams,course),chapman:()=>c.calcChapman(teams,course),fourball:()=>c.calcFourBall([players[0],players[1]],[players[2],players[3]],course),
};
console.log(JSON.stringify(Object.fromEntries(ALL_GAMES.map(({id})=>[id,{result:calls[id](),settlement:calculateSettlement(["match_play","nassau","nassau_press","hammer","closeout"].includes(id) ? players.slice(0,2) : players,course,[id],0.03,undefined,{})}]))));
