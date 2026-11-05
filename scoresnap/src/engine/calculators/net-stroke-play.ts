import { Player, Course, StrokePlayResult } from "../types";
import { handicapStrokesForHole } from "./skins";
import { calcStrokePlay } from "./stroke-play";

// Option-A net leaderboard (AUG-246a): rank by net total using the handicap
// strokes players already enter for net games. Full (100%) strokes, 18-hole
// rounds only, math-only — no UI, no handicap index/slope/rating (Option C).

export interface NetBreakdown {
  /** Gross total minus strokes received on played holes. */
  netTotal: number;
  /** netTotal relative to par of played holes only (same convention as gross toPar). */
  netToPar: number;
  /** Strokes received on played holes only (negative for plus handicaps). */
  strokesReceived: number;
}

export interface NetStrokePlayResult extends StrokePlayResult {
  /** Net breakdown, or the literal "unavailable" when the course cannot be ranked net. */
  net: NetBreakdown | "unavailable";
}

/**
 * Net ranking needs a full, well-formed 18-hole stroke-index map. A course that
 * is not exactly 18 holes, is missing a hole handicap (hcp), or has a duplicate
 * or out-of-range stroke index cannot be allocated strokes, so net is unavailable.
 */
function netSupported(course: Course): boolean {
  const holes = course?.holes;
  if (!Array.isArray(holes) || holes.length !== 18) return false;
  const seen = new Set<number>();
  for (const h of holes) {
    if (!h || !Number.isInteger(h.hcp) || h.hcp < 1 || h.hcp > 18) return false;
    seen.add(h.hcp);
  }
  return seen.size === 18;
}

/**
 * Pure net stroke-play leaderboard. Returns the same per-player shape as
 * calcStrokePlay plus a `net` field, sorted by net total (ascending). When the
 * course is unsupported, gross results are returned unchanged (gross order) with
 * `net: "unavailable"` on every row — never a bogus net number.
 */
export function calcNetStrokePlay(players: Player[], course: Course): NetStrokePlayResult[] {
  const gross = calcStrokePlay(players, course);

  if (!netSupported(course)) {
    return gross.map((g) => ({ ...g, net: "unavailable" as const }));
  }

  const byId = new Map(players.map((p) => [p.id, p]));

  const net: NetStrokePlayResult[] = gross.map((g) => {
    const p = byId.get(g.playerId)!;
    // Same entered course-handicap convention net games already use.
    const courseHandicap = p.courseHandicaps?.[course.name] ?? p.handicap;

    let strokesReceived = 0;
    let netTotal = 0;
    let parForPlayedHoles = 0;

    p.scores.forEach((score, i) => {
      const hole = course.holes[i];
      // Only holes with a score > 0 count, matching gross toPar.
      if (score > 0 && hole) {
        const strokes = handicapStrokesForHole(courseHandicap, hole.hcp);
        strokesReceived += strokes;
        netTotal += score - strokes;
        parForPlayedHoles += hole.par;
      }
    });

    const netToPar = parForPlayedHoles > 0 ? netTotal - parForPlayedHoles : 0;
    return { ...g, net: { netTotal, netToPar, strokesReceived } };
  });

  // Sort by net total. Array.prototype.sort is stable, so equal net totals keep
  // the gross tie order the screen already uses (same total = same rank).
  net.sort((a, b) => (a.net as NetBreakdown).netTotal - (b.net as NetBreakdown).netTotal);
  return net;
}
