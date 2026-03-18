import { Player } from "../types";

export interface NassauPressResult {
  p1: string;
  p2: string;
  front: number;
  back: number;
  overall: number;
  presses: { startHole: number; endHole: number; winner: string; value: number }[];
  totalBets: number;
}

/**
 * Nassau with Presses — Standard Nassau (front 9, back 9, overall) plus
 * automatic presses when a player is 2-down in any bet.
 * A press starts a new side bet from the current hole.
 */
export function calcNassauPress(p1: Player, p2: Player): NassauPressResult {
  let front = 0;
  let back = 0;
  const presses: { startHole: number; endHole: number; winner: string; value: number }[] = [];

  // Track front 9 with press detection
  let frontPressActive = false;
  let frontPressStart = 0;
  let frontPressStatus = 0;

  for (let i = 0; i < 9; i++) {
    if (p1.scores[i] < p2.scores[i]) front++;
    else if (p2.scores[i] < p1.scores[i]) front--;

    // Auto-press when 2 down in front 9
    if (Math.abs(front) >= 2 && !frontPressActive && i < 8) {
      frontPressActive = true;
      frontPressStart = i + 1;
      frontPressStatus = 0;
    }

    if (frontPressActive) {
      if (p1.scores[i] < p2.scores[i]) frontPressStatus++;
      else if (p2.scores[i] < p1.scores[i]) frontPressStatus--;
    }
  }

  if (frontPressActive && frontPressStatus !== 0) {
    presses.push({
      startHole: frontPressStart + 1,
      endHole: 9,
      winner: frontPressStatus > 0 ? p1.name : p2.name,
      value: 1,
    });
  }

  // Track back 9 with press detection
  let backPressActive = false;
  let backPressStart = 0;
  let backPressStatus = 0;

  for (let i = 9; i < 18; i++) {
    if (p1.scores[i] < p2.scores[i]) back++;
    else if (p2.scores[i] < p1.scores[i]) back--;

    if (Math.abs(back) >= 2 && !backPressActive && i < 17) {
      backPressActive = true;
      backPressStart = i + 1;
      backPressStatus = 0;
    }

    if (backPressActive) {
      if (p1.scores[i] < p2.scores[i]) backPressStatus++;
      else if (p2.scores[i] < p1.scores[i]) backPressStatus--;
    }
  }

  if (backPressActive && backPressStatus !== 0) {
    presses.push({
      startHole: backPressStart + 1,
      endHole: 18,
      winner: backPressStatus > 0 ? p1.name : p2.name,
      value: 1,
    });
  }

  const overall = front + back;

  return {
    p1: p1.name,
    p2: p2.name,
    front,
    back,
    overall,
    presses,
    totalBets: 3 + presses.length, // front + back + overall + presses
  };
}
