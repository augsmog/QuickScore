import { Player, Course, SkinsResult, SkinResult, GameConfig } from "../types";

export function skinsModeLabel(config?: GameConfig): string {
  return config?.skinsMode === "gross" ? "Gross skins" : "Net skins";
}

export function skinsLabel(config?: GameConfig): string {
  return skinsModeLabel(config) + " · " + (config?.skinsScope === "group" ? "Each group" : "Whole field");
}

/** Shared competition boundaries for Games and Settlement. */
export function skinsGroups(groups: { name: string; players: Player[] }[], config?: GameConfig) {
  return config?.skinsScope === "group"
    ? groups
    : [{ name: "Whole field", players: groups.flatMap(g => g.players) }];
}

export function calcScopedSkins(groups: { name: string; players: Player[] }[], course: Course, carryover = false, config?: GameConfig) {
  return skinsGroups(groups, config).map(group => ({
    ...group, result: calcSkins(group.players, course, carryover, config?.skinsMode),
  }));
}

/** Full course handicap allocated by stroke index, including plus handicaps. */
export function handicapStrokesForHole(handicap: number | undefined, strokeIndex: number): number {
  const rounded = Math.round(handicap || 0);
  return Math.floor(rounded / 18) + (strokeIndex <= ((rounded % 18 + 18) % 18) ? 1 : 0);
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
    if (!players.some((p) => p.scores[i] > 0)) continue;
    pot++;
    const scores = players.map((p) => {
      const strokes = handicapStrokesForHole(p.handicap, course.holes[i].hcp);
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
