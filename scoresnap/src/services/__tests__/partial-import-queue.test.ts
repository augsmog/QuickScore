import { planPartialImportGames } from "../partial-import-games";
import { nextOpenQuestion, orderedOpenQuestions, partialImportGate } from "../partial-import-queue";
import { recordPartialImportAnswer } from "../partial-import-answers";

const base = { playedHoles: [3, 1], parByHole: { 1: 4, 3: 4 }, playerIds: ["a", "b"] };

describe("partial-import-queue", () => {
  it("empty plan is ready with no next question", () => {
    const g = partialImportGate([]);
    expect(g).toEqual({ allReady: true, openCount: 0, settleable: [] });
    expect(nextOpenQuestion([])).toBeNull();
  });
  it("orders by hole then game, and blocks pending games", () => {
    const s = planPartialImportGames({ ...base, games: ["wolf", "hammer", "skins"] });
    const q = orderedOpenQuestions(s).map(x => `${x.hole}:${x.kind}`);
    expect(q).toEqual(["1:wolf-partner", "1:hammer-decision", "3:wolf-partner", "3:hammer-decision"]);
    expect(partialImportGate(s)).toEqual({ allReady: false, openCount: 4, settleable: ["skins"] });
  });
  it("answering the head question advances the queue and never invents answers", () => {
    let s = planPartialImportGames({ ...base, games: ["wolf"] });
    const head = nextOpenQuestion(s)!;
    const r = recordPartialImportAnswer(undefined, head, { kind: "wolf-partner", partnerId: null, isLoneWolf: false }, base.playedHoles);
    expect(r.ok).toBe(false);
    expect(nextOpenQuestion(s)).toEqual(head);
    const ok = recordPartialImportAnswer(undefined, head, { kind: "wolf-partner", partnerId: "b", isLoneWolf: false }, base.playedHoles);
    if (!ok.ok) throw new Error("expected ok");
    s = planPartialImportGames({ ...base, games: ["wolf"], aux: ok.aux });
    expect(nextOpenQuestion(s)?.hole).toBe(3);
  });
  it("team question comes first", () => {
    const s = planPartialImportGames({ ...base, games: ["wolf", "best_ball"] });
    expect(nextOpenQuestion(s)).toMatchObject({ kind: "teams", hole: null });
  });
});
