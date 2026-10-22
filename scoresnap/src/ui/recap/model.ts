import type { GameConfig, GameType, SettlementSummary } from '../../engine/types';
import { skinsLabel } from '../../engine/calculators/skins';

export const recapMoney = (net: number): string => {
  const cents = Math.round(net * 100);
  return cents === 0 ? 'Even' : `${cents > 0 ? '+' : '-'}$${(Math.abs(cents) / 100).toFixed(2)}`;
};

/** Presentation only: all amounts come from the settlement's rounded ledger. */
export function buildRecapModel(settlement: SettlementSummary, details: {
  title: string; course: string; games: GameType[]; gameConfig?: GameConfig;
  liveUrl?: string; completed: boolean;
}) {
  const players = Object.entries(settlement.netByPlayer)
    .map(([name, net]) => ({ name, net, amount: recapMoney(net) }))
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const winners = players.filter(p => p.net > 0 && p.net === players[0]?.net);
  const lines = [...new Set(details.games)]
    .filter(game => ['skins', 'skins_carry', 'nassau', 'nassau_press'].includes(game))
    .map(game => {
      const nets: Record<string, number> = {};
      for (const t of settlement.transactions.filter(t => t.gameType === game)) {
        const cents = Math.round(t.amount * 100);
        nets[t.to] = (nets[t.to] ?? 0) + cents;
        nets[t.from] = (nets[t.from] ?? 0) - cents;
      }
      const leaders = Object.entries(nets).filter(([, cents]) => cents > 0)
        .sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
      const label = game.startsWith('skins')
        ? `${skinsLabel(details.gameConfig)}${game === 'skins_carry' ? ' · carryover' : ''}`
        : game === 'nassau_press' ? 'Nassau + presses' : 'Nassau';
      return `${label}: ${leaders.length ? leaders.map(([name, cents]) => `${name} ${recapMoney(cents / 100)}`).join(' · ') : 'No net payouts'}`;
    });
  return { ...details, players, winner: winners[0] ?? null, winners, lines,
    headline: winners.length > 1 ? 'Shared honors' : winners.length ? 'What a round!' : 'All square',
    winnerNames: winners.map(p => p.name).join(' & '),
  };
}
export type RecapModel = ReturnType<typeof buildRecapModel>;
