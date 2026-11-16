/**
 * AUG-348h: pure answer recorder for the mid-round played-games questions.
 *
 * Takes one explicit answer and returns a NEW AuxiliaryData (never mutates). Only holes the
 * caller names are written; an answer is accepted only for a played hole and only with a
 * complete value, so a half-answer leaves the question open instead of faking "no".
 * Unmounted: no React, store, persistence or network imports.
 */
import type { AuxiliaryData } from "../engine/types";
import type { PartialImportQuestion } from "./partial-import-games";

export type PartialImportAnswer =
  | { kind: "wolf-partner"; partnerId: string | null; isLoneWolf: boolean }
  | { kind: "hammer-decision"; hammered: boolean; hammerBy: string; accepted: boolean }
  | { kind: "snake-putters"; playerIds: string[] }
  | { kind: "greenie-winner"; playerId: string | null }
  | { kind: "bbb-winners"; bingo: string | null; bango: string | null; bongo: string | null };

export type RecordAnswerResult =
  | { ok: true; aux: AuxiliaryData }
  | { ok: false; reason: "kind-mismatch" | "not-played-hole" | "round-level" | "incomplete" };

export function recordPartialImportAnswer(
  aux: AuxiliaryData | undefined,
  question: PartialImportQuestion,
  answer: PartialImportAnswer,
  playedHoles: readonly number[],
): RecordAnswerResult {
  if (question.kind !== answer.kind) return { ok: false, reason: "kind-mismatch" };
  const hole = question.hole;
  if (hole === null) return { ok: false, reason: "round-level" };
  if (!playedHoles.includes(hole)) return { ok: false, reason: "not-played-hole" };
  const next: AuxiliaryData = { ...(aux ?? {}) };
  switch (answer.kind) {
    case "wolf-partner":
      // A named partner is required unless the group explicitly says lone wolf.
      if (!answer.isLoneWolf && !answer.partnerId) return { ok: false, reason: "incomplete" };
      next.wolf = { ...next.wolf, [hole]: { partnerId: answer.isLoneWolf ? null : answer.partnerId, isLoneWolf: answer.isLoneWolf } };
      break;
    case "hammer-decision":
      if (answer.hammered && !answer.hammerBy) return { ok: false, reason: "incomplete" };
      next.hammer = { ...next.hammer, [hole]: { hammered: answer.hammered, hammerBy: answer.hammered ? answer.hammerBy : "", accepted: answer.hammered && answer.accepted } };
      break;
    case "snake-putters":
      next.snake = { ...next.snake, [hole]: [...new Set(answer.playerIds)] };
      break;
    case "greenie-winner":
      next.greenies = { ...next.greenies, [hole]: answer.playerId };
      break;
    case "bbb-winners":
      next.bbb = { ...next.bbb, [hole]: { bingo: answer.bingo, bango: answer.bango, bongo: answer.bongo } };
      break;
  }
  return { ok: true, aux: next };
}
