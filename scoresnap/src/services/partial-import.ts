/**
 * Pure reviewed partial-scorecard model for AUG-348 / AUG-529.
 * This module intentionally has no store, React, persistence, or network imports.
 */
import type { ScannedPlayer } from "./score-parser";
import { grossScore } from "./ocr-review";

export interface PartialImportTarget {
  id: string;
  name: string;
  /** Existing gross scores keyed by course hole identity. */
  scores: Readonly<Record<number, number | null | undefined>>;
}

export interface PartialImportCell {
  playerId: string;
  hole: number;
  strokes: number;
}

export type PartialImportResult =
  | { ok: true; patch: PartialImportCell[]; complete: boolean }
  | { ok: false; blockers: string[] };

export interface PartialImportInput {
  rows: readonly ScannedPlayer[];
  players: readonly PartialImportTarget[];
  holeIdentities: readonly number[];
  playedHoles: ReadonlySet<number>;
  coverage: "full-group" | "sparse";
}

/** OCR readings below this reviewed confidence threshold cannot be imported. */
export const MIN_PARTIAL_IMPORT_CONFIDENCE = 0.75;

export function buildPartialImport(input: PartialImportInput): PartialImportResult {
  const blockers: string[] = [];
  const { rows, players, holeIdentities, playedHoles } = input;
  const add = (message: string) => { if (!blockers.includes(message)) blockers.push(message); };

  if (!players.length) add("Target round has no players");
  if (!rows.length) add("No reviewed scanned players");
  if (!holeIdentities.length || holeIdentities.some(h => !Number.isInteger(h) || h < 1 || h > 18) ||
      new Set(holeIdentities).size !== holeIdentities.length) add("Hole identities must be unique course holes from 1 to 18");
  for (const hole of playedHoles) {
    if (!holeIdentities.includes(hole)) add(`Played hole ${hole} is not in the target round`);
  }
  if (!playedHoles.size) add("No explicitly played holes were selected");

  const targetById = new Map<string, PartialImportTarget>();
  for (const player of players) {
    if (!player.id || targetById.has(player.id)) add(`Target roster has duplicate or empty player id ${player.id || "(empty)"}`);
    targetById.set(player.id, player);
  }

  const key = (name: string) => name.trim().toLowerCase();
  const mapped = new Map<string, ScannedPlayer>();
  for (const row of rows) {
    let target: PartialImportTarget | undefined;
    if (row.matchedPlayerId) {
      target = targetById.get(row.matchedPlayerId);
      if (!target) {
        add(`Scanned player ${row.name} has unmapped player id ${row.matchedPlayerId}`);
        continue;
      }
    } else {
      const matches = players.filter(p => key(p.name) === key(row.name));
      if (matches.length > 1) {
        add(`Scanned player ${row.name} has ambiguous roster name mapping`);
        continue;
      }
      if (!matches.length) {
        add(`Scanned player ${row.name} is unmapped to the target roster`);
        continue;
      }
      target = matches[0];
    }
    if (mapped.has(target.id)) {
      add(`Multiple scanned rows map to target player ${target.name} (${target.id})`);
      continue;
    }
    mapped.set(target.id, row);
  }

  const missingPlayers = players.filter(p => !mapped.has(p.id));
  const complete = missingPlayers.length === 0;
  if (input.coverage === "full-group") {
    for (const player of missingPlayers) add(`Full-group review is missing roster player ${player.name} (${player.id})`);
  }

  const patch: PartialImportCell[] = [];
  for (const [playerId, row] of mapped) {
    const player = targetById.get(playerId)!;
    const rowHoles = row.requiredHoles ?? holeIdentities;
    if (row.alignmentError) add(`Scanned player ${row.name}: ${row.alignmentError}`);
    for (const hole of playedHoles) {
      const index = rowHoles.indexOf(hole);
      if (index < 0) {
        add(`Scanned player ${row.name} has no reviewed cell for played hole ${hole}`);
        continue;
      }
      const strokes = grossScore(row.scores[index]);
      const confidence = row.confidence[index];
      if (strokes === null) {
        add(`Scanned player ${row.name} has a missing or unreadable score on played hole ${hole}`);
        continue;
      }
      if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < MIN_PARTIAL_IMPORT_CONFIDENCE) {
        add(`Scanned player ${row.name} has low-confidence score on played hole ${hole}`);
        continue;
      }
      const existing = player.scores[hole];
      if (existing !== undefined && existing !== null && existing !== 0) {
        const existingGross = grossScore(existing);
        if (existingGross === null) {
          add(`Target player ${player.name} has an invalid existing score on hole ${hole}`);
          continue;
        }
        if (existingGross !== strokes) {
          add(`Score conflict for ${player.name} on hole ${hole}: existing ${existingGross}, reviewed ${strokes}`);
          continue;
        }
        // An identical score is already present; leave it out of the patch.
        continue;
      }
      patch.push({ playerId, hole, strokes });
    }
  }

  if (blockers.length) return { ok: false, blockers };
  patch.sort((a, b) => a.playerId.localeCompare(b.playerId) || a.hole - b.hole);
  return { ok: true, patch, complete };
}
