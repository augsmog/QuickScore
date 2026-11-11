import { calcBestBall } from "../calculators/best-ball";
import { assignFlights } from "../flights";
import { teamStandings } from "../team-standings";
import type { Course, Player } from "../types";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const course: Course = {
  name: "Test course",
  holes: Array.from({ length: 18 }, (_, index) => ({ num: index + 1, par: 4, hcp: index + 1, yards: 350 })),
};
const player = (id: string, scores: number[], handicap = 0): Player => ({ id, name: id, handicap, scores });
const full = (score: number) => Array(18).fill(score);

describe("teamStandings", () => {
  it("matches calcBestBall for full 18-hole gross best ball and sorts shared ranks", () => {
    const teams = [
      { name: "Zulu", players: [player("z1", full(5)), player("z2", full(4))] },
      { name: "Alpha", players: [player("a1", full(4)), player("a2", full(5))] },
      { name: "Ahead", players: [player("x1", full(3)), player("x2", full(6))] },
    ];
    const rows = teamStandings(teams, course, { countBest: 1, net: false }) as any[];
    const old = calcBestBall(teams, course);
    expect(rows.map(({ name, total }) => ({ name, total })).sort((a, b) => a.name.localeCompare(b.name))).toEqual(
      old.map(({ name, total }) => ({ name, total })).sort((a, b) => a.name.localeCompare(b.name)),
    );
    expect(rows.map(({ name, rank, tied }) => ({ name, rank, tied }))).toEqual([
      { name: "Ahead", rank: 1, tied: false },
      { name: "Alpha", rank: 2, tied: true },
      { name: "Zulu", rank: 2, tied: true },
    ]);
  });

  it("uses each player's allocated net strokes for best N, including a plus handicap", () => {
    const teams = [{ name: "Pair", players: [player("plus", full(5), -1), player("even", full(5)), player("high", full(8)), player("other", full(9))] }];
    const rows = teamStandings(teams, course, { countBest: 2, net: true }) as any[];
    // On SI 1 the plus player receives -1 (one stroke added); the even player is the second count.
    expect(rows[0].total).toBe(18 * 10 + 1);
    expect(rows[0].holesPlayed).toBe(18);
    expect(rows[0].toPar).toBe(18 * 2 + 1);
  });

  it("leaves a hole unplayed when fewer than N players have entered a score", () => {
    const partial = full(5);
    partial[3] = 0;
    const teams = [{ name: "Pair", players: [player("one", full(4)), player("two", partial)] }];
    const rows = teamStandings(teams, course, { countBest: 2, net: false }) as any[];
    expect(rows[0]).toMatchObject({ holesPlayed: 17, total: 17 * 9, toPar: 17 * 1, rank: 1, tied: false });
  });

  it("returns unavailable instead of estimating net on a 9-hole course", () => {
    const nine = { ...course, holes: course.holes.slice(0, 9) };
    expect(teamStandings([{ name: "Pair", players: [player("one", full(4))] }], nine, { countBest: 1, net: true })).toBe("unavailable");
  });

  it("composes with assignFlights so each flight has an independent rank set", () => {
    const players = [player("a1", full(4)), player("a2", full(5)), player("b1", full(5)), player("b2", full(6))];
    const teams = [
      { name: "A", players: players.slice(0, 2) },
      { name: "B", players: players.slice(2) },
    ];
    const flights = assignFlights(players, { mode: "manual", assignments: { a1: "Flight A", a2: "Flight A", b1: "Flight B", b2: "Flight B" } });
    const local = flights.map((flight) => teamStandings(teams.filter((team) => team.players.every((p) => flight.players.includes(p))), course, { countBest: 1, net: false }));
    expect((local[0] as any[]).map((row) => row.rank)).toEqual([1]);
    expect((local[1] as any[]).map((row) => row.rank)).toEqual([1]);
  });

  it("rejects countBest outside every team's player count", () => {
    expect(() => teamStandings([{ name: "Solo", players: [player("one", full(4))] }], course, { countBest: 2, net: false })).toThrow(/countBest/);
  });
});
