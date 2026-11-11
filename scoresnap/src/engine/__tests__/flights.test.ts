import { assignFlights, flightStandings } from "../flights";
import type { Player, StrokePlayResult } from "../types";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const player = (id: string, handicap: number): Player => ({ id, name: id, handicap, scores: [4] });
const result = (id: string, total: number): StrokePlayResult => ({
  playerId: id, name: id, front: total, back: 0, total, toPar: 0,
});

describe("flights", () => {
  it("assigns inclusive boundaries, plus handicaps, and catches handicaps above the last maximum", () => {
    const players = [player("plus", -2), player("edge", 10), player("high", 28)];
    expect(assignFlights(players, {
      mode: "bands",
      bands: [{ name: "A", maxHandicap: 10 }, { name: "B", maxHandicap: 20 }],
    })).toEqual([
      { name: "A", players: [players[0], players[1]] },
      { name: "B", players: [players[2]] },
    ]);
  });

  it("keeps manual flight order and routes missing assignments to fallback", () => {
    const players = [player("a", 1), player("b", 2), player("c", 3)];
    expect(assignFlights(players, {
      mode: "manual", assignments: { a: "Blue", b: "Gold" }, fallback: "Other",
    })).toEqual([
      { name: "Blue", players: [players[0]] },
      { name: "Gold", players: [players[1]] },
      { name: "Other", players: [players[2]] },
    ]);
    expect(assignFlights([players[0]], {
      mode: "manual", assignments: { a: "Blue" }, fallback: "Other",
    })).toEqual([{ name: "Blue", players: [players[0]] }]);
    expect(assignFlights([players[0]], {
      mode: "manual", assignments: { a: "Blue" },
    })).toEqual([{ name: "Blue", players: [players[0]] }]);
  });

  it("restarts ranks within each flight, isolates ties, and keeps empty bands", () => {
    const players = [player("a", 1), player("b", 2), player("c", 15)];
    const rows = flightStandings(
      [result("a", 70), result("b", 70), result("c", 71)],
      players,
      { mode: "bands", bands: [
        { name: "Low", maxHandicap: 5 },
        { name: "High", maxHandicap: 20 },
        { name: "Empty", maxHandicap: 30 },
      ] },
      { holeCount: 1 },
    );
    expect(rows).toEqual([
      { name: "Low", standings: [
        expect.objectContaining({ playerId: "a", rank: 1, tied: true, rankLabel: "T1" }),
        expect.objectContaining({ playerId: "b", rank: 1, tied: true, rankLabel: "T1" }),
      ] },
      { name: "High", standings: [expect.objectContaining({ playerId: "c", rank: 1 })] },
      { name: "Empty", standings: [] },
    ]);
  });

  it("rejects empty, duplicate, and unsorted band rules", () => {
    expect(() => assignFlights([], { mode: "bands", bands: [] })).toThrow(/at least one/i);
    expect(() => assignFlights([], { mode: "bands", bands: [
      { name: "A", maxHandicap: 5 }, { name: "A", maxHandicap: 10 },
    ] })).toThrow(/duplicate/i);
    expect(() => assignFlights([], { mode: "bands", bands: [
      { name: "A", maxHandicap: 10 }, { name: "B", maxHandicap: 5 },
    ] })).toThrow(/sorted/i);
  });
});
