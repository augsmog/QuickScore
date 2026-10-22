import { Player, Course, SkinsResult, SkinResult, GameConfig } from "../types";

export function skinsModeLabel(config?: GameConfig): string {
  return config?.skinsMode === "gross" ? "Gross skins" : "Net skins";
}

export function calcSkins(
  players: Player[],
  course: Course,
  carryover: boolean = false,
  mode: "net" | "gross" = "net"
): SkinsResult {
  let pot = 0;
  const skins: SkinResult[] = [];
  const skinCount: Record<string, number> = {};
  players.forEach((p) => (skinCount[p.name] = 0));

  for (let i = 0; i < course.holes.length; i++) {
    pot++;
    const scores = players.map((p) => {
      const handicap = Math.round(p.handicap || 0);
      // Full course handicap, allocated by stroke index; supports plus handicaps.
      const strokes = Math.floor(handicap / 18) + (course.holes[i].hcp <= ((handicap % 18 + 18) % 18) ? 1 : 0);
      return { name: p.name, score: p.scores[i] > 0 ? p.scores[i] - (mode === "net" ? strokes : 0) : Infinity };
    });
    const min = Math.min(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === min);

    if (winners.length === 1) {
      skins.push({ hole: i + 1, winner: winners[0].name, value: pot });
      skinCount[winners[0].name] += pot;
      pot = 0;
    } else if (!carryover) {
      skins.push({ hole: i + 1, winner: "Push", value: 0 });
      pot = 0;
    } else {
      skins.push({ hole: i + 1, winner: "Carry", value: 0 });
    }
  }

  return { skins, totals: skinCount, remaining: pot };
}
