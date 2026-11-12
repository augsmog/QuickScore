import { validBisque, validJokers } from "./declarations";
import { calcAlternateShot } from "./calculators/alternate-shot";
import { calcChapman } from "./calculators/chapman";
import { ACTUAL_INPUT_GAMES, actualInputLedger } from "./actual-inputs";
import { Transaction, SettlementSummary, Player, Course, GameType, GameConfig, AuxiliaryData, validateVariationSetup, configForGame } from "./types";
import { calcStrokePlay } from "./calculators/stroke-play";
import { calcSkins, skinsGroups } from "./calculators/skins";
import { calcNassau, calcNassauRules } from "./calculators/nassau";
import { calcStableford } from "./calculators/stableford";
import { calcModStableford } from "./calculators/mod-stableford";
import { calcMatchPlay } from "./calculators/match-play";
import { calcBestBall } from "./calculators/best-ball";
import { calcNassauPress } from "./calculators/nassau-press";
import { calcNines } from "./calculators/nines";
import { calcVegas } from "./calculators/vegas";
import { calcSixes } from "./calculators/sixes";
import { calcCloseout } from "./calculators/closeout";
import { calcQuota } from "./calculators/quota";
import { calcChicago } from "./calculators/chicago";
import { calcAcesDeuces } from "./calculators/aces-deuces";
import { calcDots } from "./calculators/dots";
import { calcRabbit } from "./calculators/rabbit";
import { calcDefender } from "./calculators/defender";
import { calcFourBall } from "./calculators/fourball";
import { calcScramble } from "./calculators/scramble";
import { calcWolf } from "./calculators/wolf";
import { calcHammer } from "./calculators/hammer";
import { calcSnake } from "./calculators/snake";
import { calcGreenies } from "./calculators/greenies";
import { calcShamble } from "./calculators/shamble";
import { calcBanker } from "./calculators/banker";

/** Group players by team ID. Returns Map<teamId, Player[]> for all non-null teams. */
function groupByTeam(players: Player[]): Map<string, Player[]> {
  const teams = new Map<string, Player[]>();
  for (const p of players) {
    if (p.team) {
      const list = teams.get(p.team) || [];
      list.push(p);
      teams.set(p.team, list);
    }
  }
  return teams;
}

/**
 * Calculate settlement transactions for a set of games.
 * Each game type produces transactions based on its own rules.
 */
export function calculateSettlement(
  players: Player[],
  course: Course,
  gameTypes: GameType[],
  betUnit: number,
  auxiliaryData?: AuxiliaryData,
  gameConfig?: GameConfig,
  groups?: { name: string; players: Player[] }[]
): SettlementSummary {
  const transactions: Transaction[] = [];

  if (gameConfig?.rulesVersion === 1) {
    const stored = gameConfig;
    const normalized: GameConfig = Object.assign({rulesVersion:1,inputRulesVersion:gameConfig.inputRulesVersion}, ...gameTypes.map(g => configForGame(stored,g)));
    gameConfig = normalized;
    const error = validateVariationSetup(groups ?? [{players}], gameTypes, normalized, betUnit);
    if (error) throw new Error(error);
  if(gameConfig?.rulesVersion===1 && ((gameTypes.includes("stableford") && gameConfig.jokerEnabled && !validJokers(players,course,auxiliaryData)) || (gameTypes.includes("match_play") && gameConfig.bisqueHandicap && !validBisque(players,course,auxiliaryData)) || (gameConfig.junkNassau && gameTypes.some(g=>g==="nassau"||g==="nassau_press") && actualInputLedger("nassau",players,course,auxiliaryData,gameConfig).pending))) return {transactions:[],netByPlayer:Object.fromEntries(players.map(p=>[p.name,0])),pending:true};
    if (!gameTypes.some(g=>g==="alternate_shot" || g==="chapman") && players.some(p => course.holes.some((_,i) => !Number.isFinite(p.scores[i]) || p.scores[i] <= 0))) {
      return {transactions:[],netByPlayer:Object.fromEntries(players.map(p => [p.name,0])),pending:true};
    }
  }

  if (gameConfig?.rulesVersion === 1 && gameTypes.some(g => ACTUAL_INPUT_GAMES.includes(g) && actualInputLedger(g, players, course, auxiliaryData, gameConfig).pending)) {
    return {transactions:[],netByPlayer:Object.fromEntries(players.map(p=>[p.name,0])),pending:true};
  }
  for (const gameType of gameTypes) {
    if(gameConfig?.rulesVersion===1 && (gameType==="alternate_shot" || gameType==="chapman")) {
      const teams=[...new Set(players.map(p=>p.team!))].map(name=>({name,score:course.holes.map((_,i)=>auxiliaryData?.teamCards?.[i+1]?.[name]??0)}));
      if(teams.some(t=>t.score.some(n=>!Number.isInteger(n)||n<=0))) return {transactions:[],netByPlayer:Object.fromEntries(players.map(p=>[p.name,0])),pending:true};
      const ranks=(gameType==="chapman"?calcChapman:calcAlternateShot)(teams,course);
      if(ranks[0].total!==ranks[1].total){const winners=players.filter(p=>p.team===ranks[0].name);for(const loser of players.filter(p=>p.team!==ranks[0].name)) for(const winner of winners) transactions.push({from:loser.name,to:winner.name,amount:betUnit/winners.length,gameType});}
      continue;
    }
    if (gameConfig?.rulesVersion === 1 && ACTUAL_INPUT_GAMES.includes(gameType)) {
      const result=actualInputLedger(gameType,players,course,auxiliaryData,configForGame(gameConfig,gameType));
      const winners=players.filter(p=>result.totals[p.name]>0), losers=players.filter(p=>result.totals[p.name]<0);
      const total=winners.reduce((sum,p)=>sum+result.totals[p.name],0);
      for (const winner of winners) for (const loser of losers) transactions.push({from:loser.name,to:winner.name,amount:result.totals[winner.name]*-result.totals[loser.name]/total*betUnit,gameType});
      continue;
    }
    if (gameConfig?.rulesVersion === 1 && groups && ["nassau","nassau_press","match_play","vegas","sixes","rabbit"].includes(gameType)) {
      for (const group of groups) transactions.push(...calculateSettlement(group.players,course,[gameType],betUnit,auxiliaryData,configForGame(gameConfig,gameType)).transactions);
      continue;
    }
    if (gameConfig?.rulesVersion === 1 && (gameType === "nassau" || gameType === "nassau_press")) {
      for (const scope of groups ?? [{players}]) {
      const players = scope.players;
      const result = calcNassauRules(players, course, gameType === "nassau_press", gameConfig);
      if(gameConfig.junkNassau){const junk=actualInputLedger(gameType,players,course,auxiliaryData,gameConfig);for(const p of players) result.totals[p.name]+=junk.totals[p.name];}
      const winners = players.filter(p => result.totals[p.name] > 0);
      const losers = players.filter(p => result.totals[p.name] < 0);
      const total = winners.reduce((s,p) => s + result.totals[p.name],0);
      for (const winner of winners) for (const loser of losers) transactions.push({from:loser.name,to:winner.name,amount:-result.totals[loser.name] * result.totals[winner.name] / total * betUnit,gameType});
      }
      continue;
    }
    switch (gameType) {
      case "stroke_play": {
        // Winner takes betUnit from each other player
        const results = calcStrokePlay(players, course);
        if (results.length >= 2) {
          const winner = results[0];
          if (gameConfig?.rulesVersion === 1 && tiedRank(winner, results[1])) break;
          for (let i = 1; i < results.length; i++) {
            transactions.push({
              from: results[i].name,
              to: winner.name,
              amount: betUnit,
              gameType,
            });
          }
        }
        break;
      }

      case "skins":
      case "skins_carry": {
        const carryover = gameType === "skins_carry";
        for (const { players: scopedPlayers } of skinsGroups(groups ?? [{ name: "Whole field", players }], gameConfig)) {
          const players = scopedPlayers;
          const result = calcSkins(players, course, carryover, gameConfig?.skinsMode, gameConfig);
          // Each skin is worth betUnit; distribute from losers to winners
          const totalSkins = Object.values(result.totals).reduce((a, b) => a + b, 0);
          if (totalSkins > 0) {
            const avg = totalSkins / players.length;
            const totalWinnings = Object.values(result.totals).reduce((sum, won) => sum + Math.max(0, won - avg), 0);
            for (const player of players) {
              const won = result.totals[player.name] || 0;
              const diff = won - avg;
              if (diff > 0) {
                // This player is a net winner — collect from net losers proportionally
                for (const other of players) {
                  const otherWon = result.totals[other.name] || 0;
                  const otherDiff = otherWon - avg;
                  if (otherDiff < 0 && diff > 0) {
                    const amount = Math.abs(otherDiff) * (diff / totalWinnings) * betUnit;
                    if (amount > 0) {
                      transactions.push({
                        from: other.name,
                        to: player.name,
                        amount: amount,
                        gameType,
                      });
                    }
                  }
                }
              }
            }
          }
        }
        break;
      }

      case "nassau": {
        if (players.length >= 2) {
          const result = calcNassau(players[0], players[1]);
          // Front 9, Back 9, Overall — each worth betUnit
          for (const [, val] of [["front", result.front], ["back", result.back], ["overall", result.overall]] as const) {
            if (val > 0) {
              transactions.push({ from: result.p2, to: result.p1, amount: betUnit, gameType });
            } else if (val < 0) {
              transactions.push({ from: result.p1, to: result.p2, amount: betUnit, gameType });
            }
          }
        }
        break;
      }

      case "stableford": {
        if (!players.some(p => p.scores.some(score => score > 0))) break;
        const results = calcStableford(players, course, gameConfig, auxiliaryData);
        if (results.length >= 2) {
          const winner = results[0];
          if (gameConfig?.rulesVersion === 1 && tiedRank(winner, results[1])) break;
          for (let i = 1; i < results.length; i++) {
            transactions.push({
              from: results[i].name,
              to: winner.name,
              amount: betUnit,
              gameType,
            });
          }
        }
        break;
      }

      case "mod_stableford": {
        if (!players.some(p => p.scores.some(score => score > 0))) break;
        const results = calcModStableford(players, course);
        if (results.length >= 2) {
          const winner = results[0];
          if (gameConfig?.rulesVersion === 1 && tiedRank(winner, results[1])) break;
          for (let i = 1; i < results.length; i++) {
            transactions.push({
              from: results[i].name,
              to: winner.name,
              amount: betUnit,
              gameType,
            });
          }
        }
        break;
      }

      // ─── New Tier 1 game types ─────────────────────────────────────

      case "match_play": {
        // Head-to-head holes won. 2-player only.
        // MatchPlayResult: { p1, p2, results, finalStatus }
        // finalStatus > 0 means p1 won more holes
        if (players.length >= 2) {
          const result = calcMatchPlay(players[0], players[1], course, gameConfig, auxiliaryData);
          if (result.finalStatus > 0) {
            transactions.push({
              from: result.p2,
              to: result.p1,
              amount: betUnit,
              gameType,
            });
          } else if (result.finalStatus < 0) {
            transactions.push({
              from: result.p1,
              to: result.p2,
              amount: betUnit,
              gameType,
            });
          }
        }
        break;
      }

      case "best_ball": {
        // Team best ball stroke play. Losing team pays betUnit each.
        // Returns StrokePlayResult[] sorted by total (lowest first).
        // Works with 2+ teams — winning team collects from each losing team.
        const teams = groupByTeam(players);
        const teamIds = Array.from(teams.keys());
        if (teamIds.length >= 2) {
          const teamEntries = teamIds.map((id) => ({
            name: id,
            players: teams.get(id)!,
          }));
          const results = calcBestBall(teamEntries, course);
          if (results.length >= 2 && results[0].total !== results[1].total) {
            const winningTeamId = results[0].name;
            const winners = teams.get(winningTeamId)!;
            for (const tid of teamIds) {
              if (tid === winningTeamId) continue;
              const members = teams.get(tid)!;
              for (const loser of members) {
                for (const winner of winners) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: betUnit,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "nassau_press": {
        // Standard nassau bets + each press is an additional betUnit.
        // NassauPressResult: { p1, p2, front, back, overall, presses[], totalBets }
        if (players.length >= 2) {
          const result = calcNassauPress(players[0], players[1]);

          // Front 9 bet
          if (result.front > 0) {
            transactions.push({ from: result.p2, to: result.p1, amount: betUnit, gameType });
          } else if (result.front < 0) {
            transactions.push({ from: result.p1, to: result.p2, amount: betUnit, gameType });
          }

          // Back 9 bet
          if (result.back > 0) {
            transactions.push({ from: result.p2, to: result.p1, amount: betUnit, gameType });
          } else if (result.back < 0) {
            transactions.push({ from: result.p1, to: result.p2, amount: betUnit, gameType });
          }

          // Overall bet
          if (result.overall > 0) {
            transactions.push({ from: result.p2, to: result.p1, amount: betUnit, gameType });
          } else if (result.overall < 0) {
            transactions.push({ from: result.p1, to: result.p2, amount: betUnit, gameType });
          }

          // Each press is an additional betUnit
          for (const press of result.presses) {
            const loser = press.winner === result.p1 ? result.p2 : result.p1;
            transactions.push({
              from: loser,
              to: press.winner,
              amount: betUnit,
              gameType,
            });
          }
        }
        break;
      }

      case "nines": {
        // NinesResult: { points: Record<string, number>, holeResults }
        // Net = (points - 40.5) × betUnit. Positive pays negative proportionally.
        if (players.length === 4) {
          const result = calcNines(players, course);
          const nets: { name: string; net: number }[] = players.map((p) => ({
            name: p.name,
            net: (result.points[p.name] - 40.5) * betUnit,
          }));

          const winners = nets.filter((n) => n.net > 0);
          const losers = nets.filter((n) => n.net < 0);

          // Each loser pays each winner proportionally
          const totalWinnings = winners.reduce((s, w) => s + w.net, 0);
          if (totalWinnings > 0) {
            for (const loser of losers) {
              for (const winner of winners) {
                const share = winner.net / totalWinnings;
                const amount = Math.abs(loser.net) * share;
                if (amount > 0) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: amount,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "vegas": {
        // VegasResult: { team1Won, team2Won, holes }
        // Vegas requires exactly 2 teams of 2 players each.
        const teams = groupByTeam(players);
        const teamIds = Array.from(teams.keys());
        if (teamIds.length >= 2) {
          const team1 = teams.get(teamIds[0])!;
          const team2 = teams.get(teamIds[1])!;
          if (team1.length === 2 && team2.length === 2) {
            const result = calcVegas(team1, team2, course, gameConfig);
            const net = result.team1Won - result.team2Won;
            if (net > 0) {
              // Team 1 won overall — Team 2 pays
              const perPlayer = (net * betUnit) / 2;
              for (const loser of team2) {
                for (const winner of team1) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: perPlayer,
                    gameType,
                  });
                }
              }
            } else if (net < 0) {
              // Team 2 won overall — Team 1 pays
              const perPlayer = (Math.abs(net) * betUnit) / 2;
              for (const loser of team1) {
                for (const winner of team2) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: perPlayer,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "sixes": {
        // SixesResult: { rounds[], totals: Record<string, number> }
        // totals has net points per player (positive = won, negative = lost)
        if (players.length === 4) {
          const result = calcSixes(players, course, gameConfig);
          const nets = players.map((p) => ({
            name: p.name,
            net: result.totals[p.name] * betUnit,
          }));

          const winners = nets.filter((n) => n.net > 0);
          const losers = nets.filter((n) => n.net < 0);
          const totalWinnings = winners.reduce((s, w) => s + w.net, 0);

          if (totalWinnings > 0) {
            for (const loser of losers) {
              for (const winner of winners) {
                const share = winner.net / totalWinnings;
                const amount = Math.abs(loser.net) * share;
                if (amount > 0) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: amount,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "closeout": {
        // CloseoutResult: { matches[], totals: Record<string, number> }
        // totals = number of matches won per player. Net matches won × betUnit.
        if (players.length >= 2) {
          const result = calcCloseout(players[0], players[1], course);
          const p1Wins = result.totals[players[0].name] || 0;
          const p2Wins = result.totals[players[1].name] || 0;
          const net = p1Wins - p2Wins;
          if (net > 0) {
            transactions.push({
              from: players[1].name,
              to: players[0].name,
              amount: net * betUnit,
              gameType,
            });
          } else if (net < 0) {
            transactions.push({
              from: players[0].name,
              to: players[1].name,
              amount: Math.abs(net) * betUnit,
              gameType,
            });
          }
        }
        break;
      }

      case "quota": {
        // QuotaResult[]: { name, playerId, handicap, quota, points, overUnder }
        // Sorted by overUnder descending. Highest surplus wins, collects betUnit from each.
        if (!players.some(p => p.scores.some(score => score > 0))) break;
        const results = calcQuota(players, course);
        if (results.length >= 2) {
          const winner = results[0];
          if (gameConfig?.rulesVersion === 1 && tiedRank(winner, results[1])) break;
          for (let i = 1; i < results.length; i++) {
            transactions.push({
              from: results[i].name,
              to: winner.name,
              amount: betUnit,
              gameType,
            });
          }
        }
        break;
      }

      case "chicago": {
        // ChicagoResult[]: { name, playerId, handicap, quota, grossPoints, netScore }
        // Sorted by netScore descending. Highest net wins, collects betUnit from each.
        if (!players.some(p => p.scores.some(score => score > 0))) break;
        const results = calcChicago(players, course);
        if (results.length >= 2) {
          const winner = results[0];
          if (gameConfig?.rulesVersion === 1 && tiedRank(winner, results[1])) break;
          for (let i = 1; i < results.length; i++) {
            transactions.push({
              from: results[i].name,
              to: winner.name,
              amount: betUnit,
              gameType,
            });
          }
        }
        break;
      }

      case "aces_deuces": {
        // AcesDeuceResult: { totals: Record<string, number>, aces[], deuces[] }
        // totals already has net units per player (e.g. +3 means won 3 net units).
        // Multiply by betUnit for settlement.
        const result = calcAcesDeuces(players, course);
        const nets = players.map((p) => ({
          name: p.name,
          net: result.totals[p.name] * betUnit,
        }));

        const winners = nets.filter((n) => n.net > 0);
        const losers = nets.filter((n) => n.net < 0);
        const totalWinnings = winners.reduce((s, w) => s + w.net, 0);

        if (totalWinnings > 0) {
          for (const loser of losers) {
            for (const winner of winners) {
              const share = winner.net / totalWinnings;
              const amount = Math.abs(loser.net) * share;
              if (amount > 0) {
                transactions.push({
                  from: loser.name,
                  to: winner.name,
                  amount: amount,
                  gameType,
                });
              }
            }
          }
        }
        break;
      }

      case "dots": {
        // DotsResult: { totals: Record<string, number>, breakdown }
        // Net = (total dots - average) × betUnit.
        const result = calcDots(players, course);
        const totalDots = Object.values(result.totals).reduce((a, b) => a + b, 0);
        const avg = totalDots / players.length;
        const nets = players.map((p) => ({
          name: p.name,
          net: (result.totals[p.name] - avg) * betUnit,
        }));

        const winners = nets.filter((n) => n.net > 0);
        const losers = nets.filter((n) => n.net < 0);
        const totalWinnings = winners.reduce((s, w) => s + w.net, 0);

        if (totalWinnings > 0) {
          for (const loser of losers) {
            for (const winner of winners) {
              const share = winner.net / totalWinnings;
              const amount = Math.abs(loser.net) * share;
              if (amount > 0) {
                transactions.push({
                  from: loser.name,
                  to: winner.name,
                  amount: amount,
                  gameType,
                });
              }
            }
          }
        }
        break;
      }

      case "rabbit": {
        // RabbitResult: { front9Holder, back9Holder, events[], totals }
        // totals already has net units (holder wins n-1, others lose 1 each per rabbit).
        // Multiply by betUnit.
        const result = calcRabbit(players, course, gameConfig);
        const nets = players.map((p) => ({
          name: p.name,
          net: result.totals[p.name] * betUnit,
        }));

        const winners = nets.filter((n) => n.net > 0);
        const losers = nets.filter((n) => n.net < 0);
        const totalWinnings = winners.reduce((s, w) => s + w.net, 0);

        if (totalWinnings > 0) {
          for (const loser of losers) {
            for (const winner of winners) {
              const share = winner.net / totalWinnings;
              const amount = Math.abs(loser.net) * share;
              if (amount > 0) {
                transactions.push({
                  from: loser.name,
                  to: winner.name,
                  amount: amount,
                  gameType,
                });
              }
            }
          }
        }
        break;
      }

      case "defender": {
        // DefenderResult: { holeResults[], totals: Record<string, number> }
        // totals has per-player net units across 18 holes. Multiply by betUnit.
        const result = calcDefender(players, course);
        const nets = players.map((p) => ({
          name: p.name,
          net: result.totals[p.name] * betUnit,
        }));

        const winners = nets.filter((n) => n.net > 0);
        const losers = nets.filter((n) => n.net < 0);
        const totalWinnings = winners.reduce((s, w) => s + w.net, 0);

        if (totalWinnings > 0) {
          for (const loser of losers) {
            for (const winner of winners) {
              const share = winner.net / totalWinnings;
              const amount = Math.abs(loser.net) * share;
              if (amount > 0) {
                transactions.push({
                  from: loser.name,
                  to: winner.name,
                  amount: amount,
                  gameType,
                });
              }
            }
          }
        }
        break;
      }

      case "fourball": {
        // FourBallResult: { team1Names, team2Names, holeResults[], finalStatus }
        // finalStatus > 0 means team1 won. Fourball requires exactly 2 teams of 2.
        const teams = groupByTeam(players);
        const teamIds = Array.from(teams.keys());
        if (teamIds.length >= 2) {
          const team1 = teams.get(teamIds[0])!;
          const team2 = teams.get(teamIds[1])!;
          if (team1.length === 2 && team2.length === 2) {
            const result = calcFourBall(
              [team1[0], team1[1]] as [Player, Player],
              [team2[0], team2[1]] as [Player, Player],
              course
            );
            if (result.finalStatus > 0) {
              // Team 1 won
              for (const loser of team2) {
                for (const winner of team1) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: betUnit,
                    gameType,
                  });
                }
              }
            } else if (result.finalStatus < 0) {
              // Team 2 won
              for (const loser of team1) {
                for (const winner of team2) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: betUnit,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "scramble": {
        // calcScramble takes teams: { name, score[] }[], returns StrokePlayResult[] sorted.
        // Lower total wins. Works with 2+ teams.
        const teams = groupByTeam(players);
        const teamIds = Array.from(teams.keys());
        if (teamIds.length >= 2) {
          // For scramble, use the first player's scores as the team score
          const teamEntries = teamIds.map((id) => ({
            name: id,
            score: teams.get(id)![0].scores,
          }));
          const results = calcScramble(teamEntries, course);
          if (results.length >= 2 && results[0].total !== results[1].total) {
            const winningTeamId = results[0].name;
            const winners = teams.get(winningTeamId)!;
            for (const tid of teamIds) {
              if (tid === winningTeamId) continue;
              const members = teams.get(tid)!;
              for (const loser of members) {
                for (const winner of winners) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: betUnit,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "shamble": {
        // calcShamble takes teams: { name, players[] }[], returns StrokePlayResult[] sorted.
        // Lower total wins. Works with 2+ teams.
        const teams = groupByTeam(players);
        const teamIds = Array.from(teams.keys());
        if (teamIds.length >= 2) {
          const teamEntries = teamIds.map((id) => ({
            name: id,
            players: teams.get(id)!,
          }));
          const results = calcShamble(teamEntries, course);
          if (results.length >= 2 && results[0].total !== results[1].total) {
            const winningTeamId = results[0].name;
            const winners = teams.get(winningTeamId)!;
            for (const tid of teamIds) {
              if (tid === winningTeamId) continue;
              const members = teams.get(tid)!;
              for (const loser of members) {
                for (const winner of winners) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: betUnit,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "banker": {
        // BankerResult: { holeResults[], totals: Record<string, number> }
        // totals has per-player net units across 18 holes. Multiply by betUnit.
        const result = calcBanker(players, course);
        const nets = players.map((p) => ({
          name: p.name,
          net: result.totals[p.name] * betUnit,
        }));

        const winners = nets.filter((n) => n.net > 0);
        const losers = nets.filter((n) => n.net < 0);
        const totalWinnings = winners.reduce((s, w) => s + w.net, 0);

        if (totalWinnings > 0) {
          for (const loser of losers) {
            for (const winner of winners) {
              const share = winner.net / totalWinnings;
              const amount = Math.abs(loser.net) * share;
              if (amount > 0) {
                transactions.push({
                  from: loser.name,
                  to: winner.name,
                  amount: amount,
                  gameType,
                });
              }
            }
          }
        }
        break;
      }

      case "wolf": {
        // Wolf: per-hole, wolf+partner vs other two (or lone wolf vs field)
        if (auxiliaryData?.wolf && Object.keys(auxiliaryData.wolf).length > 0) {
          // Use actual auxiliary data for accurate wolf settlement
          const wolfNets: Record<string, number> = {};
          players.forEach((p) => (wolfNets[p.name] = 0));
          const wolfOrder = players.map((p) => p.id);

          for (let hole = 1; hole <= course.holes.length; hole++) {
            const auxHole = auxiliaryData.wolf[hole];
            if (!auxHole) continue;

            const wolfId = wolfOrder[(hole - 1) % wolfOrder.length];
            const wolfPlayer = players.find((p) => p.id === wolfId);
            if (!wolfPlayer) continue;

            const wolfScore = wolfPlayer.scores[hole - 1] || 0;
            if (wolfScore === 0) continue;

            if (auxHole.isLoneWolf) {
              // Lone wolf vs field — worth 2× per opponent
              const opponents = players.filter((p) => p.id !== wolfId);
              const opponentBest = Math.min(
                ...opponents.map((p) => p.scores[hole - 1] || 99)
              );
              if (wolfScore < opponentBest) {
                // Wolf wins 2× from each opponent
                for (const opp of opponents) {
                  wolfNets[wolfPlayer.name] += 2;
                  wolfNets[opp.name] -= 2;
                }
              } else if (wolfScore > opponentBest) {
                for (const opp of opponents) {
                  wolfNets[wolfPlayer.name] -= 2;
                  wolfNets[opp.name] += 2;
                }
              }
            } else if (auxHole.partnerId) {
              // Wolf + partner vs other two
              const partner = players.find((p) => p.id === auxHole.partnerId);
              if (!partner) continue;
              const team = [wolfPlayer, partner];
              const opponents = players.filter(
                (p) => p.id !== wolfId && p.id !== auxHole.partnerId
              );
              const teamBest = Math.min(
                ...team.map((p) => p.scores[hole - 1] || 99)
              );
              const oppBest = Math.min(
                ...opponents.map((p) => p.scores[hole - 1] || 99)
              );
              if (teamBest < oppBest) {
                for (const opp of opponents) {
                  for (const tm of team) {
                    wolfNets[tm.name] += 1;
                    wolfNets[opp.name] -= 1;
                  }
                }
              } else if (teamBest > oppBest) {
                for (const opp of opponents) {
                  for (const tm of team) {
                    wolfNets[tm.name] -= 1;
                    wolfNets[opp.name] += 1;
                  }
                }
              }
            }
          }

          // Convert nets to transactions
          const wolfPlayers = players.map((p) => ({
            name: p.name,
            net: wolfNets[p.name] * betUnit,
          }));
          const wolfWinners = wolfPlayers.filter((p) => p.net > 0);
          const wolfLosers = wolfPlayers.filter((p) => p.net < 0);
          const totalWolfWin = wolfWinners.reduce((s, p) => s + p.net, 0);
          if (totalWolfWin > 0) {
            for (const loser of wolfLosers) {
              for (const winner of wolfWinners) {
                const share = winner.net / totalWolfWin;
                const amount = Math.abs(loser.net) * share;
                if (amount > 0) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: amount,
                    gameType,
                  });
                }
              }
            }
          }
        } else {
          // Fallback: use calculator's approximation
          const wolfResult = calcWolf(players, course);
          const wolfPlayers = players.map((p) => ({
            name: p.name,
            net: (wolfResult.totals[p.name] || 0) * betUnit,
          }));
          const wolfWinners = wolfPlayers.filter((p) => p.net > 0);
          const wolfLosers = wolfPlayers.filter((p) => p.net < 0);
          const totalWolfWin = wolfWinners.reduce((s, p) => s + p.net, 0);
          if (totalWolfWin > 0) {
            for (const loser of wolfLosers) {
              for (const winner of wolfWinners) {
                const share = winner.net / totalWolfWin;
                const amount = Math.abs(loser.net) * share;
                if (amount > 0) {
                  transactions.push({
                    from: loser.name,
                    to: winner.name,
                    amount: amount,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "hammer": {
        // Hammer: head-to-head with doubling bets
        if (auxiliaryData?.hammer && Object.keys(auxiliaryData.hammer).length > 0) {
          // Use actual hammer data for accurate settlement
          // Each hammer doubles the stake for that hole; base = betUnit
          const hammerNets: Record<string, number> = {};
          players.forEach((p) => (hammerNets[p.name] = 0));

          for (let hole = 1; hole <= course.holes.length; hole++) {
            const p1 = players[0];
            const p2 = players[1];
            const s1 = p1.scores[hole - 1] || 0;
            const s2 = p2.scores[hole - 1] || 0;
            if (s1 === 0 || s2 === 0) continue;

            const auxHole = auxiliaryData.hammer[hole];
            // Multiplier: 2× if hammer was dropped and accepted, else 1×
            const multiplier =
              auxHole && auxHole.hammered && auxHole.accepted ? 2 : 1;

            if (s1 < s2) {
              hammerNets[p1.name] += multiplier;
              hammerNets[p2.name] -= multiplier;
            } else if (s2 < s1) {
              hammerNets[p2.name] += multiplier;
              hammerNets[p1.name] -= multiplier;
            }
          }

          // Convert to transactions
          for (const p of players) {
            if (hammerNets[p.name] > 0) {
              const loser = players.find(
                (o) => o.name !== p.name && hammerNets[o.name] < 0
              );
              if (loser) {
                transactions.push({
                  from: loser.name,
                  to: p.name,
                  amount: hammerNets[p.name] * betUnit,
                  gameType,
                });
              }
            }
          }
        } else {
          // Fallback: use calculator's approximation
          const hammerResult = calcHammer(players[0], players[1], course);
          const hammerPlayers = players.map((p) => ({
            name: p.name,
            net: (hammerResult.totals[p.name] || 0) * betUnit,
          }));
          for (const hp of hammerPlayers) {
            if (hp.net > 0) {
              const loser = hammerPlayers.find((p) => p.name !== hp.name);
              if (loser) {
                transactions.push({
                  from: loser.name,
                  to: hp.name,
                  amount: Math.abs(hp.net),
                  gameType,
                });
              }
            }
          }
        }
        break;
      }

      case "snake": {
        // Snake: last 3-putter pays everyone
        if (auxiliaryData?.snake && Object.keys(auxiliaryData.snake).length > 0) {
          // Use actual 3-putt data — last player to 3-putt holds the snake
          let lastThreePutter: string | null = null;

          for (let hole = 1; hole <= course.holes.length; hole++) {
            const threePutters = auxiliaryData.snake[hole];
            if (threePutters && threePutters.length > 0) {
              // Last person in the array for this hole gets the snake
              // (if multiple 3-putted, last one listed holds it)
              lastThreePutter = threePutters[threePutters.length - 1];
            }
          }

          if (lastThreePutter) {
            const holderPlayer = players.find((p) => p.id === lastThreePutter);
            if (holderPlayer) {
              for (const p of players) {
                if (p.id !== lastThreePutter) {
                  transactions.push({
                    from: holderPlayer.name,
                    to: p.name,
                    amount: betUnit,
                    gameType,
                  });
                }
              }
            }
          }
        } else {
          // Fallback: use calculator's approximation
          const snakeResult = calcSnake(players, course);
          // Preserve the pre-version-one fallback result for saved contests; this game is hidden for new contests.
          const snakeHolder = (snakeResult as typeof snakeResult & {holder?: string}).holder;
          if (snakeHolder) {
            for (const p of players) {
              if (p.name !== snakeHolder) {
                transactions.push({
                  from: snakeHolder,
                  to: p.name,
                  amount: betUnit,
                  gameType,
                });
              }
            }
          }
        }
        break;
      }

      case "greenies": {
        // Greenies: par-3 closest to pin wins from all others
        if (auxiliaryData?.greenies && Object.keys(auxiliaryData.greenies).length > 0) {
          // Use actual greenie winners from auxiliary data
          const greenieWins: Record<string, number> = {};
          players.forEach((p) => (greenieWins[p.name] = 0));

          for (let hole = 1; hole <= course.holes.length; hole++) {
            if (course.holes[hole - 1]?.par !== 3) continue;
            const winnerId = auxiliaryData.greenies[hole];
            if (winnerId) {
              const winner = players.find((p) => p.id === winnerId);
              if (winner) {
                greenieWins[winner.name] = (greenieWins[winner.name] || 0) + 1;
              }
            }
          }

          // Each greenie win = collect betUnit from each other player
          for (const [winnerName, wins] of Object.entries(greenieWins)) {
            if (wins > 0) {
              for (const p of players) {
                if (p.name !== winnerName) {
                  const amount = wins * betUnit;
                  transactions.push({
                    from: p.name,
                    to: winnerName,
                    amount: amount,
                    gameType,
                  });
                }
              }
            }
          }
        } else {
          // Fallback: use calculator's approximation
          const greenieResult = calcGreenies(players, course);
          const greenieWinners = Object.entries(greenieResult.totals).filter(
            ([, v]) => v > 0
          );
          for (const [winnerName, wins] of greenieWinners) {
            for (const p of players) {
              if (p.name !== winnerName) {
                const amount = (wins as number) * betUnit / (players.length - 1);
                if (amount > 0) {
                  transactions.push({
                    from: p.name,
                    to: winnerName,
                    amount: amount,
                    gameType,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case "bingo_bango_bongo": {
        // BBB: 3 points per hole, net points × betUnit
        // Without auxiliary data, approximation from scores
        break;
      }

      default:
        break;
    }
  }

  if (transactions.some(t => !Number.isFinite(t.amount) || t.amount < 0 || !Number.isSafeInteger(Math.round(t.amount * 100)))) throw new Error("Unsafe settlement amount");

  // Round player entitlements, rather than independently rounding every edge.
  // Each game's two sides receive the same cent budget, with stable input-order
  // tie breaking for equal remainders. All ledger arithmetic below is integer.
  const ledger: Transaction[] = [];
  const netCents: Record<string, number> = {};
  players.forEach(p => { netCents[p.name] = 0; });
  for (const gameType of new Set(transactions.map(t => t.gameType))) {
    const partitions = (gameType === "skins" || gameType === "skins_carry")
      ? skinsGroups(groups ?? [{ name: "Whole field", players }], gameConfig)
      : gameConfig?.rulesVersion === 1 && groups && ["nassau","nassau_press","match_play","vegas","sixes","rabbit"].includes(gameType) ? groups : [{ name: "Whole field", players }];
    for (const partition of partitions) {
      const members = new Set(partition.players.map(p => p.name));
      const raw: Record<string, number> = {};
      players.forEach(p => { raw[p.name] = 0; });
      for (const t of transactions.filter(t => t.gameType === gameType && members.has(t.from) && members.has(t.to))) {
        raw[t.to] = (raw[t.to] || 0) + t.amount * 100;
        raw[t.from] = (raw[t.from] || 0) - t.amount * 100;
      }
      const winners = Object.entries(raw).filter(([, n]) => n > 1e-8);
      const losers = Object.entries(raw).filter(([, n]) => n < -1e-8).map(([name, n]) => [name, -n] as [string, number]);
      const budget = Math.round(winners.reduce((sum, [, n]) => sum + n, 0));
      if (!Number.isSafeInteger(budget)) throw new Error("Unsafe settlement total");
      const credits = allocateCents(winners, budget);
      const debts = allocateCents(losers, budget);
      for (const credit of credits) {
        for (const debt of debts) {
          const cents = Math.min(credit.cents, debt.cents);
          if (!cents) continue;
          ledger.push({ from: debt.name, to: credit.name, amount: cents / 100, gameType });
          netCents[credit.name] += cents;
          netCents[debt.name] -= cents;
          credit.cents -= cents;
          debt.cents -= cents;
        }
      }
    }
  }
  const netByPlayer = Object.fromEntries(Object.entries(netCents).map(([name, cents]) => [name, cents / 100]));
  return { transactions: ledger, netByPlayer };
}

/** Largest-remainder allocation; amounts and the total are in cents. */
function allocateCents(entries: [string, number][], total: number) {
  const sum = entries.reduce((s, [, amount]) => s + amount, 0);
  const shares = entries.map(([name, amount], index) => {
    const exact = sum ? amount / sum * total : 0;
    const cents = Math.floor(exact);
    return { name, cents, remainder: exact - cents, index };
  });
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = total - shares.reduce((s, share) => s + share.cents, 0);
  for (let i = 0; i < remaining; i++) ranked[i].cents++;
  return shares;
}

/** A tied top rank pushes a winner bet in version-one rules. */
function tiedRank(a: object, b: object): boolean {
  const first = a as Record<string, unknown>, second = b as Record<string, unknown>;
  return ["total","points","overUnder","netScore"].some(key => key in first && first[key] === second[key]);
}
