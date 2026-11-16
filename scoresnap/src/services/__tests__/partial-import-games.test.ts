import { planPartialImportGames, questionsForGame, canSettlePartialGame } from "../partial-import-games";
import type { PartialImportGameInput } from "../partial-import-games";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const base = (over: Partial<PartialImportGameInput> = {}): PartialImportGameInput => ({
  games: ["stroke_play"],
  playedHoles: [1, 2],
  parByHole: { 1: 4, 2: 3 },
  playerIds: ["a", "b", "c", "d"],
  ...over,
});

describe("partial-import games (AUG-348g)", () => {
  it("keeps malformed existing facts pending", () => {
    const s = planPartialImportGames(base({ games: ["wolf", "hammer", "snake", "bingo_bango_bongo"], playedHoles: [10], aux: {
      wolf: { 10: { isLoneWolf: false, partnerId: null } },
      hammer: { 10: { hammered: true, hammerBy: "", accepted: true } },
      snake: { 10: [""] }, bbb: { 10: { bingo: "a" } },
    } as any }));
    expect(s.every(x => x.status === "pending")).toBe(true);
  });
  it("never claims unsupported press history is ready", () => {
    const s = planPartialImportGames(base({ games: ["nassau_press"], playerIds: ["a", "b"] }));
    expect(s[0].open).toEqual([{ game: "nassau_press", kind: "press-history", hole: null }]);
    expect(canSettlePartialGame(s, "nassau_press")).toBe(false);
  });
  it("retains unknown-par shotgun holes absent from course metadata", () => {
    const input = base({ games: ["greenies"], playedHoles: [18, 10, 18], parByHole: { 10: 4 }, aux: { greenies: { 18: null } } });
    expect(planPartialImportGames(input)[0].status).toBe("ready");
    expect(questionsForGame("greenies", { ...input, aux: {} })).toEqual([{ game: "greenies", kind: "greenie-winner", hole: 18 }]);
  });
  it("score-only games are ready with no questions", () => {
    const s = planPartialImportGames(base({ games: ["stroke_play", "skins", "stableford"] }));
    expect(s.every(x => x.status === "ready" && x.open.length === 0)).toBe(true);
  });

  it("asks only about played holes (back-nine start, hole 10-11)", () => {
    const qs = questionsForGame("wolf", base({ playedHoles: [11, 10] }));
    expect(qs.map(x => x.hole)).toEqual([10, 11]);
    expect(qs.every(x => x.kind === "wolf-partner")).toBe(true);
  });

  it("unanswered hammer is pending, never assumed 'no hammer'", () => {
    const s = planPartialImportGames(base({ games: ["hammer"], playerIds: ["a", "b"] }));
    expect(s[0].status).toBe("pending");
    expect(canSettlePartialGame(s, "hammer")).toBe(false);
  });

  it("answers close questions; a false answer still counts as answered", () => {
    const s = planPartialImportGames(base({
      games: ["hammer", "snake"], playerIds: ["a", "b"],
      aux: { hammer: { 1: { hammered: false, hammerBy: "", accepted: false }, 2: { hammered: false, hammerBy: "", accepted: false } }, snake: { 1: [], 2: ["a"] } },
    }));
    expect(s.map(x => x.status)).toEqual(["ready", "ready"]);
  });

  it("partially answered game stays pending with the remaining hole", () => {
    const s = planPartialImportGames(base({ games: ["wolf"], aux: { wolf: { 1: { partnerId: "b", isLoneWolf: false } } } }));
    expect(s[0].open).toEqual([{ game: "wolf", kind: "wolf-partner", hole: 2 }]);
  });

  it("greenies only ask on par 3s, and ask when par is unknown", () => {
    expect(questionsForGame("greenies", base()).map(x => x.hole)).toEqual([2]);
    expect(questionsForGame("greenies", base({ parByHole: {} })).map(x => x.hole)).toEqual([1, 2]);
  });

  it("team games ask for teams once unless all players have teams", () => {
    expect(questionsForGame("vegas", base())).toEqual([{ game: "vegas", kind: "teams", hole: null }]);
    const teams = { a: "t1", b: "t1", c: "t2", d: "t2" };
    expect(questionsForGame("vegas", base({ teamByPlayer: teams }))).toEqual([]);
    expect(questionsForGame("vegas", base({ teamByPlayer: { ...teams, d: null } })).length).toBe(1);
  });

  it("nassau 2-player needs no teams; 4-player does", () => {
    expect(questionsForGame("nassau", base({ playerIds: ["a", "b"] }))).toEqual([]);
    expect(questionsForGame("nassau", base()).map(x => x.kind)).toEqual(["teams"]);
  });

  it("bbb and duplicates: dedupes games and holes", () => {
    const s = planPartialImportGames(base({ games: ["bingo_bango_bongo", "bingo_bango_bongo"], playedHoles: [1, 1] }));
    expect(s.length).toBe(1);
    expect(s[0].open.length).toBe(1);
  });

  it("unknown game is not settleable", () => {
    expect(canSettlePartialGame([], "wolf")).toBe(false);
  });
});
