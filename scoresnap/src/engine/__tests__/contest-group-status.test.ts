import { contestGroupStatuses } from "../contest-group-status";
import type { Contest } from "../../stores/contest-store";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const now = new Date("2026-11-11T20:00:00Z");
const course = (count: number) => ({ name: `${count} holes`, holes: Array.from({ length: count }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 350 })) });
const player = (id: string, scores: number[]) => ({ id, name: id, handicap: 0, scores });
const group = (id: string, players: ReturnType<typeof player>[], teeTime?: string) => ({ id, name: id, players, teeTime });
const makeContest = (patch: Partial<Contest> = {}) => ({
  id: "c", name: "Contest", course: course(18), status: "active", betUnit: 1, hasTeams: false,
  groups: [], games: [], createdAt: "2026-01-01", ...patch,
} as unknown as Contest);

describe("contest group statuses", () => {
  it("reports an 18-hole shotgun from hole 10 through five and final", () => {
    const group1 = group("g", [player("p", Array.from({ length: 18 }, (_, i) => i >= 9 && i < 14 ? 4 : 0))]);
    const contest = makeContest({ groups: [group1] });
    expect(contestGroupStatuses(contest, { startType: "shotgun", startSlots: { g: { hole: 10 } }, now })[0].status)
      .toEqual({ kind: "thru", n: 5 });
    group1.players[0].scores = Array(18).fill(4);
    expect(contestGroupStatuses(contest, { startType: "shotgun", startSlots: { g: { hole: 10 } }, now })[0].status)
      .toEqual({ kind: "final" });
  });

  it("uses hole one for tee times and waits for every player at each hole", () => {
    const contest = makeContest({ groups: [group("g", [player("a", [4, 4, 0]), player("b", [4, 0, 4])], "10:03")] });
    const [result] = contestGroupStatuses(contest, { startType: "tee_times", startSlots: { g: { hole: 10 } }, now });
    expect(result.status).toEqual({ kind: "thru", n: 1 });
    expect(result.teeTime).toBe("10:03");
  });

  it("uses nine-hole course length for final and rejects an out-of-range shotgun slot", () => {
    const contest = makeContest({ course: course(9), groups: [group("g", [player("p", Array(9).fill(4))])] });
    expect(contestGroupStatuses(contest, { now, startType: "tee_times" })[0].status).toEqual({ kind: "final" });
    expect(contestGroupStatuses(contest, { now, startType: "tee_times", startSlots: { g: { hole: 10 } } })[0].status).toEqual({ kind: "final" });
    expect(() => contestGroupStatuses(contest, { now, startType: "shotgun", startSlots: { g: { hole: 10 } } })).toThrow(RangeError);
  });

  it("uses per-group timestamps with the 20-minute stale threshold", () => {
    const contest = makeContest({ groups: [group("stale", [player("a", [4])]), group("live", [player("b", [4])])] });
    const [stale, live] = contestGroupStatuses(contest, {
      now, lastScoreAtByGroup: {
        stale: new Date(now.getTime() - 21 * 60_000),
        live: new Date(now.getTime() - 19 * 60_000),
      },
    });
    expect(stale.status).toEqual({ kind: "stale", minutes: 21 });
    expect(live.status).toEqual({ kind: "thru", n: 1 });
  });

  it("selects current or explicit rounds and returns no groups for an unknown round", () => {
    const first = group("first", [player("p1", [4])]);
    const second = group("second", [player("p2", [4, 4])]);
    const contest = makeContest({ isTournament: true, currentRound: 2, rounds: [
      { id: "r1", number: 1, name: "R1", groups: [first] },
      { id: "r2", number: 2, name: "R2", course: course(9), groups: [second] },
    ] });
    expect(contestGroupStatuses(contest, { now }).map((result) => result.groupId)).toEqual(["second"]);
    expect(contestGroupStatuses(contest, { now, roundId: "r1" }).map((result) => result.groupId)).toEqual(["first"]);
    expect(contestGroupStatuses(contest, { now, roundId: "missing" })).toEqual([]);
  });

  it("returns not_started for empty groups and defaults missing slots and timestamps", () => {
    const [result] = contestGroupStatuses(makeContest({ groups: [group("empty", [])] }), { now });
    expect(result.startSlot).toEqual({ hole: 1 });
    expect(result.status).toEqual({ kind: "not_started" });
  });

  it("keeps progress isolated across four groups of four players", () => {
    const groups = Array.from({ length: 4 }, (_, gi) => group(`g${gi}`, Array.from({ length: 4 }, (_, pi) =>
      player(`p${gi}-${pi}`, Array.from({ length: 18 }, (_, hole) => hole < gi + 1 ? 4 : 0)),
    )));
    const result = contestGroupStatuses(makeContest({ groups }), { now });
    expect(result.map((row) => row.status)).toEqual([
      { kind: "thru", n: 1 }, { kind: "thru", n: 2 }, { kind: "thru", n: 3 }, { kind: "thru", n: 4 },
    ]);
  });
});
