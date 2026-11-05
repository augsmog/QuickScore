export type HoleChipShape = "circle" | "square";
export type HoleChipColor = "primary" | "error";

export interface LeaderboardHoleChip {
  score: number;
  index: number;
  difference: number;
  shape: HoleChipShape;
  color: HoleChipColor;
  filled: boolean;
}

/** Build only real, played holes so partial rounds never get placeholder chips. */
export function lastThreePlayedHoleChips(
  scores: number[],
  holes: Array<{ par: number }>,
): LeaderboardHoleChip[] {
  return scores
    .map((score, index) => ({ score, index, par: holes[index]?.par }))
    .filter(({ score, par }) => score > 0 && typeof par === "number" && Number.isFinite(par))
    .slice(-3)
    .map(({ score, index, par }) => {
      const difference = score - par!;
      return {
        score,
        index,
        difference,
        shape: difference <= 0 ? "circle" : "square",
        color: difference >= 2 ? "error" : "primary",
        filled: difference < 0 || difference >= 2,
      };
    });
}
