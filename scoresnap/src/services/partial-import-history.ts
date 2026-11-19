/**
 * AUG-1396: plans imported game history for each group/round scope that has a retained,
 * reviewed played-hole scope (`Contest.playedHolesByScope`). Built only from the existing
 * `planPartialImportGames` / `partialImportGate` plus canonical scoped auxiliary and player team
 * data. Nothing is invented: unanswered Wolf/Hammer/press/team/Snake/Greenies/BBB facts keep the
 * scope pending, and a pending scope must never produce a settlement.
 * Pure: type-only imports from the store.
 */
import type { Contest } from "../stores/contest-store";
import type { PartialImportGameState } from "./partial-import-games";
import { planPartialImportGames } from "./partial-import-games";
import { partialImportGate } from "./partial-import-queue";
import { scopeKey, scopedAuxiliary } from "../engine/contest-results";

export interface PartialHistoryScope {
  key: string;
  roundId: string | undefined;
  groupId: string;
  playedHoles: number[];
  states: PartialImportGameState[];
  pending: boolean;
  openCount: number;
}

export function planContestPartialHistory(contest: Contest): PartialHistoryScope[] {
  const scopes = contest.playedHolesByScope;
  if (!scopes) return [];
  const rounds = contest.isTournament && contest.rounds?.length
    ? contest.rounds
    : [{ id: undefined as string | undefined, course: contest.course, groups: contest.groups }];
  const out: PartialHistoryScope[] = [];
  for (const round of rounds) {
    const course = round.course ?? contest.course;
    const parByHole: Record<number, number> = {};
    for (const h of course.holes) parByHole[h.num] = h.par;
    for (const group of round.groups) {
      const key = scopeKey(round.id, group.id);
      const playedHoles = scopes[key];
      if (!playedHoles?.length) continue;
      const states = planPartialImportGames({
        games: contest.games,
        playedHoles,
        parByHole,
        teamByPlayer: Object.fromEntries(group.players.map(p => [p.id, p.team])),
        playerIds: group.players.map(p => p.id),
        aux: scopedAuxiliary(contest, group.id, round.id),
      });
      const gate = partialImportGate(states);
      out.push({ key, roundId: round.id, groupId: group.id, playedHoles: [...playedHoles], states, pending: !gate.allReady, openCount: gate.openCount });
    }
  }
  return out;
}

/** True when any scope with a retained played-hole scope still has unanswered game facts. */
export function hasPendingPartialHistory(contest: Contest): boolean {
  return planContestPartialHistory(contest).some(s => s.pending);
}
