import type { Contest, RoundInfo } from "../stores/contest-store";
import type { Player } from "./types";
import { buildLeaderboard, type RankMode } from "./calculators/leaderboard-view";
import { applyCut, type CutLineResult, type CutRule } from "./cut-line";

export interface ContestCutResult {
  result: CutLineResult;
  standings: { playerId: string; total: number; thru: "F" | null }[];
  mode: RankMode;
}

/** Compute a cut from completed tournament rounds, using one consistent rank mode. */
export function contestCutAfterRound(
  contest: Contest,
  rule: CutRule,
  opts: { afterRound: number; rankMode: RankMode },
): ContestCutResult | "unsupported" {
  if (!contest.isTournament || !contest.rounds?.length) throw new RangeError("Contest must be a tournament with rounds");
  const rounds = [...contest.rounds].sort((a, b) => a.number - b.number);
  const targetIndex = rounds.findIndex((round) => round.number === opts.afterRound);
  if (targetIndex < 0 || targetIndex === rounds.length - 1) throw new RangeError("afterRound must identify a non-final contest round");
  const completedRounds = rounds.slice(0, targetIndex + 1);
  if (contest.gameConfig?.rulesVersion === 1 && contest.games.some((game) => game === "alternate_shot" || game === "chapman")) {
    return "unsupported";
  }

  const totals = new Map<string, number>();
  const complete = new Map<string, boolean>();
  const appearances = new Map<string, number>();
  const withdrawn = new Set<string>();
  const players = new Map<string, Player>();
  let mode: RankMode = opts.rankMode;
  const roundPlayersList: { round: RoundInfo; players: Player[] }[] = [];
  for (const round of completedRounds) {
    const roundPlayers = uniquePlayers(round);
    roundPlayersList.push({ round, players: roundPlayers });
    for (const player of roundPlayers) players.set(player.id, players.get(player.id) ?? player);
    for (const player of roundPlayers) if (player.status === "WD" || player.status === "NS") withdrawn.add(player.id);
    if (opts.rankMode === "net" && buildLeaderboard(roundPlayers, round.course ?? contest.course, "net").mode === "gross") mode = "gross";
  }

  for (const { round, players: roundPlayers } of roundPlayersList) {
    const leaderboard = buildLeaderboard(roundPlayers, round.course ?? contest.course, mode);
    for (const row of leaderboard.rows) {
      totals.set(row.playerId, (totals.get(row.playerId) ?? 0) + row.total);
      appearances.set(row.playerId, (appearances.get(row.playerId) ?? 0) + 1);
      const player = roundPlayers.find((candidate) => candidate.id === row.playerId)!;
      const cardComplete = round.course
        ? round.course.holes.every((hole) => (player.scores[hole.num - 1] ?? 0) > 0)
        : contest.course.holes.every((hole) => (player.scores[hole.num - 1] ?? 0) > 0);
      complete.set(row.playerId, (complete.get(row.playerId) ?? true) && cardComplete);
    }
  }

  const standings = [...players.values()].map((player) => ({
    playerId: player.id,
    total: totals.get(player.id) ?? 0,
    thru: withdrawn.has(player.id) || player.status === "WD" || player.status === "NS" || !complete.get(player.id) || appearances.get(player.id) !== completedRounds.length ? null : "F" as const,
  }));
  return { result: applyCut(standings, rule), standings, mode };
}

/** Return a round's field with cut players removed, preserving first-seen order. */
export function contestFieldForRound(contest: Contest, roundNumber: number, cut: CutLineResult): Player[] {
  const round = contest.rounds?.find((candidate) => candidate.number === roundNumber);
  if (!round) throw new RangeError("roundNumber must identify a contest round");
  const missed = new Set(cut.missed);
  return uniquePlayers(round).filter((player) => !missed.has(player.id));
}

function uniquePlayers(round: RoundInfo): Player[] {
  const byId = new Map<string, Player>();
  for (const group of round.groups) for (const player of group.players) if (!byId.has(player.id)) byId.set(player.id, player);
  return [...byId.values()];
}
