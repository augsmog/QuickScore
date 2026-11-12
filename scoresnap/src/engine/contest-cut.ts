import type { Contest } from "../stores/contest-store";
import { applyCut, type CutLineResult, type CutRule } from "./cut-line";
import { buildLeaderboard, type RankMode } from "./calculators/leaderboard-view";
import type { Player } from "./types";

export interface ContestCutStanding {
  playerId: string;
  total: number;
  thru: "F" | null;
}

export interface ContestCutResult {
  result: CutLineResult;
  standings: ContestCutStanding[];
  mode: RankMode;
}

function roundPlayers(contest: Contest, roundNumber: number): Player[] {
  const round = contest.rounds?.find((candidate) => candidate.number === roundNumber);
  if (!round) return [];
  const unique = new Map<string, Player>();
  for (const group of round.groups) {
    for (const player of group.players) {
      if (!unique.has(player.id)) unique.set(player.id, player);
    }
  }
  return [...unique.values()];
}

function hasCompleteCard(player: Player, holeCount: number): boolean {
  return holeCount > 0 && player.scores.length >= holeCount &&
    player.scores.slice(0, holeCount).every((score) => score > 0);
}

/**
 * Calculate a pure cumulative cut after round K. A player is eligible only
 * after completing every included round; withdrawn and no-show players miss.
 */
export function contestCutAfterRound(
  contest: Contest,
  rule: CutRule,
  opts: { afterRound: number; rankMode: RankMode },
): ContestCutResult | "unsupported" {
  const rounds = contest.rounds ?? [];
  if (!contest.isTournament || !rounds.length) {
    throw new RangeError("Contest must be a multi-round tournament");
  }
  const selected = rounds.filter((round) => round.number <= opts.afterRound).sort((a, b) => a.number - b.number);
  if (!selected.some((round) => round.number === opts.afterRound)) {
    throw new RangeError("afterRound must match a contest round");
  }
  const lastRound = Math.max(...rounds.map((round) => round.number));
  if (opts.afterRound >= lastRound) {
    throw new RangeError("A later round must remain after the cut");
  }
  if (contest.gameConfig?.rulesVersion === 1 &&
      contest.games.some((game) => game === "alternate_shot" || game === "chapman")) {
    return "unsupported";
  }

  const playersById = new Map<string, Player>();
  const roundPlayersByNumber = new Map<number, Player[]>();
  for (const round of selected) {
    const players = roundPlayers(contest, round.number);
    roundPlayersByNumber.set(round.number, players);
    for (const player of players) {
      if (!playersById.has(player.id)) playersById.set(player.id, player);
    }
  }

  let mode: RankMode = opts.rankMode;
  if (mode === "net") {
    for (const round of selected) {
      const course = round.course ?? contest.course;
      if (buildLeaderboard(roundPlayersByNumber.get(round.number) ?? [], course, "net").mode !== "net") {
        mode = "gross";
        break;
      }
    }
  }

  const totalById = new Map<string, number>();
  const completedById = new Map<string, boolean>();
  const inactiveById = new Map<string, boolean>();
  for (const round of selected) {
    const players = roundPlayersByNumber.get(round.number) ?? [];
    const course = round.course ?? contest.course;
    const results = buildLeaderboard(players, course, mode).rows;
    for (const row of results) {
      totalById.set(row.playerId, (totalById.get(row.playerId) ?? 0) + row.total);
    }
    const playerById = new Map(players.map((player) => [player.id, player]));
    for (const [playerId, player] of playersById) {
      const roundPlayer = playerById.get(playerId);
      const complete = !!roundPlayer && hasCompleteCard(roundPlayer, course.holes.length);
      completedById.set(playerId, (completedById.get(playerId) ?? true) && complete);
      inactiveById.set(playerId,
        (inactiveById.get(playerId) ?? false) || roundPlayer?.status === "WD" || roundPlayer?.status === "NS");
    }
  }

  const standings: ContestCutStanding[] = [...playersById.keys()]
    .map((playerId, index) => ({
      playerId,
      total: totalById.get(playerId) ?? 0,
      thru: completedById.get(playerId) && !inactiveById.get(playerId) ? "F" as const : null,
      index,
    }))
    .sort((a, b) => a.total - b.total || a.index - b.index)
    .map(({ playerId, total, thru }) => ({ playerId, total, thru }));

  return { result: applyCut(standings, rule), standings, mode };
}

/** Return the selected round's players who made the cut, without mutating inputs. */
export function contestFieldForRound(
  contest: Contest,
  roundNumber: number,
  cut: CutLineResult,
): Player[] {
  const missed = new Set(cut.missed);
  return roundPlayers(contest, roundNumber).filter((player) => !missed.has(player.id));
}
