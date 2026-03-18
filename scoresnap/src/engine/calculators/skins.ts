import { Player, Course, SkinsResult, SkinResult } from "../types";

export function calcSkins(
  players: Player[],
  _course: Course,
  carryover: boolean = false
): SkinsResult {
  let pot = 0;
  const skins: SkinResult[] = [];
  const skinCount: Record<string, number> = {};
  players.forEach((p) => (skinCount[p.name] = 0));

  for (let i = 0; i < 18; i++) {
    pot++;
    const scores = players.map((p) => ({ name: p.name, score: p.scores[i] }));
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
