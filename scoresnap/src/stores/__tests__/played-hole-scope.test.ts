import { useContestStore } from "../contest-store";
import type { Contest } from "../contest-store";
import type { Course, GameType } from "../../engine/types";
import { calculateContestSettlement } from "../../engine/contest-results";
import { planContestPartialHistory } from "../../services/partial-import-history";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const beforeEach: (fn: () => void) => void;
declare const expect: any;

const course: Course = { name: "C", holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 })) };
const players = (p: string) => [
  { id: `${p}a`, name: `${p}A`, handicap: 0, scores: Array(18).fill(0) },
  { id: `${p}b`, name: `${p}B`, handicap: 0, scores: Array(18).fill(0) },
];
const make = (games: GameType[], over: Partial<Contest> = {}): Contest => ({
  id: "c1", name: "C", course, status: "active", betUnit: 1, hasTeams: false, games, createdAt: "",
  groups: [{ id: "g1", name: "G1", players: players("x") }, { id: "g2", name: "G2", players: players("y") }],
  gameConfig: { rulesVersion: 1 } as any, ...over,
});
const cell = (playerId: string, hole: number, strokes = 4) => ({ playerId, hole, strokes });
const store = () => useContestStore.getState();
const get = () => store().contests.find(c => c.id === "c1")!;
const load = (c: Contest) => useContestStore.setState({ contests: [c], activeContestId: c.id });

describe("AUG-1396 played-hole scope", () => {
  beforeEach(() => load(make(["skins"])));

  it("retains the reviewed scope per group and isolates groups", () => {
    store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3), cell("xb", 3)], [3, 4]);
    expect(get().playedHolesByScope).toEqual({ "default/g1": [3, 4] });
    expect(get().playedHolesByScope?.["default/g2"]).toBeUndefined();
  });

  it("retains scope on an identical/no-op patch without touching scores", () => {
    store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)], [3]);
    const before = get().groups;
    store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)], [3, 5]);
    expect(get().groups).toBe(before);
    expect(get().playedHolesByScope?.["default/g1"]).toEqual([3, 5]);
  });

  it("rejects atomically: bad scope or out-of-scope cell changes nothing", () => {
    const snapshot = get();
    expect(() => store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)], [4])).toThrow();
    expect(() => store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)], [3, 99])).toThrow();
    expect(() => store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)], [])).toThrow();
    expect(() => store().applyReviewedPartialImport("c1", null, "g1", [cell("zz", 3)], [3])).toThrow();
    expect(get()).toBe(snapshot);
  });

  it("does not infer scope when none is supplied", () => {
    store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)]);
    expect(get().playedHolesByScope).toBeUndefined();
  });

  it("isolates rounds in a tournament", () => {
    const r = (id: string, number: number) => ({ id, number, name: id, course, groups: [{ id: "g1", name: "G", players: players(id) }] });
    load(make(["skins"], { isTournament: true, currentRound: 1, rounds: [r("r1", 1), r("r2", 2)] }));
    store().applyReviewedPartialImport("c1", "r1", "g1", [cell("r1a", 2)], [2]);
    expect(get().playedHolesByScope).toEqual({ "r1/g1": [2] });
  });

  it("score-only games are ready; missing facts stay pending and block settlement", () => {
    load(make(["skins", "wolf"]));
    store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)], [3]);
    const [scope] = planContestPartialHistory(get());
    expect(scope.states.find(s => s.game === "skins")?.status).toBe("ready");
    expect(scope.states.find(s => s.game === "wolf")?.status).toBe("pending");
    expect(scope.pending).toBe(true);
    expect(calculateContestSettlement(get())).toMatchObject({ pending: true, transactions: [] });
  });

  it("reuses known facts and is ready once every fact is answered", () => {
    load(make(["wolf"]));
    store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)], [3]);
    store().updateAuxiliaryData("c1", "wolf", 3, { isLoneWolf: true, partnerId: null }, "g1");
    const [scope] = planContestPartialHistory(get());
    expect(scope.pending).toBe(false);
    expect(scope.openCount).toBe(0);
  });

  it("a score-only contest has no pending history", () => {
    store().applyReviewedPartialImport("c1", null, "g1", [cell("xa", 3)], [3]);
    expect(planContestPartialHistory(get())[0].pending).toBe(false);
  });
});
