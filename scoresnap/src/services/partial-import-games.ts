/**
 * AUG-348g: pure "which games were already being played?" model for a mid-round import.
 *
 * Decides, for each game the group says it was playing, which facts strokes cannot establish
 * for the PLAYED holes only (Wolf partners, Hammer decisions, Snake/Greenie/BBB winners, team
 * assignments). Unanswered facts leave the game `pending` for those holes. Nothing is invented:
 * no default partner, no "no hammer", no side-game winner. A pending game must not settle.
 *
 * Unmounted: no React, store, persistence or network imports.
 */
import type { AuxiliaryData, GameType } from "../engine/types";

export type PartialImportQuestionKind =
  | "teams" | "press-history" | "wolf-partner" | "hammer-decision" | "snake-putters"
  | "greenie-winner" | "bbb-winners";

export interface PartialImportQuestion {
  game: GameType;
  kind: PartialImportQuestionKind;
  /** Played hole the question is about; null for round-level facts such as team assignment. */
  hole: number | null;
}

export type PartialImportGameStatus = "ready" | "pending";

export interface PartialImportGameState {
  game: GameType;
  status: PartialImportGameStatus;
  /** Unanswered questions; empty when ready. */
  open: PartialImportQuestion[];
}

export interface PartialImportGameInput {
  games: readonly GameType[];
  /** Holes actually played (confirmed), in any order. */
  playedHoles: readonly number[];
  /** Par by course hole, needed to know which played holes are par 3s (Greenies). */
  parByHole: Readonly<Record<number, number>>;
  /** Player ids with a team already known (from the round, if any). */
  teamByPlayer?: Readonly<Record<string, string | null | undefined>>;
  playerIds: readonly string[];
  /** Answers collected so far. Absent key means unanswered, never "no". */
  aux?: AuxiliaryData;
}

/** Team games whose result depends on who is partnered with whom. */
const TEAM_ASSIGNMENT_GAMES: ReadonlySet<GameType> = new Set<GameType>([
  "vegas", "best_ball", "scramble", "shamble", "alternate_shot", "chapman", "fourball",
]);

/** Planning and recording share validation; partial cached facts must remain pending. */
export const PARTIAL_GAME_FACTS = {
  wolf: { key: "wolf", kind: "wolf-partner" },
  hammer: { key: "hammer", kind: "hammer-decision" },
  snake: { key: "snake", kind: "snake-putters" },
  greenies: { key: "greenies", kind: "greenie-winner" },
  bingo_bango_bongo: { key: "bbb", kind: "bbb-winners" },
} as const;

export function completePartialGameFact(game: GameType, value: unknown): boolean {
  const id = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const winner = (v: unknown) => v === null || id(v);
  if (game === "greenies") return winner(value);
  if (game === "snake") return Array.isArray(value) && value.every(id);
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  switch (game) {
    case "wolf": return typeof v.isLoneWolf === "boolean" &&
      (v.isLoneWolf ? v.partnerId === null : id(v.partnerId));
    case "hammer": return typeof v.hammered === "boolean" && typeof v.accepted === "boolean" &&
      typeof v.hammerBy === "string" && (!v.hammered || id(v.hammerBy));
    case "bingo_bango_bongo": return winner(v.bingo) && winner(v.bango) && winner(v.bongo);
    default: return false;
  }
}

export function hasCompletePartialGameFact(game: GameType, aux: AuxiliaryData, hole: number): boolean {
  const fact = PARTIAL_GAME_FACTS[game as keyof typeof PARTIAL_GAME_FACTS];
  const rec = fact && aux[fact.key];
  return !!rec && Object.prototype.hasOwnProperty.call(rec, hole) && completePartialGameFact(game, rec[hole]);
}

export function questionsForGame(game: GameType, input: PartialImportGameInput): PartialImportQuestion[] {
  const out: PartialImportQuestion[] = [];
  const holes = [...new Set(input.playedHoles)].sort((a, b) => a - b);
  const aux = input.aux ?? {};
  const q = (kind: PartialImportQuestionKind, hole: number | null) => out.push({ game, kind, hole });

  if (TEAM_ASSIGNMENT_GAMES.has(game) || ((game === "nassau" || game === "nassau_press") && input.playerIds.length > 2)) {
    const known = input.playerIds.length > 0 &&
      input.playerIds.every(id => !!input.teamByPlayer?.[id]);
    if (!known) q("teams", null);
  }
  // AuxiliaryData cannot represent manual press declarations. Keep them pending
  // until a dedicated settings/history adapter exists; never infer them from strokes.
  if (game === "nassau_press") q("press-history", null);
  for (const hole of holes) {
    switch (game) {
      case "wolf": if (!hasCompletePartialGameFact(game, aux, hole)) q("wolf-partner", hole); break;
      case "hammer": if (!hasCompletePartialGameFact(game, aux, hole)) q("hammer-decision", hole); break;
      case "snake": if (!hasCompletePartialGameFact(game, aux, hole)) q("snake-putters", hole); break;
      case "greenies":
        // Par unknown => cannot tell if it was a par 3; ask rather than skip.
        if ((input.parByHole[hole] === undefined || input.parByHole[hole] === 3) && !hasCompletePartialGameFact(game, aux, hole)) q("greenie-winner", hole);
        break;
      case "bingo_bango_bongo": if (!hasCompletePartialGameFact(game, aux, hole)) q("bbb-winners", hole); break;
      default: break;
    }
  }
  return out;
}

/** Per-game readiness for the played holes. Never fabricates an answer. */
export function planPartialImportGames(input: PartialImportGameInput): PartialImportGameState[] {
  return [...new Set(input.games)].map(game => {
    const open = questionsForGame(game, input);
    return { game, status: open.length ? "pending" : "ready", open };
  });
}

/** A game may settle only if every question for it is answered. */
export function canSettlePartialGame(states: readonly PartialImportGameState[], game: GameType): boolean {
  const s = states.find(x => x.game === game);
  return !!s && s.status === "ready";
}
