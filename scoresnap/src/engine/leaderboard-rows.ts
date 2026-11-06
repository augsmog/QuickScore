import { Player, StrokePlayResult } from "./types";

// AUG-253f: pure data model for the tournament leaderboard (parent AUG-253,
// Figma 15:2). Today `app/contest/[id]/index.tsx` recomputes each row's rank
// and tie flag inside the render with `results.findIndex(...)` /
// `results.filter(...)` (O(n^2) over a 72-player field) and has no THRU,
// search or group filter. This module builds the row model once, in O(n), so
// the FlashList screen (AUG-614) and the later design-gated UI can consume it.
// It mounts no UI and does not touch any screen.

export interface LeaderboardRow {
  playerId: string;
  name: string;
  /** Effective total from the input results (gross strokes, or net total when the caller passes net rows). */
  total: number;
  /** 1-based competition rank: ties share the rank of the first position, the next distinct total skips (1, 2, 2, 4). */
  rank: number;
  /** True when more than one player shares this total. */
  tied: boolean;
  /** `T<rank>` when tied, else `<rank>` — identical to today's index.tsx `tied ? `T${rank}` : rank`. */
  rankLabel: string;
  /**
   * Holes completed: `'F'` when the player has a score on every course hole,
   * the number of holes played when 1..holeCount-1, and `null` when 0.
   * (Tee-time display is out of scope: no tee-time field exists on the model.)
   */
  thru: "F" | number | null;
  /** The id of the group the player belongs to (from `opts.groups`), or `null` when ungrouped / unknown. */
  groupId: string | null;
}

/** Minimal group shape needed for membership — a subset of `ContestGroup`. */
export interface LeaderboardGroup {
  id: string;
  players: { id: string }[];
}

export interface BuildLeaderboardRowsOptions {
  /** Number of holes on the course the `results` were computed for; drives THRU. Required. */
  holeCount: number;
  /** Contest groups, used for each row's `groupId` and the `groupId` filter. */
  groups?: LeaderboardGroup[];
  /** Case-insensitive name substring filter, applied AFTER ranks are computed so ranks are preserved. */
  query?: string;
  /** Keep only players in this group id, applied AFTER ranks are computed so ranks are preserved. */
  groupId?: string;
}

/**
 * Build leaderboard rows from `calcStrokePlay(...)` output (already sorted by
 * `total` ascending). Ranks and tie flags are computed in a single linear pass
 * over the full result set BEFORE any filtering, so a searched or group-scoped
 * view still shows each player's real field rank. Pass net rows (total/toPar
 * already carrying net values, as `buildLeaderboard` produces) to rank net.
 */
export function buildLeaderboardRows(
  results: StrokePlayResult[],
  players: Player[],
  opts: BuildLeaderboardRowsOptions,
): LeaderboardRow[] {
  const { holeCount, groups, query, groupId } = opts;

  // playerId -> player, for THRU (holes with a score on this course).
  const playerById = new Map<string, Player>();
  for (const p of players) playerById.set(p.id, p);

  // playerId -> group id, for row.groupId and the group filter.
  const groupByPlayer = new Map<string, string>();
  if (groups) {
    for (const g of groups) {
      for (const member of g.players) {
        if (!groupByPlayer.has(member.id)) groupByPlayer.set(member.id, g.id);
      }
    }
  }

  // Tie counts in one pass, so `tied` matches today's
  // `results.filter((x) => x.total === total).length > 1`.
  const countByTotal = new Map<number, number>();
  for (const r of results) {
    countByTotal.set(r.total, (countByTotal.get(r.total) ?? 0) + 1);
  }

  const rows: LeaderboardRow[] = [];
  let prevTotal: number | undefined;
  let prevRank = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    // Competition rank: first row of a tie group takes its 1-based position
    // (= today's `findIndex((x) => x.total === total) + 1`); the rest repeat it.
    const rank = i > 0 && r.total === prevTotal ? prevRank : i + 1;
    prevTotal = r.total;
    prevRank = rank;

    const tied = (countByTotal.get(r.total) ?? 0) > 1;
    const player = playerById.get(r.playerId);

    rows.push({
      playerId: r.playerId,
      name: r.name,
      total: r.total,
      rank,
      tied,
      rankLabel: tied ? `T${rank}` : `${rank}`,
      thru: computeThru(player, holeCount),
      groupId: groupByPlayer.get(r.playerId) ?? null,
    });
  }

  // Filters run after ranks are fixed, so they never renumber.
  let filtered = rows;
  if (query && query.trim() !== "") {
    const needle = query.trim().toLowerCase();
    filtered = filtered.filter((row) => row.name.toLowerCase().includes(needle));
  }
  if (groupId != null) {
    filtered = filtered.filter((row) => row.groupId === groupId);
  }
  return filtered;
}

/** THRU for a player over the first `holeCount` holes: 'F' all played, count when partial, null when none. */
function computeThru(player: Player | undefined, holeCount: number): "F" | number | null {
  if (!player || holeCount <= 0) return null;
  let played = 0;
  for (let i = 0; i < holeCount; i++) {
    if ((player.scores[i] ?? 0) > 0) played++;
  }
  if (played === 0) return null;
  if (played >= holeCount) return "F";
  return played;
}
