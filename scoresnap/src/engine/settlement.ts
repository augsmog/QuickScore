import { Transaction, SettlementSummary, Player, Course, GameType } from "./types";
import { calcStrokePlay } from "./calculators/stroke-play";
import { calcSkins } from "./calculators/skins";
import { calcNassau } from "./calculators/nassau";
import { calcStableford } from "./calculators/stableford";

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

      // Additional game types will be added as calculators are implemented
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
