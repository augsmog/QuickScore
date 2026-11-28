import { buildTicketModel, type TicketModel } from './pay-up-ticket-model';

const tx = (from: string, to: string, amount: number) => ({ from, to, amount, gameType: 'skins' as const });
const make = (transactions: ReturnType<typeof tx>[], netByPlayer: Record<string, number>, details: Partial<Parameters<typeof buildTicketModel>[1]> = {}) =>
  buildTicketModel({ transactions, netByPlayer }, { title: 'Saturday foursome', course: 'Royal Greens Golf & Country Club (Purple)', playedAt: '2026-11-14', games: ['skins', 'nassau'], betUnit: 5, ...details }) as TicketModel;

/** Made-up rounds for the design preview only. */
export const sampleTickets: { label: string; model: TicketModel }[] = [
  { label: 'Two players', model: make([tx('Augie', 'Matt', 5)], { Matt: 5, Augie: -5 }, { title: 'Thursday round', playedAt: '2026-10-29', games: ['skins'] }) },
  { label: 'Foursome, 4 payments', model: make([tx('Dave', 'Matt', 25), tx('Chris', 'Matt', 10), tx('Dave', 'Augie', 5), tx('Chris', 'Augie', 5)], { Matt: 35, Augie: 10, Chris: -15, Dave: -30 }) },
  { label: 'All square', model: make([], { Matt: 0, Augie: 0 }, { title: 'Thursday round', playedAt: '2026-10-29', games: ['skins'] }) },
  { label: 'Long names, 7 payments', model: make(
    [tx('Maximilian Oberholtzer', 'Christopher Vandenberghe', 30), tx('Bartholomew Fitzgerald', 'Christopher Vandenberghe', 15), tx('Bartholomew Fitzgerald', 'Augustine Jones', 5),
      tx('Sam', 'Christopher Vandenberghe', 4), tx('Pat', 'Christopher Vandenberghe', 3), tx('Lee', 'Augustine Jones', 2), tx('Kim', 'Augustine Jones', 1)],
    { 'Christopher Vandenberghe': 52, 'Augustine Jones': 8, 'Bartholomew Fitzgerald': -20, 'Maximilian Oberholtzer': -30, Sam: -4, Pat: -3, Lee: -2, Kim: -1 },
    { title: 'Member-Guest Invitational', course: 'The Links at Spanish Bay Golf & Country Club (Championship)', games: ['skins', 'nassau', 'stableford'], betUnit: 10 }) },
];
