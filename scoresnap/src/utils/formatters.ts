export function formatToPar(toPar: number): string {
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

export function formatMoney(amount: number): string {
  return `$${Math.abs(amount).toFixed(0)}`;
}

export function formatMoneyWithSign(amount: number): string {
  if (amount === 0) return "Even";
  return amount > 0 ? `+$${amount.toFixed(0)}` : `-$${Math.abs(amount).toFixed(0)}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
