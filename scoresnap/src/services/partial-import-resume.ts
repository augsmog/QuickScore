import type { Contest, ContestGroup } from "../stores/contest-store";
import type { HoleInfo } from "../engine/types";
import { nextHoleToScore } from "./partial-import-confirm";

/** Keep course identities/order intact, rotating only when the group's start is known. */
export function scoringPlayOrder(holes: readonly HoleInfo[], group: ContestGroup): number[] {
  const identities = holes.map(h => h.num);
  const start = identities.indexOf(group.startSlot?.hole ?? identities[0]);
  return start > 0 ? [...identities.slice(start), ...identities.slice(0, start)] : identities;
}

export function partialImportResume(contest: Contest | undefined, groupId?: string) {
  const round = contest?.isTournament ? contest.rounds?.find(r => r.number === contest.currentRound) : undefined;
  const groups = round?.groups ?? contest?.groups ?? [];
  const groupIndex = Math.max(0, groups.findIndex(g => g.id === groupId));
  const group = groups[groupIndex];
  const holes = (round?.course ?? contest?.course)?.holes ?? [];
  if (!group || contest?.isTournament && !round) return { groupIndex, hole: null };
  const order = scoringPlayOrder(holes, group);
  const scored = group.players.flatMap(p => holes.flatMap((h, index) =>
    Number.isFinite(p.scores[index]) && p.scores[index] > 0 ? [{ playerId: p.id, hole: h.num }] : []));
  return { groupIndex, hole: nextHoleToScore(order, group.players.map(p => p.id), scored) ?? order[0] ?? null };
}
