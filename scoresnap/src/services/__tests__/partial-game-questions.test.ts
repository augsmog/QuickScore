import { outstandingGameQuestions, hasOutstandingGameHistory } from "../partial-game-questions";
import type { Course, AuxiliaryData } from "../../engine/types";

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const course = (pars: number[]): Course => ({
  name: "Test",
  holes: pars.map((par, i) => ({ num: i + 1, par, hcp: i + 1, yards: 400 })),
});

describe("outstandingGameQuestions", () => {
  it("asks about every active Tier 2 game on a played, non-par-3 hole with no answer yet", () => {
    const c = course([4, 4, 4]);
    const questions = outstandingGameQuestions(new Set([1]), ["wolf", "hammer"], c, {});
    expect(questions).toEqual([
      { hole: 1, game: "hammer" },
      { hole: 1, game: "wolf" },
    ]);
  });

  it("never asks about a hole nobody has played yet", () => {
    const c = course([4, 4, 4]);
    const questions = outstandingGameQuestions(new Set([1]), ["wolf"], c, {});
    expect(questions.every(q => q.hole === 1)).toBe(true);
    expect(questions.some(q => q.hole === 2 || q.hole === 3)).toBe(false);
  });

  it("never re-asks a game that already has a recorded answer, even a falsy one", () => {
    const c = course([4]);
    const auxiliary: AuxiliaryData = {
      wolf: { 1: { partnerId: null, isLoneWolf: true } },
      hammer: { 1: { hammered: false, hammerBy: "", accepted: false } },
    };
    const questions = outstandingGameQuestions(new Set([1]), ["wolf", "hammer"], c, auxiliary);
    expect(questions).toEqual([]);
  });

  it("only asks greenies on par-3 holes", () => {
    const c = course([3, 4]);
    const questions = outstandingGameQuestions(new Set([1, 2]), ["greenies"], c, {});
    expect(questions).toEqual([{ hole: 1, game: "greenies" }]);
  });

  it("ignores games the group does not have active", () => {
    const c = course([4]);
    const questions = outstandingGameQuestions(new Set([1]), ["snake"], c, {});
    expect(questions).toEqual([{ hole: 1, game: "snake" }]);
    expect(outstandingGameQuestions(new Set([1]), [], c, {})).toEqual([]);
  });

  it("handles a back-nine mid-round start without assuming hole 1", () => {
    const c = course(Array.from({ length: 18 }, () => 4));
    const questions = outstandingGameQuestions(new Set([10, 11]), ["wolf"], c, {});
    expect(questions).toEqual([
      { hole: 10, game: "wolf" },
      { hole: 11, game: "wolf" },
    ]);
  });

  it("sorts deterministically by hole then game", () => {
    const c = course([4, 4]);
    const questions = outstandingGameQuestions(new Set([1, 2]), ["wolf", "hammer"], c, {});
    expect(questions).toEqual([
      { hole: 1, game: "hammer" },
      { hole: 1, game: "wolf" },
      { hole: 2, game: "hammer" },
      { hole: 2, game: "wolf" },
    ]);
  });
});

describe("hasOutstandingGameHistory", () => {
  it("is false for an empty question list and true otherwise", () => {
    expect(hasOutstandingGameHistory([])).toBe(false);
    expect(hasOutstandingGameHistory([{ hole: 1, game: "wolf" }])).toBe(true);
  });
});
