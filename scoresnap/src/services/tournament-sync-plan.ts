/**
 * Pure tournament sync plan. Server ids come back from sync_round_bundle.
 * Scores go to write_score as versioned ops. Nothing here touches hole_scores
 * or deletes a player row when a foursome changes.
 */

export interface PlannedPlayer {
  id: string;
  name: string;
  handicap: number;
  team?: string | null;
  status?: 'active' | 'WD' | 'NS';
  courseHandicaps?: Record<string, number> | null;
}

export interface PlannedGroup {
  id: string;
  name: string;
  players: PlannedPlayer[];
  teeTime?: string;
  externalId?: string;
}

export interface PlannedRound {
  id: string;
  number: number;
  name: string;
  date?: string;
  course?: { name?: string } | null;
  groups: PlannedGroup[];
}

export interface ScoreInput {
  contestId: string;
  roundLocalId: string;
  roundNumber: number;
  playerLocalId: string;
  hole: number;
  strokes: number | null;
}

export interface ScoreOp extends ScoreInput {
  action: 'set' | 'clear';
  expectedVersion: number;
  opId: string;
  requestHash: string;
}

export interface IdMap {
  rounds: Record<string, string>;
  players: Record<string, string>;
}

export interface Outbox {
  ops: ScoreOp[];
  conflicts: ScoreOp[];
  versions: Record<string, number>;
  ids: IdMap;
}

export interface WriteArgs {
  contest_id: string;
  round_id: string | null;
  player_id: string;
  hole: number;
  action: 'set' | 'clear';
  strokes: number | null;
  expected_version: number;
  op_id: string;
  request_hash: string;
}

export type SendResult = { status: 'accepted' | 'conflict' | 'offline'; version?: number };

export function emptyOutbox(): Outbox {
  return { ops: [], conflicts: [], versions: {}, ids: { rounds: {}, players: {} } };
}

export function cellKey(op: Pick<ScoreOp, 'contestId' | 'roundLocalId' | 'playerLocalId' | 'hole'>): string {
  return `${op.contestId}|${op.roundLocalId}|${op.playerLocalId}|${op.hole}`;
}

export function hashLabel(op: Pick<ScoreOp, 'opId' | 'hole' | 'action' | 'strokes' | 'expectedVersion'>): string {
  return `${op.opId}:${op.hole}:${op.action}:${op.strokes ?? ''}:${op.expectedVersion}`;
}

export function roundPayload(round: PlannedRound): Record<string, unknown> {
  return {
    local_id: round.id,
    number: round.number,
    name: round.name,
    date: round.date ?? null,
    course_name: round.course?.name ?? null,
    course_data: round.course ?? null,
    groups: round.groups.map((group, groupIndex) => ({
      local_id: group.id,
      name: group.name,
      tee_time: group.teeTime ?? null,
      external_id: group.externalId ?? null,
      sort_order: groupIndex,
      players: group.players.map((player, index) => ({
        local_id: player.id,
        name: player.name,
        handicap: player.handicap,
        team: player.team === 'A' || player.team === 'B' ? player.team : null,
        sort_order: index,
        status: player.status ?? 'active',
        course_handicaps: player.courseHandicaps ?? null,
      })),
    })),
  };
}

export function rememberBundle(outbox: Outbox, roundLocalId: string, response: { round_id?: string; groups?: { players?: { local_id?: string; id?: string }[] }[] }): Outbox {
  if (!response?.round_id) return outbox;
  const rounds = { ...outbox.ids.rounds, [roundLocalId]: response.round_id };
  const players = { ...outbox.ids.players };
  for (const group of response.groups ?? []) {
    for (const player of group.players ?? []) {
      if (player.local_id && player.id) players[player.local_id] = player.id;
    }
  }
  return { ...outbox, ids: { rounds, players } };
}

export function enqueueScore(outbox: Outbox, input: ScoreInput, opId: string): Outbox {
  if (!input.contestId || !input.roundLocalId || !input.playerLocalId) throw new Error('Score is missing a round or player.');
  if (!Number.isInteger(input.hole) || input.hole < 1 || input.hole > 18) throw new Error('Hole must be 1 through 18.');
  const action = input.strokes == null || input.strokes === 0 ? 'clear' : 'set';
  const strokes = action === 'clear' ? null : input.strokes;
  if (action === 'set' && (typeof strokes !== 'number' || !Number.isInteger(strokes) || strokes < 1 || strokes > 15)) {
    throw new Error('Scores are 1 through 15.');
  }
  const key = cellKey(input);
  const expectedVersion = outbox.versions[key] ?? 0;
  const op: ScoreOp = { ...input, action, strokes, expectedVersion, opId, requestHash: '' };
  op.requestHash = hashLabel(op);
  return { ...outbox, ops: [...outbox.ops, op], versions: { ...outbox.versions, [key]: expectedVersion + 1 } };
}

export function resolveWrite(ids: IdMap, op: ScoreOp): WriteArgs | null {
  const playerId = ids.players[op.playerLocalId];
  if (!playerId) return null;
  const mappedRound = ids.rounds[op.roundLocalId];
  if (!mappedRound && op.roundNumber !== 1) return null;
  return {
    contest_id: op.contestId,
    round_id: mappedRound ?? null,
    player_id: playerId,
    hole: op.hole,
    action: op.action,
    strokes: op.strokes,
    expected_version: op.expectedVersion,
    op_id: op.opId,
    request_hash: op.requestHash,
  };
}

export function replayOutbox(outbox: Outbox, send: (op: ScoreOp, args: WriteArgs) => SendResult): { outbox: Outbox; sent: number } {
  const ops: ScoreOp[] = [];
  const conflicts = [...outbox.conflicts];
  const blocked = new Set<string>();
  let sent = 0;
  let offline = false;
  for (const op of outbox.ops) {
    const key = cellKey(op);
    if (offline || blocked.has(key)) {
      ops.push(op);
      continue;
    }
    const args = resolveWrite(outbox.ids, op);
    if (!args) {
      blocked.add(key);
      ops.push(op);
      continue;
    }
    const result = send(op, args);
    if (result.status === 'offline') {
      offline = true;
      ops.push(op);
      continue;
    }
    if (result.status === 'conflict') {
      blocked.add(key);
      conflicts.push(op);
      continue;
    }
    sent += 1;
    for (let i = conflicts.length - 1; i >= 0; i -= 1) {
      if (cellKey(conflicts[i]) === key) conflicts.splice(i, 1);
    }
  }
  return { outbox: { ...outbox, ops, conflicts }, sent };
}
