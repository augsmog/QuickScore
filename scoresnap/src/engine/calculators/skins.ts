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
    ...group, result: calcSkins(group.players, course, carryover, config?.skinsMode, config),
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
  mode: "net" | "gross" = "net",
  config?: GameConfig
): SkinsResult {
  if (config?.rulesVersion === 1 && (config.skinsTier && config.skinsTier !== "flat" || config.birdieMultiplier || config.validationRule || config.teamSkins)) {
    return calcVariationSkins(players, course, carryover, mode, config);
  }
  let pot = 0;
  const skins: SkinResult[] = [];
  const skinCount: Record<string, number> = {};
  players.forEach((p) => (skinCount[p.name] = 0));

  for (let i = 0; i < course.holes.length; i++) {
    if (!players.some((p) => p.scores[i] > 0)) continue;
    pot++;
    const scores = players.map((p) => {
      const strokes = handicapStrokesForHole(config?.rulesVersion === 1 ? p.courseHandicaps?.[course.name] ?? p.handicap : p.handicap, course.holes[i].hcp);
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

/** Weighted skins use the same per-player entitlement ledger as ordinary skins. */
function calcVariationSkins(players: Player[], course: Course, carryover: boolean, mode: "net" | "gross", config: GameConfig): SkinsResult {
  if (config.validationRule && !carryover) throw new Error("Validation requires Carryover Skins");
  const totals = Object.fromEntries(players.map(p => [p.name, 0]));
  const competitors: Player[][] = config.teamSkins
    ? [...new Set(players.map(p => p.team))].map(team => players.filter(p => p.team === team))
    : players.map(p => [p]);
  if (config.teamSkins && (competitors.length < 2 || competitors.some(t => t.length !== 2 || !t[0].team))) throw new Error("Team Skins requires at least two complete pairs in each scope");
  let pot = 0;
  let pending: { members: Player[]; original: number; award: number; row: SkinResult } | undefined;
  const skins: SkinResult[] = [];
  const award = (members: Player[], value: number) => members.forEach(p => { totals[p.name] += value / members.length; });
  for (let i = 0; i < course.holes.length; i++) {
    if (players.some(p => !Number.isFinite(p.scores[i]) || p.scores[i] <= 0)) break;
    if (pending) {
      if (Math.min(...pending.members.map(p => p.scores[i])) <= course.holes[i].par) {
        award(pending.members, pending.award);
        pending.row.winner = pending.members.map(p => p.name).join(" + ");
        pending.row.value = pending.award;
      } else { pot += pending.original; pending.row.winner = "Carry"; }
      pending = undefined;
    }
    const unit = config.skinsTier === "tiered" ? Math.floor(i / 6) + 1 : config.skinsTier === "progressive" ? i + 1 : 1;
    const carried = pot;
    pot += unit;
    const scores = competitors.map(members => ({members,score:Math.min(...members.map(p => p.scores[i] - (mode === "net" ? handicapStrokesForHole(p.courseHandicaps?.[course.name] ?? p.handicap, course.holes[i].hcp) : 0)))}));
    const min = Math.min(...scores.map(s => s.score));
    const winners = scores.filter(s => s.score === min);
    if (winners.length !== 1) {
      skins.push({hole:i+1,winner:carryover ? "Carry" : "Push",value:0});
      if (!carryover) pot = 0;
      continue;
    }
    const members = winners[0].members;
    const grossDiff = Math.min(...members.map(p => p.scores[i])) - course.holes[i].par;
    const multiplier = config.birdieMultiplier ? grossDiff <= -2 ? 3 : grossDiff === -1 ? 2 : 1 : 1;
    const value = carried + unit * multiplier;
    const row = {hole:i+1,winner:members.map(p => p.name).join(" + "),value};
    skins.push(row);
    if (config.validationRule && carried > 0 && i < 17) {
      pending = {members,original:pot,award:value,row};
      row.winner = "Pending"; row.value = 0;
    } else award(members,value);
    pot = 0;
  }
  return {skins,totals,remaining:pot + (pending?.original ?? 0)};
}
