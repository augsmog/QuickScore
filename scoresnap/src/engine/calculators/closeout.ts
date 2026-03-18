import { Player, Course } from "../types";

export interface CloseoutMatch {
  startHole: number;
  endHole: number;
  winnerName: string;
  margin: number;
}

export interface CloseoutResult {
  matches: CloseoutMatch[];
  totals: Record<string, number>;
}

/**
 * Closeout — Head-to-head match play. When a player closes out (leads by more
 * holes than remain), a new match starts on the next hole.
 * Each match won = 1 unit.
 */
export function calcCloseout(p1: Player, p2: Player, _course: Course): CloseoutResult {
  const totals = { [p1.name]: 0, [p2.name]: 0 };
  const matches: CloseoutMatch[] = [];

  let matchStart = 0;
  let status = 0; // positive = p1 leading

  for (let i = 0; i < 18; i++) {
    if (p1.scores[i] < p2.scores[i]) status++;
    else if (p2.scores[i] < p1.scores[i]) status--;

    const holesRemaining = 17 - i; // holes left after this one (within 18)
    const margin = Math.abs(status);

    // Check for closeout: leading by more than holes remaining
    if (margin > holesRemaining && holesRemaining >= 0) {
      const winner = status > 0 ? p1.name : p2.name;
      matches.push({
        startHole: matchStart + 1,
        endHole: i + 1,
        winnerName: winner,
        margin,
      });
      totals[winner] += 1;

      // Reset for new match
      status = 0;
      matchStart = i + 1;
    }
  }

  // Final match (if not closed out)
  if (matchStart < 18 && status !== 0) {
    const winner = status > 0 ? p1.name : p2.name;
    matches.push({
      startHole: matchStart + 1,
      endHole: 18,
      winnerName: winner,
      margin: Math.abs(status),
    });
    totals[winner] += 1;
  }

  return { matches, totals };
}
