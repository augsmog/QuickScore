import { Player, Course } from "../types";
import { handicapStrokesForHole } from "./skins";
import { calcNetStrokePlay } from "./net-stroke-play";

// AUG-705a: pure data layer for the Round > Leaderboard "tap a player to see
// their full-round scorecard" view. UI-free so it can be unit-tested without
// rendering. Builds one player's hole-by-hole scorecard (hole, par, strokes,
// to-par, net) plus front/back/total summaries, modelled on the middle section
// of Augie's reference screenshot (AUG-246, Nov 5 2026). Uses existing round
// data only: strokes from player.scores, par from course.holes[i].par (same
// convention as AUG-643), net strokes from the handicap the net games already
// use. Net availability is read from calcNetStrokePlay so the scorecard's Net
// column agrees exactly with the leaderboard's Net option (AUG-246a/c).

export interface ScorecardHole {
  /** 1-based hole number (course order). */
  num: number;
  par: number;
  /** Gross strokes for this hole, or null when the hole has not been played. */
  strokes: number | null;
  /** strokes - par for a played hole, else null (blank in the UI). */
  toPar: number | null;
  /**
   * Net strokes for this hole (gross minus handicap strokes received), or null
   * when the hole is unplayed or the course cannot be ranked net.
   */
  net: number | null;
}

export interface ScorecardNine {
  /** Gross strokes over played holes in this segment. */
  strokes: number;
  /** Par of played holes only (matches the gross/net toPar convention). */
  par: number;
  /** strokes - par over played holes. */
  toPar: number;
  /** Net strokes over played holes, or null when net is unavailable. */
  net: number | null;
}

export interface PlayerScorecard {
  playerId: string;
  name: string;
  /** One entry per course hole, in course order. */
  holes: ScorecardHole[];
  /** Front nine (holes 1-9) over played holes only. */
  front: ScorecardNine;
  /** Back nine (holes 10+) over played holes only. Zeroed on a 9-hole course. */
  back: ScorecardNine;
  /** Whole round over played holes only. */
  total: ScorecardNine;
  /** True only when the course supports net ranking (calcNetStrokePlay). */
  netAvailable: boolean;
  /** Number of holes with an entered score (> 0). */
  holesPlayed: number;
}

function emptyNine(netAvailable: boolean): ScorecardNine {
  return { strokes: 0, par: 0, toPar: 0, net: netAvailable ? 0 : null };
}

/**
 * Build one player's full-round scorecard. Pure and UI-free. Unplayed holes
 * (score 0 or missing) render blank (null strokes/toPar/net); the nine and
 * total summaries sum played holes only, matching the gross/net toPar
 * convention used across the leaderboard. Net columns are populated only when
 * the course is net-rankable; otherwise every net field is null.
 */
export function buildPlayerScorecard(player: Player, course: Course): PlayerScorecard {
  const courseHoles = course?.holes ?? [];

  // Single source of truth for net availability: the leaderboard net calc.
  const netRow = calcNetStrokePlay([player], course)[0];
  const netAvailable = !!netRow && netRow.net !== "unavailable";

  const courseHandicap = player.courseHandicaps?.[course?.name] ?? player.handicap;

  const front = emptyNine(netAvailable);
  const back = emptyNine(netAvailable);
  const total = emptyNine(netAvailable);
  let holesPlayed = 0;

  const holes: ScorecardHole[] = courseHoles.map((hole, i) => {
    const par = hole?.par ?? 0;
    const score = player.scores?.[i] ?? 0;
    const played = score > 0 && !!hole;

    if (!played) {
      return { num: hole?.num ?? i + 1, par, strokes: null, toPar: null, net: null };
    }

    holesPlayed += 1;
    const toPar = score - par;
    const strokesReceived = netAvailable ? handicapStrokesForHole(courseHandicap, hole.hcp) : 0;
    const net = netAvailable ? score - strokesReceived : null;

    // Front = holes 1-9 (index < 9); back = the rest.
    const seg = i < 9 ? front : back;
    seg.strokes += score;
    seg.par += par;
    seg.toPar += toPar;
    total.strokes += score;
    total.par += par;
    total.toPar += toPar;
    if (netAvailable) {
      seg.net = (seg.net ?? 0) + (net as number);
      total.net = (total.net ?? 0) + (net as number);
    }

    return { num: hole.num ?? i + 1, par, strokes: score, toPar, net };
  });

  return {
    playerId: player.id,
    name: player.name,
    holes,
    front,
    back,
    total,
    netAvailable,
    holesPlayed,
  };
}
