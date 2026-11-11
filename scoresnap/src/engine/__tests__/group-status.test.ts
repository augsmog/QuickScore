import { groupStatus, holesPlayedOrder } from "../group-status";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const now = new Date("2026-11-10T20:00:00Z");

describe("group status", () => {
  it("counts a shotgun group from hole 10 in playing order", () => {
    expect(holesPlayedOrder(10)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(groupStatus({ scoredHoles: [10, 11, 12, 13, 14], startSlot: { hole: 10 }, lastScoreAt: now, now })).toEqual({ kind: "thru", n: 5 });
  });

  it("reports final after all 18 holes", () => {
    expect(groupStatus({ scoredHoles: Array.from({ length: 18 }, (_, i) => ((9 + i) % 18) + 1), startSlot: { hole: 10 }, lastScoreAt: now, now })).toEqual({ kind: "final" });
  });

  it("marks a group stale after 21 minutes and leaves a 19 minute group live", () => {
    const base = { scoredHoles: [1, 2, 3], startSlot: { hole: 1 }, now };
    expect(groupStatus({ ...base, lastScoreAt: new Date(now.getTime() - 21 * 60_000) })).toEqual({ kind: "stale", minutes: 21 });
    expect(groupStatus({ ...base, lastScoreAt: new Date(now.getTime() - 19 * 60_000) })).toEqual({ kind: "thru", n: 3 });
  });

  it("accepts doubled shotgun slots 7A and 7B and treats tee-time starts as hole 1", () => {
    expect(groupStatus({ scoredHoles: [7, 8], startSlot: { hole: 7, wave: "A" }, lastScoreAt: now, now })).toEqual({ kind: "thru", n: 2 });
    expect(groupStatus({ scoredHoles: [7, 8], startSlot: { hole: 7, wave: "B" }, lastScoreAt: now, now })).toEqual({ kind: "thru", n: 2 });
    expect(groupStatus({ scoredHoles: [1, 2], startType: "tee_times", startSlot: { hole: 10 }, lastScoreAt: now, now })).toEqual({ kind: "thru", n: 2 });
  });

  it("rejects invalid slots and reports a group with no scores as not started", () => {
    expect(() => groupStatus({ scoredHoles: [], startSlot: { hole: 0 }, lastScoreAt: null, now })).toThrow(RangeError);
    expect(() => groupStatus({ scoredHoles: [1], startSlot: { hole: 19 }, lastScoreAt: now, now })).toThrow(RangeError);
    expect(groupStatus({ scoredHoles: [], startSlot: { hole: 1 }, lastScoreAt: null, now })).toEqual({ kind: "not_started" });
  });
});
