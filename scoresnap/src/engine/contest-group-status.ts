import type { Contest, ContestGroup } from "../stores/contest-store";
import { groupStatus, type GroupStatus, type StartSlot, type StartType } from "./group-status";

export interface ContestGroupStatusOptions {
  roundId?: string;
  startType?: StartType;
  startSlots?: Record<string, StartSlot>;
  lastScoreAtByGroup?: Record<string, Date | string | number | null>;
  now: Date | string | number;
  staleMinutes?: number;
}

export interface ContestGroupStatus {
  groupId: string;
  name: string;
  teeTime?: string;
  startSlot: StartSlot;
  status: GroupStatus;
}

/** Adapt saved contest scores into per-group live progress without importing runtime stores. */
export function contestGroupStatuses(
  contest: Contest,
  opts: ContestGroupStatusOptions,
): ContestGroupStatus[] {
  const round = opts.roundId !== undefined
    ? contest.rounds?.find((candidate) => candidate.id === opts.roundId)
    : contest.isTournament && contest.rounds && contest.currentRound
      ? contest.rounds.find((candidate) => candidate.number === contest.currentRound)
      : undefined;
  const groups = opts.roundId !== undefined
    ? round?.groups ?? []
    : contest.isTournament && contest.rounds && contest.currentRound
      ? round?.groups ?? []
      : contest.groups;
  const holes = (round?.course ?? contest.course).holes.length;

  return groups.map((group: ContestGroup) => {
    const startSlot = opts.startSlots?.[group.id] ?? { hole: 1 };
    const scoredHoles = group.players.length === 0
      ? []
      : Array.from({ length: holes }, (_, index) => index + 1).filter((hole) =>
          group.players.every((player) => typeof player.scores[hole - 1] === "number" && player.scores[hole - 1] > 0),
        );
    return {
      groupId: group.id,
      name: group.name,
      teeTime: group.teeTime,
      startSlot,
      status: groupStatus({
        scoredHoles,
        startType: opts.startType ?? "tee_times",
        startSlot,
        lastScoreAt: opts.lastScoreAtByGroup?.[group.id] ?? null,
        now: opts.now,
        staleMinutes: opts.staleMinutes,
        holes,
      }),
    };
  });
}
