export function playersNeedingPar<T extends { scores: number[] }>(players: T[], currentHole: number): T[] {
  return players.filter((p) => (p.scores[currentHole - 1] || 0) <= 0);
}

export function allScoredOnHole<T extends { scores: number[] }>(players: T[], currentHole: number): boolean {
  return playersNeedingPar(players, currentHole).length === 0;
}
