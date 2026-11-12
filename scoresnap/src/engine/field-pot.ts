import { Player } from "./types";

/**
 * Field-pot payout / winner determination (AUG-1056).
 *
 * Pure, integer-cents math. Organizer-supplied config; nothing here is hard-coded
 * policy. OPEN ORGANIZER DECISIONS are the defaults noted below and should be confirmed.
 */
export type TieRule = "split" | "scorecard_playoff";

export interface FieldPotConfig {
  entryFeeCents: number;
  /** Organizer rake taken off the top, in cents (default 0). */
  rakeCents?: number;
  /** Payout share per place (1st, 2nd, ...). Must sum to 100. Default [100]. */
  payoutPercents?: number[];
  /** "gross" or "net" (total - handicap). Default "net". */
  basis?: "gross" | "net";
  /** split = tied players pool & share their places; scorecard_playoff = back 9, last 6, 3, 1, then split. Default "scorecard_playoff". */
  tieRule?: TieRule;
}

export interface FieldPotPayout {
  playerId: string;
  name: string;
  place: number; // shared places repeat (T-2)
  score: number;
  payoutCents: number;
}

export interface FieldPotResult {
  potCents: number; // after rake
  rakeCents: number;
  payouts: FieldPotPayout[];
  warnings: string[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function isComplete(p: Player): boolean {
  return p.scores.length >= 18 && p.scores.slice(0, 18).every((s) => s > 0);
}

/** Tiebreak keys in order: back 9, last 6, last 3, 18th hole (lower wins), on gross scores. */
function tieKeys(p: Player): number[] {
  const s = p.scores;
  return [sum(s.slice(9, 18)), sum(s.slice(12, 18)), sum(s.slice(15, 18)), s[17]];
}

function cmpKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function calcFieldPot(players: Player[], config: FieldPotConfig): FieldPotResult {
  const warnings: string[] = [];
  const percents = config.payoutPercents ?? [100];
  if (Math.round(sum(percents) * 1000) !== 100000) throw new Error("payoutPercents must sum to 100");
  if (!Number.isInteger(config.entryFeeCents) || config.entryFeeCents < 0) throw new Error("entryFeeCents must be a non-negative integer");
  const basis = config.basis ?? "net";
  const tieRule = config.tieRule ?? "scorecard_playoff";

  const eligible = players.filter(isComplete);
  for (const p of players) if (!isComplete(p)) warnings.push(`${p.name} excluded: incomplete scorecard`);

  const gross = eligible.length * config.entryFeeCents;
  const rake = Math.min(config.rakeCents ?? 0, gross);
  const pot = gross - rake;
  if (eligible.length === 0) return { potCents: 0, rakeCents: 0, payouts: [], warnings };

  // Per-place prize amounts (largest remainder so they sum exactly to pot).
  const raw = percents.map((pct) => (pot * pct) / 100);
  const prizes = raw.map(Math.floor);
  let left = pot - sum(prizes);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const o of order) { if (left <= 0) break; prizes[o.i]++; left--; }

  const scored = eligible.map((p) => {
    const g = sum(p.scores.slice(0, 18));
    return { p, score: basis === "net" ? g - p.handicap : g, keys: tieKeys(p) };
  });
  scored.sort((a, b) => a.score - b.score || (tieRule === "scorecard_playoff" ? cmpKeys(a.keys, b.keys) : 0) || a.p.id.localeCompare(b.p.id));

  // Group into tie groups.
  const groups: (typeof scored)[] = [];
  for (const s of scored) {
    const g = groups[groups.length - 1];
    const same = g && g[0].score === s.score && (tieRule === "split" || cmpKeys(g[0].keys, s.keys) === 0);
    if (same) g.push(s); else groups.push([s]);
  }

  // Players beyond the number of paid places still get ranked at 0.
  const payouts: FieldPotPayout[] = [];
  let rank = 0;
  for (const g of groups) {
    const places = Array.from({ length: g.length }, (_, k) => rank + k);
    const pool = sum(places.map((i) => prizes[i] ?? 0));
    const each = Math.floor(pool / g.length);
    let rem = pool - each * g.length;
    // Deterministic remainder: one cent each to the first players (sorted by id).
    g.forEach((s) => {
      const extra = rem > 0 ? 1 : 0;
      rem -= extra;
      payouts.push({ playerId: s.p.id, name: s.p.name, place: rank + 1, score: s.score, payoutCents: each + extra });
    });
    if (g.length > 1 && tieRule === "split") warnings.push(`Tie at place ${rank + 1}: ${g.length} players split ${pool} cents`);
    if (g.length > 1 && tieRule === "scorecard_playoff") warnings.push(`Unbreakable tie at place ${rank + 1} after scorecard playoff: split`);
    rank += g.length;
  }
  if (sum(payouts.map((p) => p.payoutCents)) !== pot) throw new Error("payout invariant violated");
  return { potCents: pot, rakeCents: rake, payouts, warnings };
}
