import { planPartialReview, togglePlayedHole } from "../partial-review";
import type { ScannedPlayer } from "../score-parser";

const row = (name: string, scores: (number | null)[], conf = 0.95): ScannedPlayer => ({
  name, nameConfidence: 1, scores, confidence: scores.map(() => conf), matchedPlayerId: null,
} as unknown as ScannedPlayer);
const holes = Array.from({ length: 18 }, (_, i) => i + 1);
const target = (id: string, name: string, scores: Record<number, number> = {}) => ({ id, name, scores });
const full = (n: number) => Array.from({ length: 18 }, (_, i) => (i < 3 ? n : null));

describe("partial-review", () => {
  it("toggles holes immutably", () => {
    const a = new Set<number>([1]);
    const b = togglePlayedHole(a, 2);
    expect([...a]).toEqual([1]);
    expect([...b].sort()).toEqual([1, 2]);
    expect([...togglePlayedHole(b, 1)]).toEqual([2]);
  });
  it("plans an importable sparse patch", () => {
    const p = planPartialReview([row("Amy", full(4))], [target("a", "Amy"), target("b", "Bo")], holes, new Set([1, 2, 3]));
    expect(p.result.ok).toBe(true);
    expect(p.result.ok && p.result.patch).toHaveLength(3);
    expect(p.summary).toBe("3 scores across 3 holes ready to import");
  });
  it("blocks when no holes selected", () => {
    const p = planPartialReview([row("Amy", full(4))], [target("a", "Amy")], holes, new Set());
    expect(p.result.ok).toBe(false);
    expect(p.summary).toMatch(/issue/);
  });
  it("blocks on low confidence and conflicts", () => {
    expect(planPartialReview([row("Amy", full(4), 0.5)], [target("a", "Amy")], holes, new Set([1])).result.ok).toBe(false);
    expect(planPartialReview([row("Amy", full(4))], [target("a", "Amy", { 1: 5 })], holes, new Set([1])).result.ok).toBe(false);
  });
});
