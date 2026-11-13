import { computeFieldPot } from "../field-pot";
import type { GameConfig } from "../types";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const ranks = (r: number[]) => r.map((rank, i) => ({ playerId: `p${i + 1}`, rank }));
const cfg = (potEntryFee?: number): GameConfig => ({ potEntryFee });
const NONE = { total: 0, winners: [], perWinner: 0, remainderCents: 0 };

describe("computeFieldPot", () => {
  it("single winner takes the whole pot", () => {
    const r = computeFieldPot({ game: "stroke_play", config: cfg(10), eligiblePlayerIds: ids(4), standings: ranks([2, 1, 3, 4]) });
    expect(r).toEqual({ total: 4000, winners: ["p2"], perWinner: 4000, remainderCents: 0 });
  });
  it("two-way tie splits evenly", () => {
    const r = computeFieldPot({ game: "stableford", config: cfg(10), eligiblePlayerIds: ids(4), standings: ranks([1, 1, 3, 4]) });
    expect(r).toEqual({ total: 4000, winners: ["p1", "p2"], perWinner: 2000, remainderCents: 0 });
  });
  it("three-way tie splits evenly", () => {
    const r = computeFieldPot({ game: "stroke_play", config: cfg(15), eligiblePlayerIds: ids(6), standings: ranks([1, 1, 1, 4, 5, 6]) });
    expect(r).toEqual({ total: 9000, winners: ["p1", "p2", "p3"], perWinner: 3000, remainderCents: 0 });
  });
  it("uneven-cent split reports remainder", () => {
    const r = computeFieldPot({ game: "stroke_play", config: cfg(0.1), eligiblePlayerIds: ids(5), standings: ranks([1, 1, 1, 4, 5]) });
    expect(r.total).toBe(50);
    expect(r.perWinner).toBe(16);
    expect(r.remainderCents).toBe(2);
    expect(r.perWinner * r.winners.length + r.remainderCents).toBe(r.total);
  });
  it("group-scope game has no pot", () => {
    expect(computeFieldPot({ game: "nassau", config: cfg(10), eligiblePlayerIds: ids(4), standings: ranks([1, 2, 3, 4]) })).toEqual(NONE);
  });
  it("group-scoped skins has no pot", () => {
    expect(computeFieldPot({ game: "skins", config: { potEntryFee: 10, skinsScope: "group" }, eligiblePlayerIds: ids(4), standings: ranks([1, 2, 3, 4]) })).toEqual(NONE);
  });
  it("missing fee has no pot", () => {
    expect(computeFieldPot({ game: "stroke_play", config: cfg(undefined), eligiblePlayerIds: ids(4), standings: ranks([1, 2, 3, 4]) })).toEqual(NONE);
    expect(computeFieldPot({ game: "stroke_play", eligiblePlayerIds: ids(4), standings: ranks([1, 2, 3, 4]) })).toEqual(NONE);
  });
  it("zero fee has no pot", () => {
    expect(computeFieldPot({ game: "stroke_play", config: cfg(0), eligiblePlayerIds: ids(4), standings: ranks([1, 2, 3, 4]) })).toEqual(NONE);
  });
  it("empty pool has no pot", () => {
    expect(computeFieldPot({ game: "stroke_play", config: cfg(10), eligiblePlayerIds: [], standings: [] })).toEqual(NONE);
  });
  it("ignores non-eligible players when finding winners", () => {
    const r = computeFieldPot({ game: "stroke_play", config: cfg(10), eligiblePlayerIds: ["p2", "p3"], standings: ranks([1, 2, 3]) });
    expect(r).toEqual({ total: 2000, winners: ["p2"], perWinner: 2000, remainderCents: 0 });
  });
  it("isolates no-pot winners arrays across calls and return paths", () => {
    const input = { game: "stroke_play" as const, config: cfg(0), eligiblePlayerIds: ids(2), standings: ranks([1, 2]) };
    const first = computeFieldPot(input);
    first.winners.push("injected");
    const later = [
      computeFieldPot(input),
      computeFieldPot({ ...input, config: undefined }),
      computeFieldPot({ ...input, game: "nassau", config: cfg(10) }),
      computeFieldPot({ ...input, config: cfg(10), eligiblePlayerIds: [] }),
    ];
    for (const result of later) {
      expect(result).toEqual(NONE);
      expect(result.winners).not.toBe(first.winners);
    }
  });
  it("no ranked eligible standings keeps the pot as remainder", () => {
    const r = computeFieldPot({ game: "stroke_play", config: cfg(10), eligiblePlayerIds: ids(2), standings: [] });
    expect(r).toEqual({ total: 2000, winners: [], perWinner: 0, remainderCents: 2000 });
  });
});
