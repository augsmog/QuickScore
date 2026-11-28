import type { GameType, SettlementSummary } from '../../engine/types';
import { netPayments } from '../../services/net-payments';
export { netPayments };

/** Most payment lines the card shows before "+ N more in the app". */
export const TICKET_MAX_PAYMENTS = 5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dollars = (amount: number) => `$${Math.abs(amount).toFixed(2)}`;

/** Payment lines hold two names: a long full name becomes first name and last initial. */
export function shortName(name: string, longest = 14): string {
  const parts = name.trim().split(/\s+/);
  if (name.trim().length <= longest || parts.length < 2) return name.trim();
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * "29 Oct 2026". A plain date is shown as stored. A full timestamp is shown as the day it was
 * on the phone that is sharing, so an evening round is not dated tomorrow.
 */
export function playedOn(iso: string | undefined): string {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (plain) return MONTHS[Number(plain[2]) - 1] ? `${Number(plain[3])} ${MONTHS[Number(plain[2]) - 1]} ${plain[1]}` : '';
  const when = iso ? new Date(iso) : null;
  if (!when || Number.isNaN(when.getTime())) return '';
  return `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;
}

/** Standings rows that fit under a given number of payment lines. */
export const finishRoom = (paymentLines: number) => (paymentLines >= 5 ? 3 : paymentLines === 4 ? 4 : 6);

/** Presentation only. Every amount comes from the settlement's own ledger. */
export function buildTicketModel(settlement: SettlementSummary, details: { title: string; course: string; playedAt?: string; games: GameType[]; betUnit: number }) {
  if (settlement.pending) return null;
  const all = netPayments(settlement.transactions);
  const payments = all.slice(0, TICKET_MAX_PAYMENTS).map(p => ({ from: shortName(p.from), to: shortName(p.to), amount: dollars(p.amount) }));
  const allSquare = all.length === 0;
  const finish = Object.entries(settlement.netByPlayer)
    .map(([name, net]) => ({ name, cents: Math.round(net * 100) }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
    .map(({ name, cents }) => ({ name, amount: `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${dollars(cents / 100)}`, tone: cents > 0 ? 'up' as const : cents < 0 ? 'down' as const : 'even' as const }));
  const count = new Set(details.games).size;
  return {
    heading: `${allSquare ? 'ALL SQUARE' : 'PAY UP'} · ${details.title.trim().toUpperCase()}`,
    allSquare, payments, more: Math.max(0, all.length - TICKET_MAX_PAYMENTS),
    // The card is a fixed size: the more payment lines, the fewer standings fit under them.
    finish: finish.slice(0, finishRoom(payments.length)), moreFinish: Math.max(0, finish.length - finishRoom(payments.length)),
    course: details.course, played: playedOn(details.playedAt),
    game: `${count} game${count === 1 ? '' : 's'} · $${Number.isInteger(details.betUnit) ? details.betUnit : details.betUnit.toFixed(2)} a unit`,
    note: allSquare ? 'Play it again to settle it?' : 'No hard feelings. Rematch?',
    download: 'snapscore.autumn8.me',
  };
}
export type TicketModel = NonNullable<ReturnType<typeof buildTicketModel>>;
