import assert from 'node:assert/strict';
import fc from 'fast-check';
import { GAME_TYPES } from '../../src/engine/types';
import * as registry from '../../src/engine/registry';
import { calculateSettlement } from '../../src/engine/settlement';
import { calcScopedSkins } from '../../src/engine/calculators/skins';

const game = process.argv[2];
const info = [...GAME_TYPES.individual, ...GAME_TYPES.team].find(g => g.id === game)!;
assert.ok(info, `Unknown game ${game}`);
const moduleName = game === 'skins_carry' ? 'skins' : game.replaceAll('_', '-');
const calculators = require(`../../src/engine/calculators/${moduleName}.ts`);
const functionNames: Record<string, string> = {
  stroke_play: 'calcStrokePlay', match_play: 'calcMatchPlay', stableford: 'calcStableford',
  mod_stableford: 'calcModStableford', skins: 'calcSkins', skins_carry: 'calcSkins',
  nassau: 'calcNassau', nassau_press: 'calcNassauPress', bingo_bango_bongo: 'calcBingoBangoBongo',
  aces_deuces: 'calcAcesDeuces', best_ball: 'calcBestBall', alternate_shot: 'calcAlternateShot',
  fourball: 'calcFourBall',
};
const calc = calculators[functionNames[game] ?? `calc${game[0].toUpperCase()}${game.slice(1)}`];
assert.equal(typeof calc, 'function');
let checks = 0;
const equal = (a: unknown, b: unknown) => { checks++; assert.deepEqual(a, b); };
const ok = (condition: boolean) => { checks++; assert.ok(condition); };
function finite(value: any) {
  if (typeof value === 'number') ok(Number.isFinite(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}
const canonicalRows = (rows: any[]) => [...rows].sort((a,b) => (a.playerId ?? a.name).localeCompare(b.playerId ?? b.name));
const sum = (xs: number[]) => xs.reduce((a,b) => a+b, 0);

// Schedule dimensions explicitly so coverage never depends on random chance.
// Each of the 60 slots still generates scores, course pars, and wager with fast-check.
for (let slot = 0; slot < 60; slot++) {
  const seed = 130000 + [...GAME_TYPES.individual, ...GAME_TYPES.team].indexOf(info) * 100 + slot;
  try { fc.assert(fc.property(fc.record({
    scores: fc.array(fc.integer({ min: 1, max: 15 }), { minLength: 144, maxLength: 144 }),
    pars: fc.array(fc.integer({ min: 3, max: 5 }), { minLength: 18, maxLength: 18 }),
    cents: fc.integer({ min: 1, max: 1000 }),
  }), ({ scores, pars, cents }) => {
    const count = info.minPlayers + slot % (Math.min(8, info.maxPlayers) - info.minPlayers + 1);
    const holes = slot % 2 ? 18 : 9;
    const profile = Math.floor(slot / 2) % 6;
    const handicap = Math.floor(slot / 12) % 4;
    const course = { name: 'GS-13', holes: pars.map((par,i) => ({num:i+1,par,hcp:i+1,yards:350})) };
    const players = Array.from({length:count}, (_,p) => ({
      id:`p${p}`, name:`Player ${p}`, team:`Team ${p % 2}`, handicap: [0, p * 5, -3, 36][handicap],
      scores: Array.from({length:18}, (_,h) => h >= holes || (profile === 5 && h >= 4) ? 0 :
        profile === 0 ? pars[h] : profile === 1 ? 1 : profile === 2 ? 10 + scores[p*18+h] % 6 :
        profile === 3 ? 4 : scores[p*18+h]),
    }));
    const config = { skinsMode: (Math.floor(slot/2)%2 ? 'gross' : 'net') as 'gross'|'net',
      skinsScope: (Math.floor(slot/4)%2 ? 'group' : 'field') as 'group'|'field' };
    const groups = [{name:'A',players:players.filter((_,i)=>i%2===0)}, {name:'B',players:players.filter((_,i)=>i%2===1)}];
    const teams = (ps: typeof players) => ['Team 0','Team 1'].map(name => ({name,players:ps.filter(p=>p.team===name)}));
    function calculate(ps: typeof players): any {
      if (['match_play','nassau','nassau_press','hammer','closeout'].includes(game)) return calc(ps[0],ps[1],course);
      if (['vegas','fourball'].includes(game)) return calc(teams(ps)[0].players,teams(ps)[1].players,course);
      if (['best_ball','shamble'].includes(game)) return calc(teams(ps),course);
      if (['scramble','alternate_shot','chapman'].includes(game)) return calc(teams(ps).map(t=>({name:t.name,score:t.players[0].scores})),course);
      if (game.startsWith('skins')) return calc(ps,course,game==='skins_carry',config.skinsMode);
      return calc(ps,course);
    }
    const result = calculate(players); // A thrown error fails the property, with seed/path.
    finite(result);
    equal(result, calculate(structuredClone(players)));
    const settle = () => calculateSettlement(players,course,[info.id],cents/100,undefined,config,groups);
    const settlement = settle();
    finite(settlement);
    equal(settlement,settle());
    equal(sum(Object.values(settlement.netByPlayer).map(n=>Math.round(n*100))),0);
    for (const t of settlement.transactions) {
      ok(Math.abs(t.amount*100-Math.round(t.amount*100)) < 1e-8);
      ok(t.amount > 0);
      if (game.startsWith('skins') && config.skinsScope === 'group')
        equal(groups.findIndex(g=>g.players.some(p=>p.name===t.from)),groups.findIndex(g=>g.players.some(p=>p.name===t.to)));
    }
    for (const p of players) equal(Math.round(settlement.netByPlayer[p.name]*100), sum(settlement.transactions.map(t => (t.to===p.name?1:t.from===p.name?-1:0)*Math.round(t.amount*100))));
    if (game.startsWith('skins')) {
      // A wager divisible by every competition size avoids intentional cent-remainder ties.
      const wager = players.length * groups[0].players.length * groups[1].players.length;
      const original = calculateSettlement(players,course,[info.id],wager,undefined,config,groups);
      const permuted = calculateSettlement([...players].reverse(),course,[info.id],wager,undefined,config,
        groups.map(g=>({...g,players:[...g.players].reverse()})).reverse());
      equal(original.netByPlayer,permuted.netByPlayer);
    }
    // Registry exports: independent stroke totals and Stableford hole aggregation.
    for (const row of registry.calcStrokePlay(players,course)) {
      const p = players.find(p=>p.id===row.playerId)!;
      equal(row.total,sum(p.scores)); equal(row.total,row.front+row.back);
    }
    for (const row of registry.calcStableford(players,course)) equal(row.points,sum(row.holePoints));
    if (Array.isArray(result)) for (const row of result) {
      if (row.holePoints) equal(row.points,sum(row.holePoints));
      if ('front' in row && 'back' in row) equal(row.total,row.front+row.back);
    }
    if (game === 'nines') for (const p of players) {
      const expected = sum(result.holeResults.map((h:any)=>h.allocation[p.name]));
      ok(Math.abs(result.points[p.name]-expected)<1e-8);
    }
    if (game === 'vegas') {
      equal(result.team1Won,sum(result.holes.map((h:any)=>Math.max(0,-h.diff))));
      equal(result.team2Won,sum(result.holes.map((h:any)=>Math.max(0,h.diff))));
    }
    if (game === 'dots') for (const p of players) {
      const b = result.breakdown[p.name];
      equal(result.totals[p.name],2*b.birdies+b.pars-b.doubles);
    }
    if (game.startsWith('skins')) for (const table of calcScopedSkins(groups,course,game==='skins_carry',config)) {
      for (const p of table.players) equal(table.result.totals[p.name],sum(table.result.skins.filter(h=>h.winner===p.name).map(h=>h.value)));
    }
    // Rotation games, tie-breaking approximations, and shared team score entry are
    // intentionally order-sensitive. Compare identity-keyed outputs only where valid.
    if (['stroke_play','stableford','mod_stableford','quota','chicago','dots','aces_deuces','nines','skins','skins_carry','best_ball','shamble'].includes(game)) {
      const reversed = calculate([...players].reverse());
      const normalize = (value: any) => game === 'aces_deuces' ? { ...value,
        aces: [...value.aces].sort((a,b)=>a.hole-b.hole || a.playerName.localeCompare(b.playerName)),
        deuces: [...value.deuces].sort((a,b)=>a.hole-b.hole || a.playerName.localeCompare(b.playerName)),
      } : Array.isArray(value) ? canonicalRows(value) : value;
      equal(normalize(result), normalize(reversed));
    }
  }), { seed, numRuns: 1 });
  } catch (error) {
    console.error(JSON.stringify({game,slot,seed}));
    throw error;
  }
}
console.log(JSON.stringify({ game, configurations:60, checks }));
