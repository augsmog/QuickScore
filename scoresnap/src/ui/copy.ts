/** Signed currency for round results, rounded to cents. */
export function signedRoundAmount(amount: number): string {
  const cents = Math.round(amount * 100);
  return `${cents < 0 ? '−' : '+'}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
export const settlementLeader = (name: string, final: boolean): string =>
  `${name} ${final ? 'finished on top' : 'is on top'}`;
export const roundProgressNotice = (final: boolean): string | null =>
  final ? null : 'Current standings · results may change';
