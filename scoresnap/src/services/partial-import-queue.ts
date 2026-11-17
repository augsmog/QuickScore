/**
 * AUG-348i: pure question queue over the played-games plan.
 *
 * Orders the open questions (round-level team questions first, then by hole, then game order)
 * so a UI can walk them one at a time, and reports one settle gate for the whole import.
 * Nothing is defaulted: an empty `games` list is ready (nothing to ask); any open question blocks.
 * Unmounted: no React, store, persistence or network imports.
 */
import type { PartialImportGameState, PartialImportQuestion } from "./partial-import-games";

export function orderedOpenQuestions(states: readonly PartialImportGameState[]): PartialImportQuestion[] {
  const all = states.flatMap((s, gi) => s.open.map(q => ({ q, gi })));
  all.sort((a, b) => {
    const ah = a.q.hole === null ? -1 : a.q.hole;
    const bh = b.q.hole === null ? -1 : b.q.hole;
    return ah - bh || a.gi - b.gi;
  });
  return all.map(x => x.q);
}

export function nextOpenQuestion(states: readonly PartialImportGameState[]): PartialImportQuestion | null {
  return orderedOpenQuestions(states)[0] ?? null;
}

export interface PartialImportGate {
  allReady: boolean;
  openCount: number;
  /** Games that may settle now; a pending game is never listed. */
  settleable: string[];
}

export function partialImportGate(states: readonly PartialImportGameState[]): PartialImportGate {
  const openCount = states.reduce((n, s) => n + s.open.length, 0);
  return {
    allReady: openCount === 0,
    openCount,
    settleable: states.filter(s => s.status === "ready").map(s => s.game),
  };
}
