import { useOnlineStore } from '../stores/online-store';
/**
 * Tournament sync against rewritten 008.
 * Rounds, groups and player metadata go through sync_round_bundle.
 * Scores append through write_score. Players are never deleted to rebuild a foursome.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOURNAMENT_OUTBOX_KEY, persistGate } from '../stores/persisted-keys';
import * as Crypto from 'expo-crypto';
import { resetOnlineQueues, replayOnlineScores, remoteIdentity, queueSnapshotScore, requireSyncCapability } from './cross-device';
import { CROSS_DEVICE_SHARING_ENABLED } from '../config/features';
import { REAL_AUTH_CONFIGURED } from '../config/auth';
import { supabase } from '../db/supabase';
import type { Contest, ContestGroup, RoundInfo } from '../stores/contest-store';
import {
  emptyOutbox,
  enqueueScore,
  rememberBundle,
  resolveWrite,
  roundPayload,
  type Outbox,
} from './tournament-sync-plan';

let generation = 0;
let writers: Promise<void>[] = [];
const current = (epoch: number) => epoch === generation && !persistGate.suppressed;
export async function resetTournamentOutbox(): Promise<void> {
  generation += 1;
  await Promise.allSettled([...writers]);
  await resetOnlineQueues();
}
async function save(key: string, value: Outbox, epoch: number) {
  if (!current(epoch)) return;
  const write = AsyncStorage.setItem(key, JSON.stringify(value));
  writers.push(write);
  try { await write; } finally { writers = writers.filter(p => p !== write); }
}
const STORAGE_KEY = 'snapscore.tournament.id-map.v1';
async function load(contestId: string): Promise<{ key: string; outbox: Outbox }> {
  const actor = await remoteIdentity();
  const legacy = await AsyncStorage.getItem(TOURNAMENT_OUTBOX_KEY);
  if (legacy) {
    const previous = JSON.parse(legacy);
    if (previous.ops?.length || previous.conflicts?.length) throw new Error('Legacy unsent requests need identity review before online replay. They remain on this device.');
  }
  const key = `${STORAGE_KEY}.${actor}.${contestId}`;
  const raw = await AsyncStorage.getItem(key);
  const outbox = raw ? JSON.parse(raw) : emptyOutbox();
  if (!outbox.ids?.rounds || !outbox.ids?.players) throw new Error('Online ID map is damaged');
  const snapshot = useOnlineStore.getState().events[contestId]?.snapshot;
  for (const entry of snapshot?.id_map ?? []) {
    if (entry.kind === 'round') outbox.ids.rounds[entry.local_id] = entry.server_id;
    if (entry.kind === 'player') outbox.ids.players[entry.local_id] = entry.server_id;
  }
  return { key, outbox };
}

async function requireHost(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.is_anonymous) throw new Error('Sign in to sync tournaments.');
}

export async function flushTournamentOutbox(): Promise<void> {
  if (!CROSS_DEVICE_SHARING_ENABLED || !REAL_AUTH_CONFIGURED) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await replayOnlineScores();
}

export async function syncRound(contestId: string, round: RoundInfo): Promise<void> {
  if (!CROSS_DEVICE_SHARING_ENABLED || !REAL_AUTH_CONFIGURED) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await requireSyncCapability(contestId);
  if (!current(epoch)) return;
  const saved = await load(contestId);
  if (!current(epoch)) return;
  await requireHost();
  if (!current(epoch)) return;
  const { data, error } = await supabase.rpc('sync_round_bundle', {
    contest_id: contestId,
    payload: roundPayload(round),
  });
  if (!current(epoch)) return;
  if (error || !data?.round_id) throw new Error(error?.message || 'Failed to sync round.');
  const mapped = rememberBundle(saved.outbox, round.id, data);
  await save(saved.key, mapped, epoch);
  if (!current(epoch)) return;
  await flushTournamentOutbox();
}

export async function syncRoundGroups(
  contestId: string,
  roundId: string,
  groups: ContestGroup[],
  roundNumber = 1,
  localEdit?: string,
  roundName?: string,
): Promise<void> {
  await syncRound(contestId, {
    id: roundId,
    number: roundNumber,
    name: roundName || `Round ${roundNumber}`,
    groups,
  });
}

export async function syncContestTournamentMeta(contestId: string, isTournament: boolean, currentRound: number): Promise<void> {
  if (!CROSS_DEVICE_SHARING_ENABLED || !REAL_AUTH_CONFIGURED) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await requireHost();
  if (!current(epoch)) return;
  await requireSyncCapability(contestId);
  if (!current(epoch)) return;
  const { error } = await supabase.rpc('set_tournament_meta', {
    contest_id: contestId,
    is_tournament: isTournament,
    current_round: currentRound,
  });
  if (error) console.error('Failed to sync tournament meta:', error.message);
}

export async function syncScore(
  contestId: string,
  roundId: string,
  playerId: string,
  hole: number,
  strokes: number,
  roundNumber = 1,
  localEdit?: string,
): Promise<void> {
  if (!CROSS_DEVICE_SHARING_ENABLED || !REAL_AUTH_CONFIGURED) return;
  const epoch = generation;
  if (!current(epoch)) return;
  try {
  const { outbox } = await load(contestId);
  if (!current(epoch)) return;
  const op = enqueueScore(emptyOutbox(), { contestId, roundLocalId: roundId, roundNumber, playerLocalId: playerId, hole, strokes }, Crypto.randomUUID()).ops[0];
  const args = resolveWrite(outbox.ids, op);
  if (!args || !args.round_id) throw new Error('Online round is not ready. Score remains local and is not queued.');
  await queueSnapshotScore(args.contest_id, args.round_id, args.player_id, args.hole, args.strokes, localEdit);
  if (!current(epoch)) return;
  await flushTournamentOutbox();
  } catch (error) {
    if (!current(epoch)) return;
    useOnlineStore.setState({ error: 'Online score not confirmed. Review Online sync; this score remains saved locally.' });
    throw error;
  }
}

export async function syncTournament(contest: Contest): Promise<void> {
  if (!CROSS_DEVICE_SHARING_ENABLED || !REAL_AUTH_CONFIGURED) return;
  if (!contest.isTournament || !contest.rounds) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await syncContestTournamentMeta(contest.id, true, contest.currentRound || 1);
  for (const round of contest.rounds) {
    if (!current(epoch)) return;
    await syncRound(contest.id, round);
  }
}
