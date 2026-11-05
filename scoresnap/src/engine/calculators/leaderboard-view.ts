import { Player, Course, StrokePlayResult } from "../types";
import { calcStrokePlay } from "./stroke-play";
import { calcNetStrokePlay, NetBreakdown } from "./net-stroke-play";

// AUG-246c: screen-logic helper for the Leaderboard Gross/Net toggle (Direction
// A, Figma 11:43). Pure and UI-free so it can be unit-tested without rendering.
// Picks which ranking the individual leaderboard shows and whether the Net
// option may be offered at all. The net math lives in calcNetStrokePlay
// (AUG-246a); this only selects between gross and net for display.

export type RankMode = "gross" | "net";

export interface LeaderboardView {
  /**
   * Rows to render, already ranked for the effective mode. `total` and `toPar`
   * carry the active mode's values (gross strokes/to-par, or net total/to-par)
   * so the existing row UI reads the same fields in both modes.
   */
  rows: StrokePlayResult[];
  /** True only when the course supports net ranking (calcNetStrokePlay != "unavailable"). */
  netAvailable: boolean;
  /** Effective mode after applying availability: a requested "net" on an unsupported course falls back to "gross". */
  mode: RankMode;
}

/**
 * Build the leaderboard rows for the requested mode. Gross is identical to the
 * pre-toggle screen (`calcStrokePlay`). Net ranks by net total and surfaces
 * net total/to-par in the same `total`/`toPar` fields the gross view uses; when
 * the course cannot be ranked net, the Net option is withheld and gross shows.
 */
export function buildLeaderboard(
  players: Player[],
  course: Course,
  rankMode: RankMode,
): LeaderboardView {
  const gross = calcStrokePlay(players, course);
  const net = calcNetStrokePlay(players, course);
  const netAvailable = net.length > 0 && net[0].net !== "unavailable";
  const mode: RankMode = rankMode === "net" && netAvailable ? "net" : "gross";

  if (mode === "net") {
    const rows: StrokePlayResult[] = net.map((r) => {
      const b = r.net as NetBreakdown;
      return { ...r, total: b.netTotal, toPar: b.netToPar };
    });
    return { rows, netAvailable, mode };
  }

  return { rows: gross, netAvailable, mode };
}
