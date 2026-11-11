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
  /**
   * 1-based competition rank over STARTED players only: ties share the rank of
   * the first position, the next distinct total skips (1, 2, 2, 4).
   * AUG-863: `null` for an unstarted player (known roster player with no score
   * on any of the `holeCount` holes) — they take no rank position.
   */
  rank: number | null;
  /** True when more than one started player shares this total. Always false for an unstarted player. */
  tied: boolean;
  /**
   * `T<rank>` when tied, else `<rank>` — identical to today's index.tsx
   * `tied ? `T${rank}` : rank`. AUG-863: `—` for an unstarted player.
   */
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
 * Build leaderboard rows from `calcStrokePlay(...)` output. Callers must pass
 * results sorted by `total` ascending: ranks use adjacent totals while tie
 * flags count globally, so unsorted input can produce inconsistent labels.
 * Ranks and tie flags are computed in a single linear pass
 * over the full result set BEFORE any filtering, so a searched or group-scoped
 * view still shows each player's real field rank. Pass net rows (total/toPar
 * already carrying net values, as `buildLeaderboard` produces) to rank net.
 *
 * AUG-863 (PM rule recorded on the ticket): a player with no scores yet ranks
 * below every player with at least one score, gets no rank number (`rank`
 * null, `rankLabel` `—`), takes no rank position and creates no ties, so the
 * started players' ranks are computed over started players only. Unstarted
 * players keep entry order among themselves: group tee-time order when a tee
 * time is known, then roster (`players`) order. "Unstarted" requires the
 * player to be present in `players`; a result with no matching player record
 * (results-only callers) has unknown progress and keeps its legacy rank.
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

  // playerId -> roster index, for the unstarted players' entry order.
  const rosterIndex = new Map<string, number>();
  players.forEach((p, i) => {
    if (!rosterIndex.has(p.id)) rosterIndex.set(p.id, i);
  });

  // AUG-863: split the field into started rows (keep the caller's total order
  // and get competition ranks) and unstarted rows (sorted last, unranked).
  const started: { r: StrokePlayResult; thru: "F" | number | null }[] = [];
  const unstarted: { r: StrokePlayResult; inputIndex: number }[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const thru = computeThru(playerById.get(r.playerId), holeCount);
    if (isUnstarted(playerById.get(r.playerId), holeCount)) {
      unstarted.push({ r, inputIndex: i });
    } else {
      started.push({ r, thru });
    }
  }

  // Tie counts over started players only, so `tied` matches today's
  // `results.filter((x) => x.total === total).length > 1` for started rows and
  // an unstarted player's placeholder total can never create a tie.
  const countByTotal = new Map<number, number>();
  for (const { r } of started) {
    countByTotal.set(r.total, (countByTotal.get(r.total) ?? 0) + 1);
  }

  const makeRow = (
    r: StrokePlayResult,
    thru: "F" | number | null,
    rank: number | null,
    tied: boolean,
  ): LeaderboardRow => {
    const row: LeaderboardRow = {
      playerId: r.playerId,
      name: r.name,
      total: r.total,
      rank,
      tied,
      rankLabel: rank === null ? "—" : tied ? `T${rank}` : `${rank}`,
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
    return row;
  };

  const rows: LeaderboardRow[] = [];
  let prevTotal: number | undefined;
  let prevRank = 0;
  for (let i = 0; i < started.length; i++) {
    const { r, thru } = started[i];
    // Competition rank: first row of a tie group takes its 1-based position
    // (= today's `findIndex((x) => x.total === total) + 1`); the rest repeat it.
    const rank = i > 0 && r.total === prevTotal ? prevRank : i + 1;
    prevTotal = r.total;
    prevRank = rank;
    rows.push(makeRow(r, thru, rank, (countByTotal.get(r.total) ?? 0) > 1));
  }

  // Unstarted: tee-time order when a group tee time is known (unparseable or
  // missing tee times after known ones), then roster order, then input order.
  const unstartedKey = (u: { r: StrokePlayResult; inputIndex: number }) => ({
    tee: teeTimeMinutes(teeTimeByPlayer.get(u.r.playerId)),
    roster: rosterIndex.get(u.r.playerId) ?? Number.POSITIVE_INFINITY,
    input: u.inputIndex,
  });
  const keyed = unstarted.map((u) => ({ u, k: unstartedKey(u) }));
  keyed.sort((a, b) => a.k.tee - b.k.tee || a.k.roster - b.k.roster || a.k.input - b.k.input);
  for (const { u } of keyed) rows.push(makeRow(u.r, null, null, false));

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

/**
 * AUG-863: a known roster player with no score on any of the first `holeCount`
 * holes. A result with no matching player record is NOT unstarted (progress is
 * unknown), so results-only callers keep their legacy ranks.
 */
function isUnstarted(player: Player | undefined, holeCount: number): boolean {
  if (!player || holeCount <= 0) return false;
  return computeThru(player, holeCount) === null;
}

/**
 * Minutes after midnight for a tee-time token such as `"8:40 AM"`, `"1:05 pm"`
 * or `"13:05"`; `+Infinity` when absent or unparseable, so those sort after
 * known tee times and fall back to roster order.
 */
function teeTimeMinutes(token: string | undefined): number {
  if (!token) return Number.POSITIVE_INFINITY;
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(token);
  if (!m) return Number.POSITIVE_INFINITY;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return Number.POSITIVE_INFINITY;
  const ampm = m[3]?.toUpperCase();
  if (ampm) {
    if (h < 1 || h > 12) return Number.POSITIVE_INFINITY;
    if (h === 12) h = 0;
    if (ampm === "PM") h += 12;
  } else if (h > 23) {
    return Number.POSITIVE_INFINITY;
  }
  return h * 60 + min;
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
