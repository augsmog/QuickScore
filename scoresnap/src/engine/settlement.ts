import { Transaction, SettlementSummary, Player, Course, GameType } from "./types";
import { calcStrokePlay } from "./calculators/stroke-play";
import { calcSkins } from "./calculators/skins";
import { calcNassau } from "./calculators/nassau";
import { calcStableford } from "./calculators/stableford";
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
import { calcShamble } from "./calculators/shamble";
import { calcBanker } from "./calculators/banker";

/**
 * Calculate settlement transactions for a set of games.
 * Each game type produces transactions based on its own rules.
 */
export function calculateSettlement(
  players: Player[],
  course: Course,
  gameTypes: GameType[],
  betUnit: number
): SettlementSummary {
  const transactions: Transaction[] = [];

  for (const gameType of gameTypes) {
    switch (gameType) {
      case "stroke_play": {
        // Winner takes betUnit from each other player
        const results = calcStrokePlay(players, course);
        if (results.length >= 2) {
          const winner = results[0];
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
        const result = calcSkins(players, course, carryover);
        // Each skin is worth betUnit; distribute from losers to winners
        const totalSkins = Object.values(result.totals).reduce((a, b) => a + b, 0);
        if (totalSkins > 0) {
          const avg = totalSkins / players.length;
          for (const player of players) {
            const won = result.totals[player.name] || 0;
            const diff = won - avg;
            if (diff > 0) {
              // This player is a net winner — collect from net losers proportionally
              for (const other of players) {
                const otherWon = result.totals[other.name] || 0;
                const otherDiff = otherWon - avg;
                if (otherDiff < 0 && diff > 0) {
                  const amount = Math.min(Math.abs(otherDiff), diff) * betUnit;
                  if (amount > 0) {
                    transactions.push({
                      from: other.name,
                      to: player.name,
                      amount: Math.round(amount * 100) / 100,
                      gameType,
                    });
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

      case "stableford":
      case "mod_stableford": {
        const results = calcStableford(players, course);
        if (results.length >= 2) {
          const winner = results[0];
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
          const result = calcMatchPlay(players[0], players[1], course);
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
        // Teams are formed from players by their team property.
        const teamA = players.filter((p) => p.team === "A");
        const teamB = players.filter((p) => p.team === "B");
        if (teamA.length > 0 && teamB.length > 0) {
          const results = calcBestBall(
            [
              { name: "Team A", players: teamA },
              { name: "Team B", players: teamB },
            ],
            course
          );
          if (results.length >= 2 && results[0].total !== results[1].total) {
            const winningTeamName = results[0].name;
            const winners = winningTeamName === "Team A" ? teamA : teamB;
            const losers = winningTeamName === "Team A" ? teamB : teamA;
            for (const loser of losers) {
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
                    amount: Math.round(amount * 100) / 100,
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
        // team1Won = total points team1 collected, team2Won = total points team2 collected
        // Net difference divided among players on the team
        const teamA = players.filter((p) => p.team === "A");
        const teamB = players.filter((p) => p.team === "B");
        if (teamA.length === 2 && teamB.length === 2) {
          const result = calcVegas(teamA, teamB, course);
          const net = result.team1Won - result.team2Won;
          if (net > 0) {
            // Team A won overall — Team B pays
            const perPlayer = (net * betUnit) / 2;
            for (const loser of teamB) {
              for (const winner of teamA) {
                transactions.push({
                  from: loser.name,
                  to: winner.name,
                  amount: Math.round(perPlayer * 100) / 100,
                  gameType,
                });
              }
            }
          } else if (net < 0) {
            // Team B won overall — Team A pays
            const perPlayer = (Math.abs(net) * betUnit) / 2;
            for (const loser of teamA) {
              for (const winner of teamB) {
                transactions.push({
                  from: loser.name,
                  to: winner.name,
                  amount: Math.round(perPlayer * 100) / 100,
                  gameType,
                });
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
          const result = calcSixes(players, course);
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
                    amount: Math.round(amount * 100) / 100,
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
        const results = calcQuota(players, course);
        if (results.length >= 2) {
          const winner = results[0];
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
        const results = calcChicago(players, course);
        if (results.length >= 2) {
          const winner = results[0];
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
                  amount: Math.round(amount * 100) / 100,
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
                  amount: Math.round(amount * 100) / 100,
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
        const result = calcRabbit(players, course);
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
                  amount: Math.round(amount * 100) / 100,
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
                  amount: Math.round(amount * 100) / 100,
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
        // finalStatus > 0 means team1 won. Winning team collects betUnit per player.
        const teamA = players.filter((p) => p.team === "A");
        const teamB = players.filter((p) => p.team === "B");
        if (teamA.length === 2 && teamB.length === 2) {
          const result = calcFourBall(
            [teamA[0], teamA[1]] as [Player, Player],
            [teamB[0], teamB[1]] as [Player, Player],
            course
          );
          if (result.finalStatus > 0) {
            // Team A (team1) won
            for (const loser of teamB) {
              for (const winner of teamA) {
                transactions.push({
                  from: loser.name,
                  to: winner.name,
                  amount: betUnit,
                  gameType,
                });
              }
            }
          } else if (result.finalStatus < 0) {
            // Team B (team2) won
            for (const loser of teamA) {
              for (const winner of teamB) {
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
        break;
      }

      case "scramble": {
        // calcScramble takes teams: { name, score[] }[], returns StrokePlayResult[] sorted.
        // Lower total wins. Losers pay betUnit each.
        const teamA = players.filter((p) => p.team === "A");
        const teamB = players.filter((p) => p.team === "B");
        if (teamA.length > 0 && teamB.length > 0) {
          // For scramble, use the first player's scores as the team score
          const results = calcScramble(
            [
              { name: "Team A", score: teamA[0].scores },
              { name: "Team B", score: teamB[0].scores },
            ],
            course
          );
          if (results.length >= 2 && results[0].total !== results[1].total) {
            const winningTeamName = results[0].name;
            const winners = winningTeamName === "Team A" ? teamA : teamB;
            const losers = winningTeamName === "Team A" ? teamB : teamA;
            for (const loser of losers) {
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
        break;
      }

      case "shamble": {
        // calcShamble takes teams: { name, players[] }[], returns StrokePlayResult[] sorted.
        // Lower total wins. Losers pay betUnit each.
        const teamA = players.filter((p) => p.team === "A");
        const teamB = players.filter((p) => p.team === "B");
        if (teamA.length > 0 && teamB.length > 0) {
          const results = calcShamble(
            [
              { name: "Team A", players: teamA },
              { name: "Team B", players: teamB },
            ],
            course
          );
          if (results.length >= 2 && results[0].total !== results[1].total) {
            const winningTeamName = results[0].name;
            const winners = winningTeamName === "Team A" ? teamA : teamB;
            const losers = winningTeamName === "Team A" ? teamB : teamA;
            for (const loser of losers) {
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
                  amount: Math.round(amount * 100) / 100,
                  gameType,
                });
              }
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // Net transactions per player
  const netByPlayer: Record<string, number> = {};
  players.forEach((p) => (netByPlayer[p.name] = 0));

  for (const t of transactions) {
    netByPlayer[t.to] = (netByPlayer[t.to] || 0) + t.amount;
    netByPlayer[t.from] = (netByPlayer[t.from] || 0) - t.amount;
  }

  return { transactions, netByPlayer };
}
