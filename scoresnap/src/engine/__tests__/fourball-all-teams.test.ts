declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
import { calcFourBallAllTeams } from "../calculators/fourball";
import { calculateSettlement } from "../settlement";
import type { Player, Course } from "../types";

const course: Course = { name: "C", holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 })) } as Course;
const p = (id: string, team: string, score: number): Player => ({ id, name: id, team, handicap: 0, scores: Array(18).fill(score) });

describe("Four-Ball all teams", () => {
  const players = [
    p("a1", "A", 3), p("a2", "A", 5), p("a3", "A", 5),
    p("b1", "B", 4), p("b2", "B", 4),
    p("c1", "C", 5), p("c2", "C", 5), p("c3", "C", 5), p("c4", "C", 5), p("c5", "C", 5),
  ];
  it("plays every pair of teams, teams of any size", () => {
    const teams = new Map<string, Player[]>();
    players.forEach((x) => teams.set(x.team!, [...(teams.get(x.team!) || []), x]));
    const m = calcFourBallAllTeams(teams);
    expect(m).toHaveLength(3);
    expect(m.find((x) => x.team1Id === "A" && x.team2Id === "B")!.finalStatus).toBe(18);
    expect(m.find((x) => x.team1Id === "B" && x.team2Id === "C")!.finalStatus).toBe(18);
  });
  it("settles across three teams (previously ignored beyond first two, size 2 only)", () => {
    const s = calculateSettlement(players, course, ["fourball"], 10);
    const tx = s.transactions;
    // A beats B (2 losers x 3 winners) + A beats C (5x3) + B beats C (5x2)
    expect(tx).toHaveLength(6 + 15 + 10);
    expect(tx.every((t: any) => t.amount === 10)).toBe(true);
  });
});
