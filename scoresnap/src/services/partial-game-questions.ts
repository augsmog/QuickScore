/**
 * AUG-348g: which per-hole game facts a mid-round scorecard import must ask about instead of
 * inventing. Strokes alone establish stroke-play/skins/etc results, but they never establish
 * who was the Wolf, whether a Hammer was accepted, or who won a side game on an already-played
 * hole — those are the "game-specific facts strokes cannot establish" the parent ticket calls
 * out. This module is pure (no React, no store, no persistence) and still unmounted: nothing
 * imports it yet.
 */
import type { AuxiliaryData, Course, GameType } from "../engine/types";

/**
 * The per-hole "Tier 2" games app/scan/game-details.tsx already asks about today. Mirrors that
 * screen's `Tier2Game` union so a future wiring pass can swap its holeQuestions computation for
 * this one without a type change.
 */
export type Tier2Game = "wolf" | "hammer" | "snake" | "greenies" | "bingo_bango_bongo";

export interface OutstandingGameQuestion {
  hole: number;
  game: Tier2Game;
}

const AUX_KEY: Record<Tier2Game, keyof AuxiliaryData> = {
  wolf: "wolf",
  hammer: "hammer",
  snake: "snake",
  greenies: "greenies",
  bingo_bango_bongo: "bbb",
};

function appliesToHole(game: Tier2Game, par: number): boolean {
  // Matches game-details.tsx: every Tier 2 game asks on every hole except
  // greenies, which only exists on par-3s.
  return game === "greenies" ? par === 3 : true;
}

/**
 * Outstanding questions are holes that were actually played (in `playedHoles`), for games the
 * group has active, that this hole's rules apply to, and that have no existing auxiliary answer
 * yet. Never returns a question for a hole that has not been played — there is nothing to ask
 * about a hole nobody has gotten to. Never returns a question that already has an answer —
 * re-asking would risk overwriting a real decision with a guess.
 */
export function outstandingGameQuestions(
  playedHoles: ReadonlySet<number>,
  activeGames: readonly GameType[],
  course: Course,
  auxiliary: AuxiliaryData,
): OutstandingGameQuestion[] {
  const active = new Set(activeGames);
  const questions: OutstandingGameQuestion[] = [];

  for (const hole of course.holes) {
    if (!playedHoles.has(hole.num)) continue;
    for (const game of Object.keys(AUX_KEY) as Tier2Game[]) {
      if (!active.has(game)) continue;
      if (!appliesToHole(game, hole.par)) continue;
      const answered = auxiliary[AUX_KEY[game]]?.[hole.num] !== undefined;
      if (!answered) questions.push({ hole: hole.num, game });
    }
  }

  return questions.sort((a, b) => a.hole - b.hole || a.game.localeCompare(b.game));
}

/**
 * True whenever any played hole still has an unanswered game fact. A caller settling the round
 * must treat this as "visibly pending" rather than produce a settlement that silently assumed no
 * Wolf partner, no Hammer, or no side-game winner.
 */
export function hasOutstandingGameHistory(questions: readonly OutstandingGameQuestion[]): boolean {
  return questions.length > 0;
}
