declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
import { calcFourBallAllTeams } from "../calculators/fourball";
import { calculateSettlement } from "../settlement";
import { validateVariationSetup } from "../types";
import type { Player, Course } from "../types";

const course: Course = { name: "C", holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 })) } as Course;
const p = (id: string, team: string, score: number): Player => ({ id, name: id, team, handicap: 0, scores: Array(18).fill(score) });

describe("Four-Ball all teams", () => {
  // Augie's confirmed six-player case: three two-person teams, each pair plays every other pair.
  const sixPlayerThreePair = [
    p("a1", "A", 3), p("a2", "A", 5),
    p("b1", "B", 4), p("b2", "B", 4),
    p("c1", "C", 5), p("c2", "C", 5),
  ];

  it("plays every pair of two-person teams, round robin (previously ignored beyond the first two)", () => {
    const teams = new Map<string, Player[]>();
    sixPlayerThreePair.forEach((x) => teams.set(x.team!, [...(teams.get(x.team!) || []), x]));
    const m = calcFourBallAllTeams(teams);
    expect(m).toHaveLength(3); // A-B, A-C, B-C
    expect(m.find((x: any) => x.team1Id === "A" && x.team2Id === "B")!.finalStatus).toBe(18); // A best (3) beats B (4) every hole
    expect(m.find((x: any) => x.team1Id === "B" && x.team2Id === "C")!.finalStatus).toBe(18); // B best (4) beats C (5) every hole
    expect(m.find((x: any) => x.team1Id === "A" && x.team2Id === "C")!.finalStatus).toBe(18);
  });

  it("settles across all three pairs, not just the first two", () => {
    const s = calculateSettlement(sixPlayerThreePair, course, ["fourball"], 10);
    const tx = s.transactions;
    // A beats B (2x2) + A beats C (2x2) + B beats C (2x2)
    expect(tx).toHaveLength(4 + 4 + 4);
    expect(tx.every((t: any) => t.amount === 10)).toBe(true);
  });

  it("two-team baseline is unchanged: exactly one match, same math as before", () => {
    const twoTeams = [p("a1", "A", 3), p("a2", "A", 5), p("b1", "B", 4), p("b2", "B", 4)];
    const s = calculateSettlement(twoTeams, course, ["fourball"], 10);
    expect(s.transactions).toHaveLength(4); // 2 losers x 2 winners
    expect(s.transactions.every((t: any) => t.to === "a1" || t.to === "a2")).toBe(true);
  });

  it("a team that isn't a pair is excluded from matchups rather than silently settled", () => {
    const withMalformedTeam = [
      ...sixPlayerThreePair,
      p("d1", "D", 1), p("d2", "D", 1), p("d3", "D", 1), // three-player "team" is not a supported Four-Ball unit
    ];
    const teams = new Map<string, Player[]>();
    withMalformedTeam.forEach((x) => teams.set(x.team!, [...(teams.get(x.team!) || []), x]));
    const m = calcFourBallAllTeams(teams);
    expect(m.some((x: any) => x.team1Id === "D" || x.team2Id === "D")).toBe(false);
    expect(m).toHaveLength(3); // still just A-B, A-C, B-C
  });

  it("rejects a malformed Four-Ball roster at setup time instead of partially settling it", () => {
    const malformedGroups = [{ name: "G1", players: [p("a1", "A", 3), p("a2", "A", 5), p("b1", "B", 4), p("b2", "B", 4), p("e1", "E", 2)] }];
    const error = validateVariationSetup(malformedGroups, ["fourball"], { rulesVersion: 1 }, 10);
    expect(error).toBe("Four-Ball requires two or more complete two-player teams per group.");
    expect(() => calculateSettlement(malformedGroups[0].players, course, ["fourball"], 10, undefined, { rulesVersion: 1 }, malformedGroups)).toThrow();
  });

  it("a first-group-only malformed fixture cannot bypass per-group pair-structure checks", () => {
    const multiGroup = [
      { name: "G1", players: [p("a1", "A", 3), p("a2", "A", 5), p("a3", "A", 2), p("b1", "B", 4), p("b2", "B", 4)] }, // G1 malformed: team A has 3
      { name: "G2", players: [p("c1", "C", 5), p("c2", "C", 5), p("d1", "D", 4), p("d2", "D", 4)] }, // G2 valid on its own
    ];
    const error = validateVariationSetup(multiGroup, ["fourball"], { rulesVersion: 1 }, 10);
    expect(error).toBe("Four-Ball requires two or more complete two-player teams per group.");
  });

  it("aggregates a two-group fixture: every team from both groups settles, amounts and identities preserved", () => {
    const groupOne = [p("a1", "A", 3), p("a2", "A", 5), p("b1", "B", 4), p("b2", "B", 4)];
    const groupTwo = [p("c1", "C", 5), p("c2", "C", 5), p("d1", "D", 4), p("d2", "D", 4)];
    const combined = [...groupOne, ...groupTwo];
    const s = calculateSettlement(combined, course, ["fourball"], 10);
    // 4 teams -> 6 matchups; A/B strictly decided, C vs D tied (same scores), C/D vs A/B strictly decided.
    const decisive = s.transactions;
    expect(decisive.length).toBeGreaterThan(0);
    const totalOut = decisive.reduce((sum: number, t: any) => sum + t.amount, 0);
    const totalIn = decisive.reduce((sum: number, t: any) => sum + t.amount, 0);
    expect(totalOut).toBe(totalIn); // conservation: every dollar paid is a dollar received
    const names = new Set(combined.map((pl) => pl.name));
    expect(decisive.every((t: any) => names.has(t.to) && names.has(t.from))).toBe(true);
  });
});
