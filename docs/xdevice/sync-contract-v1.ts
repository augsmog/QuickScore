/** Frozen additive wire types; see sync-contract-v1.md. UUIDs are server IDs. */
export type UUID = string;
export interface SyncChannelV1 { topic: `snapscore:${string}`; private: true; event: 'revision' }
export interface SyncCapabilitiesV1 {
  api_version: 1; contract: 'snapscore-sync-v1'; protocol: number;
  enabled: boolean; revision: number; channel: SyncChannelV1;
}
export interface MySyncStatusV1 {
  api_version: 1;
  memberships: {contest_id: UUID; role: 'host'|'player'|'scorer'|'viewer'; status: 'pending'|'approved'|'revoked'; player_id: UUID|null}[];
  requests: {request_id: UUID; status: 'pending'|'approved'|'rejected'; contest_id: UUID|null}[];
}
export interface SyncCourseV1 {
  name: string|null;
  holes: {num: number|null; par: number|null; hcp: number|null; yards: number|null}[];
}
export interface SyncSnapshotV1 {
  contest_id: UUID; name: string; protocol: number; revision: number;
  completed: boolean; games: import("../../scoresnap/src/engine/types").GameType[]; game_settings?: { gameConfig?: import("../../scoresnap/src/engine/types").GameConfig; betUnit?: number; hasTeams?: boolean }; course: SyncCourseV1; capabilities: SyncCapabilitiesV1;
  id_map: {kind: 'round'|'group'|'player'; local_id: string; server_id: UUID}[];
  rounds: {
    id: UUID; number: number; name: string; date: string|null;
    course: SyncCourseV1; assignment_revision: number;
    groups: {id: UUID; name: string; sort_order: number}[];
    players: {id: UUID; displayName: string; handicap: number; status: string; team: string|null; group_id: UUID|null;
      cells: {hole: number; version: number; strokes: number|null}[]}[];
  }[];
}
