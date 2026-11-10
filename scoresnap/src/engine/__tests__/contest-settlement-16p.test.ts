import { calculateContestSettlement } from "../contest-results";
import type { Course, Player } from "../types";
import type { Contest, ContestGroup, RoundInfo } from "../../stores/contest-store";
import "./contest-settlement-multiround.test";

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: any;

// AUG-278b (TD readiness G4): `settlement.tsx` + `calculateContestSettlement` are
// unit-tested piecemeal, but nothing asserted end-to-end that a multi-GROUP
// tournament can actually be SETTLED to a non-empty, conserving ledger. This
// focused Jest closes G4 on the model side: it builds a 16-player field split
// across 4 groups, runs it through `calculateContestSettlement`, and asserts the
// ledger is non-empty, carries per-player amounts, and conserves money (every
// dollar paid is a dollar received). It is the deterministic complement to the
// 16-player E2E settle-gate assertions (free gate / paid screen) in
// `scoresnap/e2e/tournament-16-player.mjs`. No UI, no pricing, no outreach.

const COURSE: Course = {
  name: "TD Readiness GC",
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 380 })),
};

// An 18-hole card of all-par-4 strokes that sums exactly to `total` (>= 18),
// spread one stroke at a time so every hole stays a legal score.
function cardTo(total: number): number[] {
  const scores = Array(18).fill(4); // 72
  let delta = total - 72;
  let i = 0;
  while (delta !== 0) {
    if (delta > 0) {
      scores[i % 18] += 1;
      delta -= 1;
    } else if (scores[i % 18] > 1) {
      scores[i % 18] -= 1;
      delta += 1;
    }
    i += 1;
  }
  return scores;
}

function makePlayer(id: string, name: string, total: number): Player {
  return { id, name, handicap: 0, scores: cardTo(total), team: null };
}

// 16 players, distinct gross totals 68..83 so stroke play produces a strict
// order (a clear low winner and a clear high loser), split 4/4/4/4 across groups.
function buildField(): ContestGroup[] {
  const totals = [68, 70, 71, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 72, 69];
  const players = totals.map((t, i) => makePlayer(`p${i}`, `P${i + 1}`, t));
  return [0, 1, 2, 3].map((g) => ({
    id: `g${g + 1}`,
    name: `Group ${g + 1}`,
    players: players.slice(g * 4, g * 4 + 4),
  }));
}

function baseContest(groups: ContestGroup[], overrides: Partial<Contest> = {}): Contest {
  return {
    id: "c-16p",
    name: "16-Player Tournament",
    course: COURSE,
    status: "active",
    betUnit: 5,
    hasTeams: false,
    groups,
    games: ["stroke_play"],
    createdAt: "2026-11-09T00:00:00.000Z",
    ...overrides,
  };
}

function sum(amounts: number[]): number {
  return amounts.reduce((a, b) => a + b, 0);
}

describe("calculateContestSettlement settles a multi-group 16-player field (AUG-278b G4)", () => {
  test("single-field (4 groups): non-empty ledger, per-player amounts, money conserves", () => {
    const groups = buildField();
    const contest = baseContest(groups);
    const settlement = calculateContestSettlement(contest);

    expect(settlement.pending).toBeFalsy();
    // A real multi-group settle must produce at least one transaction.
    expect(Array.isArray(settlement.transactions)).toBe(true);
    expect(settlement.transactions.length).toBeGreaterThan(0);

    // Every transaction moves a positive amount between two distinct, real players.
    const names = new Set(groups.flatMap((g) => g.players.map((p) => p.name)));
    for (const t of settlement.transactions) {
      expect(t.amount).toBeGreaterThan(0);
      expect(t.from).not.toBe(t.to);
      expect(names.has(t.from) && names.has(t.to)).toBe(true);
    }

    // All 16 players appear in the net ledger and the field conserves money.
    expect(Object.keys(settlement.netByPlayer).sort()).toEqual([...names].sort());
    expect(Math.round(sum(Object.values(settlement.netByPlayer)) * 100) / 100).toBe(0);

    // Non-empty per-player amounts: the strict stroke order means the low card
    // wins money and the high card loses money (not an all-even push).
    expect(settlement.netByPlayer["P1"]).toBeGreaterThan(0); // 68, lowest
    expect(settlement.netByPlayer["P14"]).toBeLessThan(0); // 83, highest
    expect(Object.values(settlement.netByPlayer).some((n) => n !== 0)).toBe(true);

    // The ledger reconciles with the transactions it was built from.
    const netFromTx: Record<string, number> = Object.fromEntries([...names].map((n) => [n, 0]));
    for (const t of settlement.transactions) {
      netFromTx[t.to] += t.amount;
      netFromTx[t.from] -= t.amount;
    }
    for (const name of names) {
      expect(Math.round(netFromTx[name] * 100) / 100).toBe(settlement.netByPlayer[name]);
    }
  });

  test("tournament rounds variant (isTournament): same field still settles non-empty and conserves", () => {
    const groups = buildField();
    const rounds: RoundInfo[] = [{ id: "r1", number: 1, name: "Round 1", course: COURSE, groups }];
    const contest = baseContest(groups, { isTournament: true, rounds, currentRound: 1 });
    const settlement = calculateContestSettlement(contest);

    expect(settlement.pending).toBeFalsy();
    expect(settlement.transactions.length).toBeGreaterThan(0);
    expect(Math.round(sum(Object.values(settlement.netByPlayer)) * 100) / 100).toBe(0);
    expect(Object.keys(settlement.netByPlayer).length).toBe(16);
  });
});
