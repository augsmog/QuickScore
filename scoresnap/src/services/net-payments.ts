/** One line per pair of players: what one owes the other across every game, to the cent. */
export function netPayments(transactions: { from: string; to: string; amount: number }[]): { from: string; to: string; amount: number }[] {
  const pairs = new Map<string, number>();
  for (const t of transactions) {
    const forward = t.from < t.to;
    const key = forward ? `${t.from}\u0000${t.to}` : `${t.to}\u0000${t.from}`;
    pairs.set(key, (pairs.get(key) ?? 0) + (forward ? t.amount : -t.amount));
  }
  return [...pairs.entries()].map(([key, amount]) => {
    const [a, b] = key.split('\u0000');
    const cents = Math.round(Math.abs(amount) * 100);
    return amount >= 0 ? { from: a, to: b, amount: cents / 100 } : { from: b, to: a, amount: cents / 100 };
  }).filter(p => p.amount > 0).sort((x, y) => y.amount - x.amount || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
}
