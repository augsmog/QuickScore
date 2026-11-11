import { validateStartSlots, validateContestChange, validateHostContest } from "../contest-validation";
import type { Contest } from "../../stores/contest-store";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

function contest({
  holes = 18,
  isTournament = false,
  rounds,
  groups = [{ id: "g1", name: "Group 1", players: [], startSlot: { hole: 1 } }],
}: {
  holes?: number;
  isTournament?: boolean;
  rounds?: Contest["rounds"];
  groups?: Contest["groups"];
} = {}): Contest {
  return {
    id: "c1", name: "Test", course: { holes: Array.from({ length: holes }, (_, i) => ({ number: i + 1 })) } as any,
    status: "active", betUnit: 0, hasTeams: false, groups, games: [], createdAt: "2026-11-11T00:00:00Z",
    isTournament, rounds,
  };
}

describe("contest start slots", () => {
  it("accepts shotgun slots on 18-hole and 9-hole courses", () => {
    validateStartSlots(contest({ groups: [{ id: "18", name: "18 holes", players: [], startSlot: { hole: 18, wave: "B" } }] }));
    validateStartSlots(contest({ holes: 9, groups: [{ id: "9", name: "9 holes", players: [], startSlot: { hole: 9, wave: "A" } }] }));
  });

  it("rejects holes outside the course and an invalid wave through host validation", () => {
    for (const hole of [0, 19]) expect(() => validateStartSlots(contest({ groups: [{ id: "g", name: "G", players: [], startSlot: { hole } }] }))).toThrow(RangeError);
    expect(() => validateStartSlots(contest({ holes: 9, groups: [{ id: "g", name: "G", players: [], startSlot: { hole: 10 } }] }))).toThrow(RangeError);
    expect(() => validateHostContest(contest({ groups: [{ id: "g", name: "G", players: [], startSlot: { hole: 4, wave: "C" as any } }] }), "free" as any)).toThrow(RangeError);
  });

  it("validates each tournament round against that round's course", () => {
    const tournament = contest({ isTournament: true, rounds: [
      { id: "r1", number: 1, name: "18-hole", groups: [{ id: "g1", name: "G1", players: [], startSlot: { hole: 18 } }] },
      { id: "r2", number: 2, name: "9-hole", course: { holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1 })) } as any, groups: [{ id: "g2", name: "G2", players: [], startSlot: { hole: 9 } }] },
    ] });
    validateStartSlots(tournament);
    tournament.rounds![1].groups[0].startSlot = { hole: 10 };
    expect(() => validateStartSlots(tournament)).toThrow(RangeError);
  });

  it("keeps legacy contests loadable and round-trips new optional fields", () => {
    const legacy = JSON.parse('{"id":"old","groups":[{"id":"g","name":"G","players":[]}]}') as Contest;
    expect(legacy.groups[0].startSlot).toBeUndefined();
    const next = { ...legacy, startType: "shotgun" as const, rounds: [{ id: "r1", number: 1, name: "Round 1", startType: "tee_times" as const, groups: [{ ...legacy.groups[0], startSlot: { hole: 7, wave: "B" as const } }] }] };
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  });

  it("allows a start slot before scoring and keeps the existing started-round lock", () => {
    const before = contest({ groups: [{ id: "g", name: "G", players: [{ id: "p", name: "P", scores: [] } as any] }] });
    const changed = { ...before, groups: [{ ...before.groups[0], startSlot: { hole: 7 } }] };
    expect(() => validateContestChange(before, changed)).not.toThrow();

    const started = contest({ groups: [{ id: "g", name: "G", players: [{ id: "p", name: "P", scores: [4] } as any] }] });
    const startedChange = { ...started, groups: [{ ...started.groups[0], startSlot: { hole: 7 } }] };
    expect(() => validateContestChange(started, startedChange)).toThrow("Roster, course and imported scores must use their dedicated validated actions after play starts");
  });
});
