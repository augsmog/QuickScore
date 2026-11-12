import type { Contest } from '../stores/contest-store';
import type { GameType, SettlementSummary } from './types';
import { calculateContestSettlement, scopedAuxiliary, scopeKey } from './contest-results';

export interface GroupSettlements {
  groups: Array<{ groupId: string; summary: SettlementSummary }>;
  field?: SettlementSummary;
  allGroups: SettlementSummary;
}

// Match the event boundaries in contest-results and the additional group games
// delegated to calculateSettlement. Field games retain their existing economy.
const GROUP_GAMES: ReadonlySet<GameType> = new Set([
  'wolf', 'hammer', 'snake', 'greenies', 'bingo_bango_bongo',
  'alternate_shot', 'chapman', 'match_play', 'nassau', 'nassau_press',
  'vegas', 'sixes', 'rabbit',
]);

/** Preserve raw transactions until the last cent rounding; never net across groups. */
function combine(summaries: SettlementSummary[], names: string[]): SettlementSummary {
  const netByPlayer = Object.fromEntries(names.map(name => [name, 0]));
  if (summaries.some(summary => summary.pending)) {
    return { transactions: [], netByPlayer, pending: true };
  }
  const transactions = summaries.flatMap(summary => summary.transactions);
  for (const t of transactions) {
    netByPlayer[t.from] = (netByPlayer[t.from] ?? 0) - t.amount;
    netByPlayer[t.to] = (netByPlayer[t.to] ?? 0) + t.amount;
  }
  for (const name of Object.keys(netByPlayer)) {
    netByPlayer[name] = Math.round(netByPlayer[name] * 100) / 100;
  }
  return { transactions, netByPlayer };
}

/** Split a versioned contest into independent group ledgers and its field ledger. */
export function calculateGroupSettlements(
  contest: Contest,
  games: GameType[] = contest.games,
  bet = contest.betUnit,
): GroupSettlements {
  if (contest.gameConfig?.rulesVersion !== 1) {
    return { groups: [], allGroups: calculateContestSettlement(contest, games, bet) };
  }
  const groupGames = games.filter(game => GROUP_GAMES.has(game) ||
    ((game === 'skins' || game === 'skins_carry') && contest.gameConfig?.skinsScope === 'group'));
  const fieldGames = games.filter(game => !groupGames.includes(game));
  const rounds = contest.isTournament && contest.rounds?.length
    ? contest.rounds : [{ id: undefined, course: contest.course, groups: contest.groups }];
  const byGroup = new Map<string, { summaries: SettlementSummary[]; names: Set<string> }>();
  for (const round of rounds) for (const group of round.groups) {
    const entry = byGroup.get(group.id) ?? { summaries: [], names: new Set<string>() };
    group.players.forEach(player => entry.names.add(player.name));
    const auxiliary = scopedAuxiliary(contest, group.id, round.id);
    entry.summaries.push(calculateContestSettlement({
      ...contest, isTournament: false, rounds: undefined,
      course: round.course ?? contest.course, groups: [group],
      auxiliaryData: auxiliary, auxiliaryByScope: { [scopeKey(undefined, group.id)]: auxiliary },
    }, groupGames, bet));
    byGroup.set(group.id, entry);
  }
  const groups = [...byGroup].map(([groupId, entry]) => ({
    groupId, summary: combine(entry.summaries, [...entry.names]),
  }));
  const field = fieldGames.length ? calculateContestSettlement(contest, fieldGames, bet) : undefined;
  return {
    groups,
    ...(field ? { field } : {}),
    allGroups: combine([...groups.map(group => group.summary), ...(field ? [field] : [])],
      contest.groups.flatMap(group => group.players.map(player => player.name))),
  };
}
