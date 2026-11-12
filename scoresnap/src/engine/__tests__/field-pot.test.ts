import { computeFieldPot } from "../field-pot";
import type { GameConfig } from "../types";
import type { LeaderboardRow } from "../leaderboard-rows";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

function row(playerId: string, total: number, thru: LeaderboardRow["thru"] = "F"): Pick<LeaderboardRow, "playerId" | "total" | "thru"> {
  return { playerId, total, thru };
}

function pool(...playerIds: string[]) {
  return playerIds.map((playerId) => ({ playerId }));
}

const fee = (potEntryFee?: number): GameConfig => ({ potEntryFee });

describe("computeFieldPot", () => {
  it("pays the whole pot to a single winner", () => {
    const result = computeFieldPot("stroke_play", fee(10), pool("a", "b", "c"), [
      row("a", 70), row("b", 71), row("c", 72),
    ]);
    expect(result).toEqual({ total: 3000, winners: ["a"], perWinner: 3000, remainderCents: 0 });
  });

  it("splits an even pot between a two-way tie", () => {
    const result = computeFieldPot("stroke_play", fee(1), pool("a", "b", "c", "d"), [
      row("a", 70), row("b", 70), row("c", 71), row("d", 72),
    ]);
    expect(result).toEqual({ total: 400, winners: ["a", "b"], perWinner: 200, remainderCents: 0 });
  });

  it("reports the leftover cent from an uneven two-way split instead of inventing or dropping it", () => {
    const result = computeFieldPot("stroke_play", fee(0.75), pool("a", "b", "c"), [
      row("a", 70), row("b", 70), row("c", 75),
    ]);
    expect(result).toEqual({ total: 225, winners: ["a", "b"], perWinner: 112, remainderCents: 1 });
  });

  it("splits an uneven pot across a three-way tie", () => {
    const result = computeFieldPot("stroke_play", fee(1), pool("a", "b", "c", "d"), [
      row("a", 70), row("b", 70), row("c", 70), row("d", 80),
    ]);
    expect(result).toEqual({ total: 400, winners: ["a", "b", "c"], perWinner: 133, remainderCents: 1 });
  });

  it("returns a no-pot result for a group-scope game regardless of fee", () => {
    const result = computeFieldPot("wolf", fee(10), pool("a", "b"), [row("a", 70), row("b", 71)]);
    expect(result).toEqual({ total: 0, winners: [], perWinner: 0, remainderCents: 0 });
  });

  it("returns a no-pot result when the fee is missing", () => {
    const result = computeFieldPot("stroke_play", fee(undefined), pool("a", "b"), [row("a", 70), row("b", 71)]);
    expect(result).toEqual({ total: 0, winners: [], perWinner: 0, remainderCents: 0 });
  });

  it("returns a no-pot result when the fee is zero", () => {
    const result = computeFieldPot("stroke_play", fee(0), pool("a", "b"), [row("a", 70), row("b", 71)]);
    expect(result).toEqual({ total: 0, winners: [], perWinner: 0, remainderCents: 0 });
  });

  it("returns a no-pot result for an empty pool", () => {
    const result = computeFieldPot("stroke_play", fee(10), [], [row("a", 70)]);
    expect(result).toEqual({ total: 0, winners: [], perWinner: 0, remainderCents: 0 });
  });

  it("still collects the pot when the pool outscores non-pool players, but only pool players can win it", () => {
    const result = computeFieldPot("stroke_play", fee(5), pool("b", "c"), [
      row("a", 60), row("b", 70), row("c", 71),
    ]);
    expect(result).toEqual({ total: 1000, winners: ["b"], perWinner: 1000, remainderCents: 0 });
  });

  it("excludes pool players who have not started from winner determination", () => {
    const result = computeFieldPot("stroke_play", fee(5), pool("a", "b"), [
      row("a", 70, null), row("b", 75),
    ]);
    expect(result).toEqual({ total: 1000, winners: ["b"], perWinner: 1000, remainderCents: 0 });
  });

  it("skins_carry with group skinsScope is not event-scope, so it returns a no-pot result", () => {
    const groupScoped: GameConfig = { potEntryFee: 10, skinsScope: "group" };
    const result = computeFieldPot("skins_carry", groupScoped, pool("a", "b"), [row("a", 70), row("b", 71)]);
    expect(result).toEqual({ total: 0, winners: [], perWinner: 0, remainderCents: 0 });
  });

  it("does not mutate the config, pool, or standings inputs", () => {
    const config = fee(10);
    const poolPlayers = pool("a", "b");
    const standings = [row("a", 70), row("b", 71)];
    const beforeConfig = JSON.stringify(config);
    const beforePool = JSON.stringify(poolPlayers);
    const beforeStandings = JSON.stringify(standings);
    computeFieldPot("stroke_play", config, poolPlayers, standings);
    expect(JSON.stringify(config)).toBe(beforeConfig);
    expect(JSON.stringify(poolPlayers)).toBe(beforePool);
    expect(JSON.stringify(standings)).toBe(beforeStandings);
  });
});
