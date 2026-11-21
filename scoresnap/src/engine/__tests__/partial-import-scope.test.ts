import {
  applyReviewedPartialImportToContest,
  calculateContestSettlement,
  confirmedPlayedHoles,
  planPartialImportGamesForScope,
  scopeKey,
} from "../contest-results";
import type { Course, Player } from "../types";
import type { Contest, RoundInfo } from "../../stores/contest-store";

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

// AUG-1396: the confirmed-played-hole scope recorded at the partial-import confirm boundary is
// explicit review input (never inferred as "every course hole"), and feeds question planning and
// settlement so incomplete imported game history stays visibly pending and can never falsely
// settle. These are the store-independent (pure) engine tests; account isolation itself is an
// existing property of the per-account AsyncStorage store (persisted-keys.ts), not this module.

// Hole 2 is a par 3, for the Greenies-style fixtures below; the rest are par 4s.
const COURSE: Course = {
  name: "Scope GC",
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: i === 1 ? 3 : 4, hcp: i + 1, yards: 150 })),
};

function player(id: string, scoresByHole: Record<number, number> = {}): Player {
  const scores = Array(18).fill(0);
  for (const [hole, strokes] of Object.entries(scoresByHole)) scores[Number(hole) - 1] = strokes;
  return { id, name: id, handicap: 0, scores, team: null };
}

function fourPlayers(scoresByHole: Record<number, number> = {}): Player[] {
  return ["a", "b", "c", "d"].map((id) => player(id, scoresByHole));
}

function makeContest(overrides: Partial<Contest> = {}, players: Player[] = fourPlayers()): Contest {
  return {
    id: "c1",
    name: "Contest",
    status: "active",
    createdAt: "",
    course: COURSE,
    betUnit: 1,
    hasTeams: false,
    games: ["wolf"],
    gameConfig: { rulesVersion: 1, inputRulesVersion: 1 },
    groups: [{ id: "g1", name: "G1", players }],
    ...overrides,
  };
}

describe("confirmedPlayedHoles", () => {
  it("is empty until a reviewed import confirms a scope, and never infers every course hole", () => {
    const contest = makeContest();
    expect(confirmedPlayedHoles(contest, undefined, "g1")).toEqual([]);
  });

  it("isolates by scopeKey(roundId, groupId): round/group pairs never see each other's scope", () => {
    const round1: RoundInfo = {
      id: "r1", number: 1, name: "R1", course: COURSE,
      groups: [{ id: "g1", name: "G1", players: fourPlayers() }, { id: "g2", name: "G2", players: fourPlayers() }],
    };
    const round2: RoundInfo = { id: "r2", number: 2, name: "R2", course: COURSE, groups: [{ id: "g3", name: "G3", players: fourPlayers() }] };
    let contest = makeContest({ isTournament: true, currentRound: 1, rounds: [round1, round2], groups: [] });
    contest = applyReviewedPartialImportToContest(contest, "r1", "g1", [], [1]);
    contest = applyReviewedPartialImportToContest(contest, "r1", "g2", [], [2]);
    expect(confirmedPlayedHoles(contest, "r1", "g1")).toEqual([1]);
    expect(confirmedPlayedHoles(contest, "r1", "g2")).toEqual([2]);
    expect(confirmedPlayedHoles(contest, "r2", "g3")).toEqual([]);
  });
});

describe("applyReviewedPartialImportToContest", () => {
  it("persists the confirmed scope from an empty (no-op) patch -- the hole identities are explicit review input, not derived from score changes", () => {
    const contest = makeContest();
    const updated = applyReviewedPartialImportToContest(contest, null, "g1", [], [1, 2]);
    expect(updated).not.toBe(contest);
    expect(confirmedPlayedHoles(updated, undefined, "g1")).toEqual([1, 2]);
    expect(updated.groups[0].players).toEqual(contest.groups[0].players);
  });

  it("merges (never replaces) the scope across repeated confirms for the same scopeKey", () => {
    let contest = makeContest();
    contest = applyReviewedPartialImportToContest(contest, null, "g1", [], [2]);
    contest = applyReviewedPartialImportToContest(contest, null, "g1", [{ playerId: "a", hole: 10, strokes: 4 }], [10]);
    expect(confirmedPlayedHoles(contest, undefined, "g1")).toEqual([2, 10]);
  });

  it("a repeated identical confirm (same patch, same scope) is a true no-op: same contest reference back", () => {
    const contest = makeContest();
    const once = applyReviewedPartialImportToContest(contest, null, "g1", [], [1]);
    const again = applyReviewedPartialImportToContest(once, null, "g1", [], [1]);
    expect(again).toBe(once);
  });

  it("rejects an empty or out-of-course played-hole scope instead of inferring every course hole", () => {
    const contest = makeContest();
    expect(() => applyReviewedPartialImportToContest(contest, null, "g1", [], [])).toThrow(/played holes must be explicitly reviewed/);
    expect(() => applyReviewedPartialImportToContest(contest, null, "g1", [], [19])).toThrow(/played holes must be explicitly reviewed/);
  });

  it("rejection atomicity: an invalid cell throws before any mutation, even with an otherwise-valid played-hole scope", () => {
    const contest = makeContest();
    const snapshot = JSON.parse(JSON.stringify(contest));
    expect(() => applyReviewedPartialImportToContest(contest, null, "g1", [{ playerId: "a", hole: 1, strokes: 999 }], [1]))
      .toThrow(/Invalid reviewed import cell/);
    expect(contest).toEqual(snapshot);
  });

  it("rejection atomicity: a score conflict throws without recording the played-hole scope either", () => {
    const contest = makeContest({}, fourPlayers({ 1: 4 }));
    expect(() => applyReviewedPartialImportToContest(contest, null, "g1", [{ playerId: "a", hole: 1, strokes: 5 }], [1]))
      .toThrow(/conflicts with an existing score/);
    expect(confirmedPlayedHoles(contest, undefined, "g1")).toEqual([]);
  });

  it("rejects a patch cell outside the explicitly reviewed played-hole scope, never inferring it from the patch", () => {
    const contest = makeContest();
    const snapshot = JSON.parse(JSON.stringify(contest));
    expect(() => applyReviewedPartialImportToContest(contest, null, "g1", [{ playerId: "a", hole: 10, strokes: 4 }], [2]))
      .toThrow(/outside the explicitly reviewed played-hole scope/);
    // Rejection atomicity: no mutation and no scope recorded either.
    expect(contest).toEqual(snapshot);
    expect(confirmedPlayedHoles(contest, undefined, "g1")).toEqual([]);
  });

  it("allows a patch cell already covered by a prior confirm's merged scope, not just this call's playedHoles", () => {
    let contest = makeContest();
    contest = applyReviewedPartialImportToContest(contest, null, "g1", [], [10]);
    contest = applyReviewedPartialImportToContest(contest, null, "g1", [{ playerId: "a", hole: 10, strokes: 4 }], [2]);
    expect(confirmedPlayedHoles(contest, undefined, "g1")).toEqual([2, 10]);
    expect(contest.groups[0].players.find(p => p.id === "a")!.scores[9]).toBe(4);
  });
});

describe("planPartialImportGamesForScope", () => {
  it("plans only the confirmed-played holes: score-only games are ready immediately, fact-dependent games stay pending until the fact is known, and a known fact is reused without re-asking", () => {
    let contest = makeContest({ games: ["stroke_play", "wolf"] }, fourPlayers({ 1: 4 }));
    contest = applyReviewedPartialImportToContest(contest, null, "g1", [], [1]);

    let plan = planPartialImportGamesForScope(contest, undefined, "g1", ["stroke_play", "wolf"]);
    expect(plan.find((s) => s.game === "stroke_play")).toMatchObject({ status: "ready", open: [] });
    expect(plan.find((s) => s.game === "wolf")).toMatchObject({ status: "pending" });
    expect(plan.find((s) => s.game === "wolf")!.open).toEqual([{ game: "wolf", kind: "wolf-partner", hole: 1 }]);

    // The wolf fact for hole 1 becomes known (as `updateAuxiliaryData` would record it) --
    // planning reuses it instead of asking again.
    contest = { ...contest, auxiliaryByScope: { [scopeKey(undefined, "g1")]: { wolf: { 1: { isLoneWolf: false, partnerId: "b" } } } } };
    plan = planPartialImportGamesForScope(contest, undefined, "g1", ["stroke_play", "wolf"]);
    expect(plan.find((s) => s.game === "wolf")).toMatchObject({ status: "ready", open: [] });
  });

  it("never plans a hole outside the confirmed-played scope, even when the course has more holes", () => {
    let contest = makeContest({ games: ["wolf"] });
    contest = applyReviewedPartialImportToContest(contest, null, "g1", [], [1, 2]);
    const plan = planPartialImportGamesForScope(contest, undefined, "g1", ["wolf"]);
    const holesAsked = plan.find((s) => s.game === "wolf")!.open.map((q) => q.hole);
    expect(holesAsked.sort()).toEqual([1, 2]);
  });

  it("rejects an unknown or missing tournament round instead of silently falling back to legacy/default groups", () => {
    const round1: RoundInfo = {
      id: "r1", number: 1, name: "R1", course: COURSE,
      groups: [{ id: "g1", name: "G1", players: fourPlayers({ 1: 4 }) }],
    };
    let contest = makeContest({ isTournament: true, currentRound: 1, rounds: [round1], games: ["wolf"], groups: [] });
    contest = applyReviewedPartialImportToContest(contest, "r1", "g1", [], [1]);
    // The active round's history is confirmed-pending; a missing/unknown roundId must never
    // fall back to contest.groups and silently report it as fully resolved (ready, open: []).
    expect(() => planPartialImportGamesForScope(contest, "missing-round", "g1", ["wolf"]))
      .toThrow(/Unknown or missing tournament round/);
    expect(() => planPartialImportGamesForScope(contest, undefined, "g1", ["wolf"]))
      .toThrow(/Unknown or missing tournament round/);
  });
});

describe("no false settlement", () => {
  it("stays pending while a confirmed-played hole's game fact is unknown, and clears once every hole's fact is known", () => {
    const ids = ["a", "b", "c", "d"];
    const fullRound = fourPlayers(Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, 4])));
    // The wolf rotates players[hole-1 % 4]; its partner must be a different player.
    const partnerFor = (hole: number) => ids[((hole - 1) % 4 + 1) % 4];
    const wolfFacts: Record<number, { isLoneWolf: boolean; partnerId: string | null }> = {};
    for (let hole = 1; hole <= 17; hole++) wolfFacts[hole] = { isLoneWolf: false, partnerId: partnerFor(hole) };

    let contest = makeContest({ games: ["wolf"], auxiliaryByScope: { [scopeKey(undefined, "g1")]: { wolf: { ...wolfFacts } } } }, fullRound);
    expect(calculateContestSettlement(contest, ["wolf"]).pending).toBe(true);

    wolfFacts[18] = { isLoneWolf: false, partnerId: partnerFor(18) };
    contest = { ...contest, auxiliaryByScope: { [scopeKey(undefined, "g1")]: { wolf: { ...wolfFacts } } } };
    expect(calculateContestSettlement(contest, ["wolf"]).pending).toBeFalsy();
  });
});
