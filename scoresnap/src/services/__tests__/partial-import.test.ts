import { buildPartialImport } from "../partial-import";
import type { ScannedPlayer } from "../score-parser";

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const row = (name: string, id: string | null, holes: number[], scores: (number | null)[], confidence = 0.95): ScannedPlayer => ({
  name,
  source: "ocr",
  requiredHoles: holes,
  scores,
  confidence: scores.map(score => score === null ? 0 : confidence),
  nameConfidence: 0.95,
  matchedPlayerId: id,
});
const player = (id: string, name = id, scores: Record<number, number | null> = {}) => ({ id, name, scores });
const model = (rows: ScannedPlayer[], players: ReturnType<typeof player>[], holes: number[], played: number[], coverage: "full-group" | "sparse" = "sparse") =>
  buildPartialImport({ rows, players, holeIdentities: holes, playedHoles: new Set(played), coverage });

describe("buildPartialImport", () => {
  it("builds a deterministic positive-cell patch for a six-player group", () => {
    const players = Array.from({ length: 6 }, (_, i) => player(`p${i + 1}`, `Player ${i + 1}`));
    const rows = players.map((p, i) => row(p.name, p.id, [1, 2], [4 + (i % 2), 5]));
    const first = model(rows, players, [1, 2], [1, 2], "full-group");
    const second = model(rows, players, [1, 2], [1, 2], "full-group");
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, complete: true });
    if (first.ok) {
      expect(first.patch).toHaveLength(12);
      expect(first.patch.every(cell => cell.strokes > 0)).toBe(true);
    }
  });

  it("maps a hole-10 start and leaves unplayed holes untouched", () => {
    const result = model([row("A", "a", [10, 11, 12], [4, 5, null])], [player("a", "A")], [10, 11, 12], [10, 11]);
    expect(result).toEqual({ ok: true, complete: true, patch: [
      { playerId: "a", hole: 10, strokes: 4 }, { playerId: "a", hole: 11, strokes: 5 },
    ] });
  });

  it("supports mixed completion by importing only explicitly played cells", () => {
    const result = model([row("A", "a", [1, 2, 3], [4, null, 5])], [player("a", "A")], [1, 2, 3], [1, 3]);
    expect(result).toEqual({ ok: true, complete: true, patch: [
      { playerId: "a", hole: 1, strokes: 4 }, { playerId: "a", hole: 3, strokes: 5 },
    ] });
  });

  it("blocks missing and low-confidence played cells by hole", () => {
    const missing = model([row("A", "a", [1, 2], [4, null])], [player("a", "A")], [1, 2], [1, 2]);
    expect(missing).toMatchObject({ ok: false, blockers: [expect.stringContaining("played hole 2")] });
    const low = model([row("A", "a", [1], [4], 0.5)], [player("a", "A")], [1], [1]);
    expect(low).toMatchObject({ ok: false, blockers: [expect.stringContaining("low-confidence")] });
  });

  it("blocks a changed existing score but treats an identical score as a no-op", () => {
    const same = model([row("A", "a", [1], [4])], [player("a", "A", { 1: 4 })], [1], [1]);
    expect(same).toEqual({ ok: true, complete: true, patch: [] });
    const conflict = model([row("A", "a", [1], [5])], [player("a", "A", { 1: 4 })], [1], [1]);
    expect(conflict).toMatchObject({ ok: false, blockers: [expect.stringContaining("Score conflict")] });
  });

  it("blocks ambiguous, unmapped, and duplicate player mappings", () => {
    const ambiguous = model([row("Alex", null, [1], [4])], [player("a", "Alex"), player("b", " Alex ")], [1], [1]);
    expect(ambiguous).toMatchObject({ ok: false, blockers: [expect.stringContaining("ambiguous")] });
    const unmapped = model([row("Unknown", "missing", [1], [4])], [player("a", "A")], [1], [1]);
    expect(unmapped).toMatchObject({ ok: false, blockers: [expect.stringContaining("unmapped player id")] });
    const duplicate = model([row("A", "a", [1], [4]), row("A2", "a", [1], [4])], [player("a", "A")], [1], [1]);
    expect(duplicate).toMatchObject({ ok: false, blockers: [expect.stringContaining("Multiple scanned rows")] });
  });

  it("requires the full roster only in full-group mode and reports sparse incompleteness", () => {
    const rows = [row("A", "a", [1], [4])];
    const players = [player("a", "A"), player("b", "B")];
    const sparse = model(rows, players, [1], [1], "sparse");
    expect(sparse).toMatchObject({ ok: true, complete: false });
    const full = model(rows, players, [1], [1], "full-group");
    expect(full).toMatchObject({ ok: false, blockers: [expect.stringContaining("missing roster player B")] });
  });
});
