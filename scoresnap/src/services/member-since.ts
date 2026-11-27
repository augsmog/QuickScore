/**
 * The year to show after "Member since", or null to show no such line.
 * A guest has none. A signed-in user gets the year the server says the account was created.
 * An unknown date gives null: the line is left out rather than guessed.
 */
export function memberSinceYear(user: { provider?: string; createdAt?: string } | null | undefined): number | null {
  if (!user || user.provider === "anonymous" || !user.provider || !user.createdAt) return null;
  const year = new Date(user.createdAt).getFullYear();
  return Number.isFinite(year) ? year : null;
}
