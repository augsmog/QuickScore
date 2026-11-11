import type { Contest, ContestGroup, RoundInfo } from "../stores/contest-store";
import type { Course, Player } from "./types";
import { buildLeaderboard, type RankMode } from "./calculators/leaderboard-view";
import { flightStandings, type FlightRule, type FlightStanding } from "./flights";

export type ContestFlightStandings = FlightStanding[] & { effectiveRankMode: RankMode };

// AUG-256d: flights counterpart of contest-teams.ts (AUG-877). Turns a real
// Contest plus a caller-supplied FlightRule into per-flight standings, built the
// same way the contest screen builds the individual leaderboard. Pure and
// UI-free. The flight rule is not persisted (the store has no flight field), so
// the caller supplies it; adding a store field is out of scope.

/**
 * Resolve the active round's course, groups and de-duplicated players using the
 * same selection as `contestTeamStandings` (contest-teams.ts:25-33,58-63) and
 * the store's `getActiveGroups`: an explicit `roundId` wins, else the tournament
 * current round, else the contest's own groups. The round's own course falls
 * back to the contest course. Players are de-duplicated by id, keeping the first
 * occurrence, so a player in two groups is counted once. Reads are type-only and
 * never mutate the contest.
 */
function resolveActiveField(
  contest: Contest,
  roundId?: string,
): { players: Player[]; course: Course; groups: ContestGroup[] } {
  let round: RoundInfo | undefined;
  let groups: ContestGroup[];
  if (roundId !== undefined) {
    round = contest.rounds?.find((candidate) => candidate.id === roundId);
    groups = round?.groups ?? [];
  } else if (contest.isTournament && contest.rounds && contest.currentRound) {
    round = contest.rounds.find((candidate) => candidate.number === contest.currentRound);
    groups = round?.groups ?? [];
  } else {
    groups = contest.groups;
  }

  const course = round?.course ?? contest.course;

  const playersById = new Map<string, Player>();
  for (const group of groups) {
    for (const player of group.players) {
      if (!playersById.has(player.id)) playersById.set(player.id, player);
    }
  }

  return { players: [...playersById.values()], course, groups };
}

/**
 * Pure adapter from a `Contest` and a caller-supplied `FlightRule` to
 * `FlightStanding[]`. Builds the individual leaderboard the same way the contest
 * screen does — `buildLeaderboard(players, course, rankMode).rows` — then splits
 * it into flight-local ranks and ties via `flightStandings`.
 *
 * The effective rank mode is resolved by `buildLeaderboard`: a requested `net`
 * on a course that cannot be ranked net falls back to gross, and the standings
 * then carry the effective mode's totals (gross strokes, or net total/to-par).
 *
 * Rule errors (a `RangeError` from `validateBands`, or empty manual names)
 * propagate unchanged. A contest with zero active players returns flights with
 * empty standings and does not throw.
 */
export function contestFlightStandings(
  contest: Contest,
  rule: FlightRule,
  opts: { rankMode: RankMode; roundId?: string },
): ContestFlightStandings {
  const { players, course, groups } = resolveActiveField(contest, opts.roundId);
  const { rows, mode } = buildLeaderboard(players, course, opts.rankMode);
  const standings = flightStandings(rows, players, rule, { holeCount: course.holes.length, groups });
  Object.defineProperty(standings, "effectiveRankMode", { value: mode, enumerable: false });
  return standings as ContestFlightStandings;
}
