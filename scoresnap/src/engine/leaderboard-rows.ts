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
  /** 1-based competition rank; null when the player has not started. */
  rank: number | null;
  /** True when more than one player shares this total. */
  tied: boolean;
  /** `T<rank>` when tied, else `<rank>` — identical to today's index.tsx `tied ? `T${rank}` : rank`. */
  rankLabel: string;
  /** Present only when this row matches the caller's pinned current-player id. */
  isYou?: true;
  /**
   * Holes completed: `'F'` when the player has a score on every course hole,
   * the number of holes played when 1..holeCount-1, and `null` when 0 / no data.
   * `thru` never carries a tee time; the pre-start tee-time token lives on the
   * sibling `teeTime` field below (AUG-253n) so the 16-player golden regression
   * and every existing `thru` consumer stay byte-stable.
   */
  thru: "F" | number | null;
  /**
   * AUG-253n: the pre-start tee-time token for a player who has not teed off.
   * Deterministic contract, driven purely by `thru` + the player's group tee
   * time (from `opts.groups[].teeTime`, i.e. RoundInfo start data):
   *   - `thru === null` (not started) AND a group tee time is known → that token (e.g. `"8:40 AM"`).
   *   - started (`thru` is a number) or finished (`thru === "F"`) → always `null`.
   *   - not started but no tee time is known → `null`.
   * The caller renders THRU as `thru ?? teeTime ?? "—"`: finished shows `F`,
   * mid-round shows the hole count, pre-start shows the tee time, and a player
   * with neither score nor tee time shows nothing.
   */
  teeTime: string | null;
  /** The id of the group the player belongs to (from `opts.groups`), or `null` when ungrouped / unknown. */
  groupId: string | null;
  /**
   * AUG-253m: Round-1 score for the R1 column (Figma 15:2 / AUG-253), or `null`
   * when the player has no round-1 result. Present ONLY when `opts.roundInfo`
   * is supplied; the field is omitted otherwise so existing callers and golden
   * fixtures are unchanged. The UI (a later sibling) renders the column; this
   * module only carries the value.
   */
  r1?: LeaderboardRoundScore | null;
  /**
   * AUG-253m: Current-round ("Today") score for the Today column (Figma 15:2),
   * or `null` when the player has no current-round result. Present ONLY when
   * `opts.roundInfo` is supplied; omitted otherwise.
   */
  today?: LeaderboardRoundScore | null;
}

/** A single round's score for the R1 / Today columns (Figma 15:2). */
export interface LeaderboardRoundScore {
  /** Gross strokes in the round (or net when the caller passes net round rows). */
  total: number;
  /** Strokes relative to par in the round. */
  toPar: number;
}

/**
 * Per-round results for the R1 / Today columns (Figma 15:2 / AUG-253). Each
 * field is the `calcStrokePlay(...)` output for that round — the same
 * `StrokePlayResult[]` shape as the cumulative `results`, which the caller
 * computes per `RoundInfo` (contest-store). Rows copy their own round
 * `total`/`toPar` keyed by `playerId`; a player absent from a round's results
 * yields `null` for that column.
 */
export interface LeaderboardRoundInfo {
  /** Round-1 results, driving the R1 column. */
  r1?: StrokePlayResult[];
  /** The current/active round's results, driving the Today column. */
  today?: StrokePlayResult[];
}

/**
 * Minimal group shape needed for membership and the pre-start tee time — a
 * subset of `ContestGroup` / `PlannedGroup` (both carry `teeTime?: string`).
 */
export interface LeaderboardGroup {
  id: string;
  players: { id: string }[];
  /** Optional start time for the group; surfaces on a not-started row's `teeTime`. */
  teeTime?: string;
}

export interface BuildLeaderboardRowsOptions {
  /** Number of holes on the course the `results` were computed for; drives THRU. Required. */
  holeCount: number;
  /** Player id to pin to the top of the filtered result without changing field rank. */
  youPlayerId?: string;
  /** Contest groups, used for each row's `groupId` and the `groupId` filter. */
  groups?: LeaderboardGroup[];
  /** Case-insensitive name substring filter, applied AFTER ranks are computed so ranks are preserved. */
  query?: string;
  /** Keep only players in this group id, applied AFTER ranks are computed so ranks are preserved. */
  groupId?: string;
  /**
   * AUG-253m: optional per-round results for the R1 / Today columns (Figma
   * 15:2). When omitted, rows carry no `r1`/`today` (fields stay undefined) and
   * every existing fixture is byte-for-byte unchanged. When present, each row
   * gets its matching round score, or `null` when that round has no result for
   * the player. Does not affect rank, ties, THRU, filtering, or the you-pin.
   */
  roundInfo?: LeaderboardRoundInfo;
}

/**
 * Build leaderboard rows from `calcStrokePlay(...)` output. Callers pass
 * results sorted by total ascending; started rows retain that order, while
 * unstarted players are placed after them and do not receive a field rank.
 * Ranks and tie flags are computed in a single linear pass
 * over the full result set BEFORE any filtering, so a searched or group-scoped
 * view still shows each player's real field rank. Pass net rows (total/toPar
 * already carrying net values, as `buildLeaderboard` produces) to rank net.
 */
export function buildLeaderboardRows(
  results: StrokePlayResult[],
  players: Player[],
  opts: BuildLeaderboardRowsOptions,
): LeaderboardRow[] {
  const { holeCount, groups, query, groupId, youPlayerId, roundInfo } = opts;

  // playerId -> player, for THRU (holes with a score on this course).
  const playerById = new Map<string, Player>();
  for (const p of players) playerById.set(p.id, p);

  // playerId -> per-round score, for the R1 / Today columns (AUG-253m). Built
  // once in O(n) per supplied round; absent when `roundInfo` is omitted so the
  // row objects keep their legacy shape.
  const r1ById = roundInfo?.r1 ? indexRoundScores(roundInfo.r1) : undefined;
  const todayById = roundInfo?.today ? indexRoundScores(roundInfo.today) : undefined;

  // playerId -> group id, for row.groupId and the group filter.
  const groupByPlayer = new Map<string, string>();
  // playerId -> group tee time, for a not-started row's pre-start token.
  const teeTimeByPlayer = new Map<string, string>();
  if (groups) {
    for (const g of groups) {
      for (const member of g.players) {
        if (!groupByPlayer.has(member.id)) {
          groupByPlayer.set(member.id, g.id);
          // A non-empty tee time follows the same first-group-wins rule as groupId.
          if (g.teeTime != null && g.teeTime !== "") teeTimeByPlayer.set(member.id, g.teeTime);
        }
      }
    }
  }

  const rosterIndex = new Map(players.map((p, index) => [p.id, index]));
  const teeTimeMinutes = (value: string | undefined): number | null => {
    if (!value) return null;
    const match = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(value);
    if (!match) return null;
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + Number(match[2]);
  };

  const ordered = results.map((result, index) => {
    const player = playerById.get(result.playerId);
    const thru = computeThru(player, holeCount);
    // Missing player metadata is unknown, not proof of an unstarted player.
    const unstarted = player !== undefined && thru === null;
    return { result, index, thru, unstarted };
  }).sort((a, b) => {
    if (a.unstarted !== b.unstarted) return a.unstarted ? 1 : -1;
    if (!a.unstarted) return a.index - b.index;
    const aTime = teeTimeMinutes(teeTimeByPlayer.get(a.result.playerId));
    const bTime = teeTimeMinutes(teeTimeByPlayer.get(b.result.playerId));
    if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
    if (aTime !== null && bTime === null) return -1;
    if (aTime === null && bTime !== null) return 1;
    return (rosterIndex.get(a.result.playerId) ?? a.index) - (rosterIndex.get(b.result.playerId) ?? b.index);
  });

  // Tie counts in one pass, so `tied` matches today's
  // `results.filter((x) => x.total === total).length > 1`.
  const countByTotal = new Map<number, number>();
  for (const entry of ordered) {
    if (!entry.unstarted) {
      countByTotal.set(entry.result.total, (countByTotal.get(entry.result.total) ?? 0) + 1);
    }
  }

  const rows: LeaderboardRow[] = [];
  let prevTotal: number | undefined;
  let prevRank = 0;
  let startedCount = 0;
  for (const entry of ordered) {
    const { result: r, thru, unstarted } = entry;
    // Competition ranks count only started players, so a tie among them still
    // uses 1, 2, 2, 4 and an unstarted row never consumes a position.
    const rank = unstarted ? null : (startedCount > 0 && r.total === prevTotal ? prevRank : startedCount + 1);
    if (!unstarted) {
      startedCount++;
      prevTotal = r.total;
      prevRank = rank!;
    }

    const tied = !unstarted && (countByTotal.get(r.total) ?? 0) > 1;
    const player = playerById.get(r.playerId);

    const row: LeaderboardRow = {
      playerId: r.playerId,
      name: r.name,
      total: r.total,
      rank,
      tied,
      rankLabel: rank === null ? "—" : (tied ? `T${rank}` : `${rank}`),
      thru,
      // Tee time only when the player has not started (thru === null); a known
      // score (number or "F") always clears it.
      teeTime: thru === null ? (teeTimeByPlayer.get(r.playerId) ?? null) : null,
      groupId: groupByPlayer.get(r.playerId) ?? null,
    };
    // Only attach R1 / Today when the caller supplies round context, so rows
    // without `roundInfo` stay identical to the pre-AUG-253m model.
    if (roundInfo) {
      row.r1 = r1ById?.get(r.playerId) ?? null;
      row.today = todayById?.get(r.playerId) ?? null;
    }
    rows.push(row);
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

  if (youPlayerId) {
    const youIndex = filtered.findIndex((row) => row.playerId === youPlayerId);
    if (youIndex >= 0) {
      const youRow = { ...filtered[youIndex], isYou: true as const };
      return [youRow, ...filtered.slice(0, youIndex), ...filtered.slice(youIndex + 1)];
    }
  }
  return filtered;
}

/**
 * Index a round's `StrokePlayResult[]` into a `playerId -> {total,toPar}` map
 * for the R1 / Today columns. A player with more than one row in the same round
 * keeps the first (callers pass one row per player, as `calcStrokePlay` does).
 */
function indexRoundScores(results: StrokePlayResult[]): Map<string, LeaderboardRoundScore> {
  const byId = new Map<string, LeaderboardRoundScore>();
  for (const r of results) {
    if (!byId.has(r.playerId)) byId.set(r.playerId, { total: r.total, toPar: r.toPar });
  }
  return byId;
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
