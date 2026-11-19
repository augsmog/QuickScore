import { PartialImportSession } from "../partial-import-session";
import type { PartialImportSessionContext } from "../partial-import-session";
import type { PartialImportCell, PartialImportInput } from "../partial-import";
import { confirmPartialImportToStore, nextHoleToScore } from "../partial-import-confirm";

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const ctx = (overrides: Partial<PartialImportSessionContext> = {}): PartialImportSessionContext => ({
  accountId: "acct-1",
  contestId: "contest-1",
  roundId: "round-1",
  groupId: "group-1",
  ...overrides,
});

const input = (strokes: number | null, confidence = 0.95): PartialImportInput => ({
  rows: [{
    name: "A", source: "ocr", matchedPlayerId: "a", requiredHoles: [10],
    scores: [strokes], confidence: [confidence], nameConfidence: 0.95,
  }],
  players: [{ id: "a", name: "A", scores: {} }],
  holeIdentities: [10],
  playedHoles: new Set([10]),
  coverage: "sparse",
});

function draftSession(strokes: number | null = 4, confidence = 0.95): PartialImportSession {
  const session = new PartialImportSession();
  session.setAccount("acct-1");
  const token = session.beginReview("acct-1", ctx());
  session.completeReview(token, ctx(), input(strokes, confidence));
  return session;
}

function recordingStore(fail?: string) {
  const calls: Array<[string, string | null, string, readonly PartialImportCell[], readonly number[] | undefined]> = [];
  return {
    calls,
    applyReviewedPartialImport(contestId: string, roundId: string | null, groupId: string, patch: readonly PartialImportCell[], playedHoles?: readonly number[]) {
      calls.push([contestId, roundId, groupId, patch, playedHoles]);
      if (fail) throw new Error(fail);
    },
  };
}

describe("confirmPartialImportToStore", () => {
  it("writes the reviewed patch once to the store with the draft's exact context", () => {
    const session = draftSession();
    const store = recordingStore();
    const outcome = confirmPartialImportToStore(session, "acct-1", ctx(), store);
    expect(outcome).toEqual({ ok: true, patch: [{ playerId: "a", hole: 10, strokes: 4 }] });
    expect(store.calls).toEqual([["contest-1", "round-1", "group-1", [{ playerId: "a", hole: 10, strokes: 4 }], [10]]]);
    expect(session.getState().status).toBe("confirmed");
  });

  it("a repeated confirm does not write twice", () => {
    const session = draftSession();
    const store = recordingStore();
    confirmPartialImportToStore(session, "acct-1", ctx(), store);
    const again = confirmPartialImportToStore(session, "acct-1", ctx(), store);
    expect(again.ok).toBe(true);
    expect(store.calls).toHaveLength(1);
  });

  it("a store rejection keeps the draft, reports the reason and asks for a fresh review", () => {
    const session = draftSession();
    const store = recordingStore("Reviewed import conflicts with an existing score");
    const outcome = confirmPartialImportToStore(session, "acct-1", ctx(), store);
    expect(outcome).toEqual({ ok: false, error: "Reviewed import conflicts with an existing score", needsReReview: true });
    expect(session.getState().status).toBe("draft");
  });

  it("retrying the same rejected draft never calls the store again, and a fresh review can confirm", () => {
    const session = draftSession();
    const failing = recordingStore("Reviewed import round is no longer active");
    confirmPartialImportToStore(session, "acct-1", ctx(), failing);
    const retry = confirmPartialImportToStore(session, "acct-1", ctx(), failing);
    expect(retry).toMatchObject({ ok: false, needsReReview: true });
    expect(failing.calls).toHaveLength(1);

    const token = session.beginReview("acct-1", ctx());
    session.completeReview(token, ctx(), input(5));
    const ok = recordingStore();
    expect(confirmPartialImportToStore(session, "acct-1", ctx(), ok)).toEqual({ ok: true, patch: [{ playerId: "a", hole: 10, strokes: 5 }] });
    expect(ok.calls).toHaveLength(1);
  });

  it("a stale context is refused without touching the store", () => {
    const session = draftSession();
    const store = recordingStore();
    const outcome = confirmPartialImportToStore(session, "acct-1", ctx({ groupId: "other-group" }), store);
    expect(outcome).toMatchObject({ ok: false, needsReReview: true });
    expect(store.calls).toHaveLength(0);
  });

  it("a blocked draft (low-confidence read) is refused without touching the store", () => {
    const session = draftSession(4, 0.2);
    const store = recordingStore();
    const outcome = confirmPartialImportToStore(session, "acct-1", ctx(), store);
    expect(outcome).toMatchObject({ ok: false, error: "Cannot confirm a draft with unresolved blockers" });
    expect(store.calls).toHaveLength(0);
  });

  it("another account cannot confirm the draft", () => {
    const session = draftSession();
    const store = recordingStore();
    const outcome = confirmPartialImportToStore(session, "acct-2", ctx({ accountId: "acct-2" }), store);
    expect(outcome.ok).toBe(false);
    expect(store.calls).toHaveLength(0);
    expect(session.getState().status).toBe("draft");
  });
});

describe("nextHoleToScore", () => {
  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const cells = (ids: string[], holes: number[]) => ids.flatMap((playerId) => holes.map((hole) => ({ playerId, hole })));

  it("resumes on hole 3 after two holes for every player", () => {
    expect(nextHoleToScore(front, ["a", "b", "c", "d"], cells(["a", "b", "c", "d"], [1, 2]))).toBe(3);
  });

  it("stops on a hole any player is still missing, even if later holes are scored", () => {
    const scored = [...cells(["a", "b"], [1, 2]), { playerId: "a", hole: 3 }];
    expect(nextHoleToScore(front, ["a", "b"], scored)).toBe(3);
  });

  it("follows a back-nine start order instead of assuming hole 1", () => {
    const order = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(nextHoleToScore(order, ["a"], cells(["a"], [10, 11, 12]))).toBe(13);
    expect(nextHoleToScore(order, ["a"], cells(["a"], [10, 11, 12, 13, 14, 15, 16, 17, 18]))).toBe(1);
  });

  it("returns null when every hole is scored, and the first hole with no players", () => {
    expect(nextHoleToScore(front, ["a"], cells(["a"], front))).toBeNull();
    expect(nextHoleToScore([10, 11], [], [])).toBe(10);
  });
});
