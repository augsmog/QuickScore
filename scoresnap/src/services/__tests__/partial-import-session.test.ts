import { PartialImportSession } from "../partial-import-session";
import type { PartialImportSessionContext } from "../partial-import-session";
import type { PartialImportInput } from "../partial-import";

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const ctx = (overrides: Partial<PartialImportSessionContext> = {}): PartialImportSessionContext => ({
  accountId: "acct-1",
  contestId: "contest-1",
  roundId: null,
  groupId: "group-1",
  ...overrides,
});

const input = (strokes: number): PartialImportInput => ({
  rows: [{
    name: "A", source: "ocr", matchedPlayerId: "a", requiredHoles: [1],
    scores: [strokes], confidence: [0.95], nameConfidence: 0.95,
  }],
  players: [{ id: "a", name: "A", scores: {} }],
  holeIdentities: [1],
  playedHoles: new Set([1]),
  coverage: "sparse",
});

const blockedInput: PartialImportInput = {
  rows: [{
    name: "A", source: "ocr", matchedPlayerId: "a", requiredHoles: [1],
    scores: [null], confidence: [0], nameConfidence: 0.95,
  }],
  players: [{ id: "a", name: "A", scores: {} }],
  holeIdentities: [1],
  playedHoles: new Set([1]),
  coverage: "sparse",
};

describe("PartialImportSession", () => {
  it("builds a draft via beginReview/completeReview", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    const state = session.completeReview(token, ctx(), input(4));
    expect(state).toMatchObject({ status: "draft" });
    if (state?.status === "draft") {
      expect(state.result).toMatchObject({ ok: true, patch: [{ playerId: "a", hole: 1, strokes: 4 }] });
    }
    expect(session.isCurrent(ctx())).toBe(true);
  });

  it("retains the draft across Back/Cancel (no account change)", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(4));
    // Simulate navigating away and back: nothing calls setAccount, so the draft survives.
    expect(session.getState()).toMatchObject({ status: "draft" });
    expect(session.isCurrent(ctx())).toBe(true);
  });

  it("clears the draft on account switch or sign-out", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(4));
    session.setAccount("acct-2");
    expect(session.getState()).toEqual({ status: "empty" });
    session.setAccount("acct-2");
    session.setAccount(null);
    expect(session.getState()).toEqual({ status: "empty" });
  });

  it("drops a stale reviewed-input delivery instead of resurrecting a superseded draft", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const staleToken = session.beginReview("acct-1", ctx());
    // A second review starts before the first (e.g. slow OCR) callback lands.
    const freshToken = session.beginReview("acct-1", ctx());
    session.completeReview(freshToken, ctx(), input(5));
    const staleDelivery = session.completeReview(staleToken, ctx(), input(4));
    expect(staleDelivery).toBeNull();
    const state = session.getState();
    expect(state).toMatchObject({ status: "draft", result: { ok: true, patch: [{ strokes: 5 }] } });

    // An account switch also supersedes any in-flight token.
    session.setAccount("acct-1"); // no-op, same account
    const token2 = session.beginReview("acct-1", ctx());
    session.setAccount("acct-2");
    const droppedAfterSwitch = session.completeReview(token2, ctx(), input(4));
    expect(droppedAfterSwitch).toBeNull();
    expect(session.getState()).toEqual({ status: "empty" });
  });

  it("rejects confirm against a stale context until the caller re-reviews", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(4));
    const applied: unknown[] = [];
    expect(() => session.confirm("acct-1", ctx({ groupId: "group-2" }), (patch) => applied.push(patch)))
      .toThrow(/stale/);
    expect(applied).toHaveLength(0);
    // Draft is left in place, not silently dropped -- re-review for the new context then confirm.
    expect(session.getState()).toMatchObject({ status: "draft" });
  });

  it("rejects confirm for a different account", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(4));
    expect(() => session.confirm("acct-2", ctx(), () => {})).toThrow(/different account/);
  });

  it("blocks confirm when the draft has unresolved blockers", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), blockedInput);
    const applied: unknown[] = [];
    expect(() => session.confirm("acct-1", ctx(), (patch) => applied.push(patch))).toThrow(/blockers/);
    expect(applied).toHaveLength(0);
    const state = session.getState();
    expect(state).toMatchObject({ status: "draft", result: { ok: false } });
    if (state.status === "draft" && !state.result.ok) {
      expect(state.result.blockers.length).toBeGreaterThan(0);
    }
  });

  it("confirms exactly once and applies the patch", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(4));
    const applied: unknown[] = [];
    const state = session.confirm("acct-1", ctx(), (patch) => applied.push(patch));
    expect(applied).toEqual([[{ playerId: "a", hole: 1, strokes: 4 }]]);
    expect(state).toMatchObject({ status: "confirmed", patch: [{ playerId: "a", hole: 1, strokes: 4 }] });
  });

  it("is idempotent: a repeated confirm/retry never re-applies the write", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(4));
    const applied: unknown[] = [];
    session.confirm("acct-1", ctx(), (patch) => applied.push(patch));
    const second = session.confirm("acct-1", ctx(), (patch) => applied.push(patch));
    const third = session.confirm("acct-1", ctx(), (patch) => applied.push(patch));
    expect(applied).toHaveLength(1);
    expect(second).toMatchObject({ status: "confirmed" });
    expect(third).toMatchObject({ status: "confirmed" });
  });

  it("throws confirm with no draft present", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    expect(() => session.confirm("acct-1", ctx(), () => {})).toThrow(/No reviewed draft/);
  });

  it("supports explicit discard, distinct from Back/Cancel", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(4));
    session.discard();
    expect(session.getState()).toEqual({ status: "empty" });
    // The token from before the discard must not resurrect anything either.
    const resurrect = session.completeReview(token, ctx(), input(4));
    expect(resurrect).toBeNull();
  });

  it("does not resurrect a confirmed state if apply itself clears the session via setAccount", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(4));
    const state = session.confirm("acct-1", ctx(), () => {
      session.setAccount("acct-2");
    });
    expect(state).toEqual({ status: "empty" });
    expect(session.getState()).toEqual({ status: "empty" });

    // Same for a sign-out (setAccount(null)) triggered from inside apply.
    session.setAccount("acct-1");
    const token2 = session.beginReview("acct-1", ctx());
    session.completeReview(token2, ctx(), input(4));
    const state2 = session.confirm("acct-1", ctx(), () => {
      session.setAccount(null);
    });
    expect(state2).toEqual({ status: "empty" });
  });

  it("rejects confirm if the caller mutates their context object after review", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    const token = session.beginReview("acct-1", ctx());
    const reviewed = ctx();
    session.completeReview(token, reviewed, input(4));
    const applied: unknown[] = [];

    reviewed.groupId = "changed";
    expect(() => session.confirm("acct-1", reviewed, (patch) => applied.push(patch))).toThrow(/stale/);
    expect(applied).toHaveLength(0);
    reviewed.groupId = "group-1";

    reviewed.roundId = "changed";
    expect(() => session.confirm("acct-1", reviewed, (patch) => applied.push(patch))).toThrow(/stale/);
    reviewed.roundId = null;

    reviewed.contestId = "changed";
    expect(() => session.confirm("acct-1", reviewed, (patch) => applied.push(patch))).toThrow(/stale/);
    reviewed.contestId = "contest-1";

    // With the context restored to the originally-reviewed values, confirm succeeds.
    const state = session.confirm("acct-1", reviewed, (patch) => applied.push(patch));
    expect(applied).toEqual([[{ playerId: "a", hole: 1, strokes: 4 }]]);
    expect(state).toMatchObject({ status: "confirmed" });
  });

  it("rejects beginReview for a mismatched account or context", () => {
    const session = new PartialImportSession();
    session.setAccount("acct-1");
    expect(() => session.beginReview("acct-2", ctx())).toThrow(/different account/);
    expect(() => session.beginReview("acct-1", ctx({ accountId: "acct-2" }))).toThrow(/does not match/);
  });
});
