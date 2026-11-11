declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

import { contestFlightStandings } from "../contest-flights";
import type { FlightRule } from "../flights";
import type { Contest, ContestGroup } from "../../stores/contest-store";
import type { Course, Player } from "../types";

const course18 = (name = "Course"): Course => ({
  name,
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 })),
});
// A 9-hole course cannot be ranked net (netSupported needs a full 18-hole map),
// so a requested "net" falls back to gross on it.
const course9 = (name = "Front Nine"): Course => ({
  name,
  holes: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 })),
});

const player = (id: string, handicap: number, scores: number[]): Player => ({
  id,
  name: id,
  handicap,
  scores,
});
const group = (id: string, players: Player[]): ContestGroup => ({ id, name: id, players });
const base = (overrides: Partial<Contest> = {}): Contest => ({
  id: "c1",
  name: "Contest",
  course: course18(),
  status: "active",
  betUnit: 1,
  hasTeams: false,
  groups: [],
  games: [],
  createdAt: "",
  ...overrides,
});

const even = Array(18).fill(4); // gross 72
const one5 = [5, ...Array(17).fill(4)]; // gross 73
const two5 = [5, 5, ...Array(16).fill(4)]; // gross 74

describe("contestFlightStandings", () => {
  it("splits handicap bands across three flights with flight-local ties and keeps empty bands", () => {
    const contest = base({
      groups: [
        group("g1", [
          player("p1", 2, even), // gross 72 -> band Low
          player("p2", 4, even), // gross 72 -> band Low (ties p1)
          player("p3", 12, one5), // gross 73 -> band Mid
          player("p4", 25, two5), // gross 74 -> band High (above last max)
        ]),
      ],
    });
    const rule: FlightRule = {
      mode: "bands",
      bands: [
        { name: "Low", maxHandicap: 5 },
        { name: "Mid", maxHandicap: 15 },
        { name: "High", maxHandicap: 30 },
        { name: "Empty", maxHandicap: 40 },
      ],
    };
    const result = contestFlightStandings(contest, rule, { rankMode: "gross" });
    expect(result.effectiveRankMode).toBe("gross");
    expect(result.map((flight) => flight.name)).toEqual(["Low", "Mid", "High", "Empty"]);
    expect(result[0].standings).toEqual([
      expect.objectContaining({ playerId: "p1", rank: 1, tied: true, rankLabel: "T1" }),
      expect.objectContaining({ playerId: "p2", rank: 1, tied: true, rankLabel: "T1" }),
    ]);
    // Ranks restart inside each flight.
    expect(result[1].standings).toEqual([expect.objectContaining({ playerId: "p3", rank: 1 })]);
    expect(result[2].standings).toEqual([expect.objectContaining({ playerId: "p4", rank: 1 })]);
    expect(result[3].standings).toEqual([]);
  });

  it("honours manual assignments and routes the unassigned to the fallback flight", () => {
    const contest = base({
      groups: [group("g1", [player("a", 0, even), player("b", 0, one5), player("c", 0, two5)])],
    });
    const rule: FlightRule = { mode: "manual", assignments: { a: "Blue", b: "Gold" }, fallback: "Reserves" };
    const result = contestFlightStandings(contest, rule, { rankMode: "gross" });
    expect(result.map((flight) => flight.name)).toEqual(["Blue", "Gold", "Reserves"]);
    expect(result[2].standings.map((row: any) => row.playerId)).toEqual(["c"]);
  });

  it('defaults an unassigned player to "Unflighted" when no fallback is given', () => {
    const contest = base({ groups: [group("g1", [player("a", 0, even), player("z", 0, one5)])] });
    const rule: FlightRule = { mode: "manual", assignments: { a: "Blue" } };
    const result = contestFlightStandings(contest, rule, { rankMode: "gross" });
    expect(result.map((flight) => flight.name)).toEqual(["Blue", "Unflighted"]);
    expect(result[1].standings.map((row: any) => row.playerId)).toEqual(["z"]);
  });

  it("uses the active tournament round by default and an explicit roundId when requested", () => {
    const rule: FlightRule = { mode: "manual", assignments: {}, fallback: "All" };
    const contest = base({
      isTournament: true,
      currentRound: 2,
      rounds: [
        { id: "r1", number: 1, name: "R1", groups: [group("ga", [player("first", 0, even)])] },
        { id: "r2", number: 2, name: "R2", groups: [group("gb", [player("second", 0, even)])] },
      ],
    });
    const byDefault = contestFlightStandings(contest, rule, { rankMode: "gross" });
    expect(byDefault[0].standings.map((row: any) => row.playerId)).toEqual(["second"]);
    const explicit = contestFlightStandings(contest, rule, { rankMode: "gross", roundId: "r1" });
    expect(explicit[0].standings.map((row: any) => row.playerId)).toEqual(["first"]);
  });

  it("selects each round's own course so THRU uses the round hole count", () => {
    const rule: FlightRule = { mode: "manual", assignments: {}, fallback: "All" };
    const contest = base({
      isTournament: true,
      currentRound: 1,
      rounds: [
        { id: "r1", number: 1, name: "R1", course: course9(), groups: [group("g", [player("p", 0, Array(9).fill(4))])] },
      ],
    });
    const result = contestFlightStandings(contest, rule, { rankMode: "gross" });
    // Nine holes played on a nine-hole course reads as finished, not "F of 18".
    expect(result[0].standings[0]).toEqual(expect.objectContaining({ playerId: "p", thru: "F" }));
  });

  it("ranks net versus gross differently, so a high handicap overtakes on net", () => {
    const contest = base({
      groups: [
        group("g1", [
          player("scratch", 0, even), // gross 72, net 72
          player("bogey", 36, Array(18).fill(5)), // gross 90, net 90 - 36 = 54
        ]),
      ],
    });
    const rule: FlightRule = { mode: "manual", assignments: {}, fallback: "All" };
    const gross = contestFlightStandings(contest, rule, { rankMode: "gross" });
    expect(gross.effectiveRankMode).toBe("gross");
    expect(gross[0].standings.map((row: any) => row.playerId)).toEqual(["scratch", "bogey"]);
    const net = contestFlightStandings(contest, rule, { rankMode: "net" });
    expect(net.effectiveRankMode).toBe("net");
    expect(net[0].standings.map((row: any) => row.playerId)).toEqual(["bogey", "scratch"]);
    expect(net[0].standings[0]).toEqual(expect.objectContaining({ playerId: "bogey", total: 54 }));
  });

  it("falls back to gross when the course cannot be ranked net", () => {
    const contest = base({
      course: course9(),
      groups: [
        group("g1", [
          player("scratch", 0, Array(9).fill(4)), // gross 36
          player("bogey", 36, Array(9).fill(5)), // gross 45 (net unavailable on 9 holes)
        ]),
      ],
    });
    const rule: FlightRule = { mode: "manual", assignments: {}, fallback: "All" };
    const net = contestFlightStandings(contest, rule, { rankMode: "net" });
    expect(net.effectiveRankMode).toBe("gross");
    // Effective mode resolves to gross: gross order and gross total, not net.
    expect(net[0].standings.map((row: any) => row.playerId)).toEqual(["scratch", "bogey"]);
    expect(net[0].standings[0]).toEqual(expect.objectContaining({ playerId: "scratch", total: 36 }));
  });

  it("counts a player appearing in two groups once", () => {
    const shared = player("same", 0, even);
    const contest = base({
      groups: [group("g1", [shared]), group("g2", [shared, player("other", 0, one5)])],
    });
    const rule: FlightRule = { mode: "manual", assignments: {}, fallback: "All" };
    const result = contestFlightStandings(contest, rule, { rankMode: "gross" });
    expect(result[0].standings.map((row: any) => row.playerId)).toEqual(["same", "other"]);
  });

  it("returns empty standings for a contest with no players without throwing", () => {
    const contest = base({ groups: [] });
    const rule: FlightRule = {
      mode: "bands",
      bands: [{ name: "A", maxHandicap: 10 }, { name: "B", maxHandicap: 20 }],
    };
    const result = contestFlightStandings(contest, rule, { rankMode: "gross" });
    expect(result).toEqual([
      { name: "A", standings: [] },
      { name: "B", standings: [] },
    ]);
    expect(result.effectiveRankMode).toBe("gross");
  });

  it("propagates rule validation errors unchanged", () => {
    const contest = base({ groups: [group("g1", [player("p1", 5, even)])] });
    expect(() =>
      contestFlightStandings(contest, { mode: "bands", bands: [] }, { rankMode: "gross" }),
    ).toThrow(RangeError);
    expect(() =>
      contestFlightStandings(
        contest,
        { mode: "bands", bands: [{ name: "B", maxHandicap: 10 }, { name: "A", maxHandicap: 5 }] },
        { rankMode: "gross" },
      ),
    ).toThrow(/sorted by maxHandicap/);
    expect(() =>
      contestFlightStandings(contest, { mode: "manual", assignments: { p1: "  " } }, { rankMode: "gross" }),
    ).toThrow(/names must not be empty/);
  });

  it("does not mutate the contest", () => {
    const contest = base({
      isTournament: true,
      currentRound: 1,
      rounds: [{ id: "r1", number: 1, name: "R1", groups: [group("g", [player("p1", 3, even), player("p2", 20, one5)])] }],
    });
    const before = JSON.stringify(contest);
    contestFlightStandings(
      contest,
      { mode: "bands", bands: [{ name: "Low", maxHandicap: 10 }, { name: "High", maxHandicap: 30 }] },
      { rankMode: "gross" },
    );
    expect(JSON.stringify(contest)).toBe(before);
  });
});
