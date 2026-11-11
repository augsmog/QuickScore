import type { BuildLeaderboardRowsOptions, LeaderboardRow } from "./leaderboard-rows";
import { buildLeaderboardRows } from "./leaderboard-rows";
import type { Player, StrokePlayResult } from "./types";

export type FlightRule =
  | { mode: "bands"; bands: { name: string; maxHandicap: number }[] }
  | { mode: "manual"; assignments: Record<string, string>; fallback?: string };

export interface Flight {
  name: string;
  players: Player[];
}

export interface FlightStanding {
  name: string;
  standings: LeaderboardRow[];
}

/** Assign players to flights in rule order without mutating the inputs. */
export function assignFlights(players: Player[], rule: FlightRule): Flight[] {
  if (rule.mode === "bands") {
    validateBands(rule.bands);
    return rule.bands.map((band, index) => ({
      name: band.name,
      players: players.filter((player) => {
        const abovePrevious = index === 0 || player.handicap > rule.bands[index - 1].maxHandicap;
        const withinMaximum = index === rule.bands.length - 1 || player.handicap <= band.maxHandicap;
        return abovePrevious && withinMaximum;
      }),
    }));
  }

  const names: string[] = [];
  for (const name of Object.values(rule.assignments)) {
    if (!name.trim()) throw new RangeError("Manual flight names must not be empty");
    if (!names.includes(name)) names.push(name);
  }
  const unassigned = players.some((player) => rule.assignments[player.id] === undefined);
  if (rule.fallback !== undefined && unassigned) {
    if (!rule.fallback.trim()) throw new RangeError("Fallback flight name must not be empty");
    if (!names.includes(rule.fallback)) names.push(rule.fallback);
  }

  const unflightedName = rule.fallback ?? "Unflighted";
  if (unassigned && !names.includes(unflightedName)) names.push(unflightedName);

  return names.map((name) => ({
    name,
    players: players.filter((player) => (rule.assignments[player.id] ?? unflightedName) === name),
  }));
}

/** Build independent, flight-local ranks and ties from the caller's standings rows. */
export function flightStandings(
  results: StrokePlayResult[],
  players: Player[],
  rule: FlightRule,
  opts: BuildLeaderboardRowsOptions,
): FlightStanding[] {
  return assignFlights(players, rule).map((flight) => {
    const playerIds = new Set(flight.players.map((player) => player.id));
    const flightResults = results.filter((result) => playerIds.has(result.playerId));
    return {
      name: flight.name,
      standings: buildLeaderboardRows(flightResults, flight.players, opts),
    };
  });
}

function validateBands(bands: { name: string; maxHandicap: number }[]): void {
  if (bands.length === 0) throw new RangeError("At least one handicap band is required");
  const names = new Set<string>();
  let previous = Number.NEGATIVE_INFINITY;
  for (const band of bands) {
    if (!band.name.trim()) throw new RangeError("Band names must not be empty");
    if (names.has(band.name)) throw new RangeError(`Duplicate flight name: ${band.name}`);
    names.add(band.name);
    if (!Number.isFinite(band.maxHandicap)) throw new RangeError("Band maxima must be finite numbers");
    if (band.maxHandicap < previous) throw new RangeError("Handicap bands must be sorted by maxHandicap");
    previous = band.maxHandicap;
  }
}
