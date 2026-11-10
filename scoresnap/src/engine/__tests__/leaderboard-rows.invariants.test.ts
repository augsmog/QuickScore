import { buildLeaderboardRows } from "../leaderboard-rows";
import type { StrokePlayResult } from "../types";

declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: any;

const SEED = 0x2537_1a5e;
const FIELD_COUNT = 200;

/** Small deterministic PRNG (mulberry32); no global Math.random state. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function invariant(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`${detail}; seed=0x${SEED.toString(16)}`);
}

describe("buildLeaderboardRows seeded invariants", () => {
  test("rank, tie, label, row-count, and pin rules hold across 200 seeded fields", () => {
    const random = mulberry32(SEED);
    const startedAt = Date.now();
    let sawNegativeTotal = false;
    let sawDuplicateTotal = false;

    for (let field = 0; field < FIELD_COUNT; field++) {
      const size = 1 + Math.floor(random() * 120);
      const results: StrokePlayResult[] = Array.from({ length: size }, (_, index) => {
        // A compact range deliberately produces ties and includes negative scores.
        const total = Math.floor(random() * 41) - 12;
        return {
          playerId: `field-${field}-player-${index}`,
          name: `Player ${index}`,
          front: 0,
          back: 0,
          total,
          toPar: total - 72,
        };
      }).sort((a, b) => a.total - b.total || a.playerId.localeCompare(b.playerId));

      const totals = new Map<number, number>();
      for (const result of results) {
        totals.set(result.total, (totals.get(result.total) ?? 0) + 1);
        if (result.total < 0) sawNegativeTotal = true;
      }
      if ([...totals.values()].some((count) => count > 1)) sawDuplicateTotal = true;

      const rows = buildLeaderboardRows(results, [], { holeCount: 18 });
      invariant(rows.length === new Set(results.map((row) => row.playerId)).size,
        `field ${field}: row count did not match unique input count`);

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const strictlyLowerCount = results.filter((candidate) => candidate.total < row.total).length;
        const tied = (totals.get(row.total) ?? 0) > 1;
        const expectedLabel = tied ? `T${strictlyLowerCount + 1}` : `${strictlyLowerCount + 1}`;
        invariant(index === 0 || rows[index - 1].rank <= row.rank,
          `field ${field}, player ${row.playerId}: rank decreased in row order`);
        invariant(row.rank === strictlyLowerCount + 1,
          `field ${field}, player ${row.playerId}: rank ${row.rank} != ${strictlyLowerCount + 1}`);
        invariant(row.tied === tied,
          `field ${field}, player ${row.playerId}: incorrect tied flag`);
        invariant(row.rankLabel === expectedLabel,
          `field ${field}, player ${row.playerId}: label ${row.rankLabel} != ${expectedLabel}`);
      }

      const you = results[Math.floor(random() * results.length)];
      const pinned = buildLeaderboardRows(results, [], { holeCount: 18, youPlayerId: you.playerId });
      const unpinnedRow = rows.find((row) => row.playerId === you.playerId);
      invariant(unpinnedRow, `field ${field}: selected player missing from unpinned rows`);
      invariant(pinned[0]?.playerId === you.playerId && pinned[0]?.isYou === true,
        `field ${field}: selected player was not pinned to the first row`);
      invariant(pinned[0].rank === unpinnedRow.rank
        && pinned[0].tied === unpinnedRow.tied
        && pinned[0].rankLabel === unpinnedRow.rankLabel,
      `field ${field}: pin changed rank/tie/label`);
    }

    invariant(sawNegativeTotal, "seeded fields did not include a negative total");
    invariant(sawDuplicateTotal, "seeded fields did not include duplicate totals");
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});
