import { recordPartialImportAnswer } from "../partial-import-answers";
import { planPartialImportGames } from "../partial-import-games";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const played = [10, 11];
const q = (kind: any, hole: number | null) => ({ game: "wolf" as const, kind, hole });

describe("partial-import answers (AUG-348h)", () => {
  it("records a wolf partner without mutating input aux", () => {
    const aux = { wolf: { 10: { partnerId: "a", isLoneWolf: false } } };
    const r = recordPartialImportAnswer(aux, q("wolf-partner", 11), { kind: "wolf-partner", partnerId: "b", isLoneWolf: false }, played);
    expect(r.ok).toBe(true);
    expect((r as any).aux.wolf[11].partnerId).toBe("b");
    expect((r as any).aux.wolf[10].partnerId).toBe("a");
    expect(aux.wolf[11 as keyof typeof aux.wolf]).toBeUndefined();
  });

  it("rejects wolf answer with no partner and not lone wolf", () => {
    const r = recordPartialImportAnswer({}, q("wolf-partner", 10), { kind: "wolf-partner", partnerId: null, isLoneWolf: false }, played);
    expect(r).toEqual({ ok: false, reason: "incomplete" });
  });

  it("rejects unplayed hole, kind mismatch and round-level questions", () => {
    expect(recordPartialImportAnswer({}, q("wolf-partner", 3), { kind: "wolf-partner", partnerId: "a", isLoneWolf: false }, played)).toEqual({ ok: false, reason: "not-played-hole" });
    expect(recordPartialImportAnswer({}, q("wolf-partner", 10), { kind: "snake-putters", playerIds: [] }, played)).toEqual({ ok: false, reason: "kind-mismatch" });
    expect(recordPartialImportAnswer({}, q("teams", null), { kind: "teams" as any } as any, played)).toEqual({ ok: false, reason: "round-level" });
  });

  it("hammer: explicit 'no hammer' is recorded only when answered; hammered needs hammerBy", () => {
    const hq = { game: "hammer" as const, kind: "hammer-decision" as const, hole: 10 };
    expect(recordPartialImportAnswer({}, hq, { kind: "hammer-decision", hammered: true, hammerBy: "", accepted: true }, played)).toEqual({ ok: false, reason: "incomplete" });
    const r: any = recordPartialImportAnswer({}, hq, { kind: "hammer-decision", hammered: false, hammerBy: "", accepted: true }, played);
    expect(r.aux.hammer[10]).toEqual({ hammered: false, hammerBy: "", accepted: false });
  });

  it("snake dedupes putters; greenie null (nobody) is a real answer", () => {
    const s: any = recordPartialImportAnswer({}, { game: "snake", kind: "snake-putters", hole: 10 }, { kind: "snake-putters", playerIds: ["a", "a", "b"] }, played);
    expect(s.aux.snake[10]).toEqual(["a", "b"]);
    const g: any = recordPartialImportAnswer({}, { game: "greenies", kind: "greenie-winner", hole: 10 }, { kind: "greenie-winner", playerId: null }, played);
    expect(g.aux.greenies[10]).toBeNull();
  });

  it("answering every open question moves the game from pending to ready", () => {
    const input = { games: ["bingo_bango_bongo" as const], playedHoles: played, parByHole: {}, playerIds: ["a", "b"] };
    let aux: any = {};
    let st = planPartialImportGames({ ...input, aux });
    expect(st[0].status).toBe("pending");
    for (const open of st[0].open) {
      const r: any = recordPartialImportAnswer(aux, open, { kind: "bbb-winners", bingo: "a", bango: "b", bongo: null }, played);
      aux = r.aux;
    }
    st = planPartialImportGames({ ...input, aux });
    expect(st[0].status).toBe("ready");
  });
});
