import type { ScannedPlayer } from "./score-parser";
export const fullHoles = Array.from({ length: 18 }, (_, i) => i + 1);
export function grossScore(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export function normalizePlayer(raw: any): ScannedPlayer {
  if (!raw || typeof raw.name !== "string") throw new Error("Malformed player data");
  const holes = raw.requiredHoles ?? fullHoles;
  if (!Array.isArray(holes) || ![9,18].includes(holes.length) ||
      !Array.from(holes).every((h: unknown, i: number) => Number.isInteger(h) && h === holes[0] + i) ||
      holes[0] < 1 || holes[holes.length - 1] > 18) throw new Error("Invalid hole identities");
  const scores = holes.map((_: number, i: number) => grossScore(Array.isArray(raw.scores) ? raw.scores[i] : undefined));
  return { name: raw.name, scores, requiredHoles: [...holes],
    confidence: scores.map((s: number | null, i: number) => s === null ? 0 :
      typeof raw.confidence?.[i] === "number" && Number.isFinite(raw.confidence[i]) ? Math.max(0, Math.min(1, raw.confidence[i])) : 0),
    nameConfidence: Number.isFinite(raw.nameConfidence) ? raw.nameConfidence : 0,
    matchedPlayerId: typeof raw.matchedPlayerId === "string" ? raw.matchedPlayerId : null,
    alignmentError: raw.alignmentError ? String(raw.alignmentError) : undefined };
}
export function parseReviewData(data: string): ScannedPlayer[] {
  const rows = JSON.parse(data);
  if (!Array.isArray(rows) || !rows.length) throw new Error("No players found");
  return rows.map(normalizePlayer);
}
export function subtotal(player: ScannedPlayer): number {
  return player.scores.reduce<number>((sum, s) => sum + (grossScore(s) ?? 0), 0);
}
export function blockingReason(players: ScannedPlayer[], requireMapping = false): string | null {
  if (!players.length) return "No players found";
  const ids = new Set<string>();
  for (const p of players) {
    if (p.alignmentError) return p.alignmentError;
    for (let i = 0; i < (p.requiredHoles ?? fullHoles).length; i++) {
      if (grossScore(p.scores[i]) === null) return `Hole ${(p.requiredHoles ?? fullHoles)[i]} is blank for ${p.name}`;
    }
    if ((p.requiredHoles ?? fullHoles).length !== 18) return "Nine-hole import needs manual entry on matching course holes. Entered scores are retained.";
    if (requireMapping && (!p.matchedPlayerId || ids.has(p.matchedPlayerId))) return "Match every scanned player to a unique contest player";
    if (p.matchedPlayerId) ids.add(p.matchedPlayerId);
  }
  return null;
}
export function completeScores(scores: unknown, count = 18): number[] {
  if (!Array.isArray(scores) || count !== 18 || scores.length !== count ||
      Array.from({length: count}, (_, i) => grossScore(scores[i])).some(s => s === null))
    throw new Error("Every required hole needs a positive whole score; unsupported course mappings require manual entry");
  return scores.map(s => grossScore(s)!);
}
export function commitQuickSettle(players: ScannedPlayer[], commit: (scores: number[][]) => void) {
  const reason = blockingReason(players);
  if (reason) throw new Error(reason);
  const scores = players.map(p => completeScores(p.scores));
  commit(scores);
}

/** Apply selected course identities without inferring nine holes from score length. */
export function applyCourseHoles(players: ScannedPlayer[], holes?: number[]): ScannedPlayer[] {
  return players.map(player => {
    const p = normalizePlayer(player);
    if (!holes) return p;
    const known = p.requiredHoles ?? fullHoles;
    if (holes.length === 9 && known.length === 18 && p.scores.slice(9).every(s => s === null)) {
      return normalizePlayer({ ...p, requiredHoles: holes, scores: p.scores.slice(0, 9), confidence: p.confidence.slice(0, 9) });
    }
    if (holes.length !== known.length || holes.some((h, i) => h !== known[i])) {
      return { ...p, alignmentError: "Scanned holes do not match the selected course. Enter scores manually on matching course holes; readings are retained." };
    }
    return p;
  });
}

/** Exact names may establish identity only when both sides are unambiguous. */
export function autoMatchPlayers(rows: ScannedPlayer[], targets: {id: string; name: string}[]): ScannedPlayer[] {
  const key = (name: string) => name.trim().toLowerCase();
  return rows.map(row => {
    if (row.matchedPlayerId !== null) return row;
    const matches = targets.filter(target => key(target.name) === key(row.name));
    if (matches.length !== 1 || rows.filter(other => key(other.name) === key(row.name)).length !== 1 ||
        rows.some(other => other.matchedPlayerId === matches[0].id)) return row;
    return { ...row, matchedPlayerId: matches[0].id };
  });
}
