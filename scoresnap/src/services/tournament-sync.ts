/**
 * Tournament sync against rewritten 008.
 * Rounds, groups and player metadata go through sync_round_bundle.
 * Scores append through write_score. Players are never deleted to rebuild a foursome.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { TOURNAMENT_OUTBOX_KEY, persistGate } from '../stores/persisted-keys';
import { REAL_AUTH_CONFIGURED } from '../config/auth';
import { supabase } from '../db/supabase';
import type { Contest, ContestGroup, RoundInfo } from '../stores/contest-store';
import {
  cellKey,
  emptyOutbox,
  enqueueScore,
  rememberBundle,
  resolveWrite,
  roundPayload,
  type Outbox,
  type ScoreOp,
} from './tournament-sync-plan';

const STORAGE_KEY = TOURNAMENT_OUTBOX_KEY;
let outbox: Outbox = emptyOutbox();
let loaded = false;
let loading: Promise<void> | undefined;
let generation = 0;
let writers: Promise<void>[] = [];
const current = (epoch: number) => epoch === generation && !persistGate.suppressed;

/** Invalidate work immediately; drain already-issued writes before disk removal. */
export async function resetTournamentOutbox(): Promise<void> {
  generation += 1;
  outbox = emptyOutbox();
  loaded = false;
  loading = undefined;
  await Promise.allSettled([...writers]);
}

async function load(epoch: number): Promise<void> {
  if (!current(epoch) || loaded) return;
  if (loading) return loading;
  const task = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!current(epoch)) return;
      const parsed = raw ? JSON.parse(raw) as Outbox : null;
      if (parsed && Array.isArray(parsed.ops) && parsed.ids && parsed.versions) {
        outbox = { ...emptyOutbox(), ...parsed, ops: parsed.ops ?? [], conflicts: parsed.conflicts ?? [] };
      }
    } catch {
      // A damaged local queue must not block scoring on this device.
    } finally {
      if (current(epoch)) { loaded = true; loading = undefined; }
    }
  })();
  loading = task;
  await task;
}

async function save(epoch: number): Promise<void> {
  if (!current(epoch)) return;
  const write = AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(outbox));
  writers.push(write);
  try { await write; } finally { writers = writers.filter(pending => pending !== write); }
}

async function requireHost(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.is_anonymous) throw new Error('Sign in to sync tournaments.');
}

export async function flushTournamentOutbox(): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await load(epoch);
  if (!current(epoch)) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !current(epoch)) return;
  const kept: ScoreOp[] = [];
  const conflicts = [...outbox.conflicts];
  const blocked = new Set<string>();
  let offline = false;
  for (let index = 0; index < outbox.ops.length; index += 1) {
    if (!current(epoch)) return;
    const op = outbox.ops[index];
    const key = cellKey(op);
    if (offline || blocked.has(key)) {
      kept.push(op);
      continue;
    }
    const args = resolveWrite(outbox.ids, op);
    if (!args) {
      blocked.add(key);
      kept.push(op);
      continue;
    }
    const { data, error } = await supabase.rpc('write_score', args);
    if (!current(epoch)) return;
    const status = (data as { status?: string } | null)?.status;
    const message = error?.message ?? '';
    const transport = !!error && /failed to fetch|network|timeout|offline/i.test(message);
    if (error && !transport && status !== 'conflict' && !/conflict/i.test(message)) {
      kept.push(op, ...outbox.ops.slice(index + 1));
      outbox = { ...outbox, ops: kept, conflicts };
      await save(epoch);
      throw new Error(message || 'Score sync failed.');
    }
    if (transport || (!error && status !== 'accepted' && status !== 'conflict')) {
      offline = true;
      kept.push(op);
      continue;
    }
    if (status === 'conflict' || /conflict/i.test(message)) {
      blocked.add(key);
      conflicts.push(op);
      console.error('Score conflict kept for review', op.opId);
      continue;
    }
    for (let i = conflicts.length - 1; i >= 0; i -= 1) {
      if (cellKey(conflicts[i]) === key) conflicts.splice(i, 1);
    }
  }
  outbox = { ...outbox, ops: kept, conflicts };
  await save(epoch);
}

export async function syncRound(contestId: string, round: RoundInfo): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await load(epoch);
  if (!current(epoch)) return;
  await requireHost();
  if (!current(epoch)) return;
  const { data, error } = await supabase.rpc('sync_round_bundle', {
    contest_id: contestId,
    payload: roundPayload(round),
  });
  if (!current(epoch)) return;
  if (error || !data?.round_id) throw new Error(error?.message || 'Failed to sync round.');
  outbox = rememberBundle(outbox, round.id, data);
  await save(epoch);
  if (current(epoch)) await flushTournamentOutbox();
}

export async function syncRoundGroups(
  contestId: string,
  roundId: string,
  groups: ContestGroup[],
  roundNumber = 1,
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
  if (!REAL_AUTH_CONFIGURED) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await requireHost();
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
): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await load(epoch);
  if (!current(epoch)) return;
  outbox = enqueueScore(outbox, {
    contestId,
    roundLocalId: roundId,
    roundNumber,
    playerLocalId: playerId,
    hole,
    strokes,
  }, Crypto.randomUUID());
  await save(epoch);
  if (current(epoch)) await flushTournamentOutbox();
}

export async function syncTournament(contest: Contest): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;
  if (!contest.isTournament || !contest.rounds) return;
  const epoch = generation;
  if (!current(epoch)) return;
  await syncContestTournamentMeta(contest.id, true, contest.currentRound || 1);
  for (const round of contest.rounds) {
    if (!current(epoch)) return;
    await syncRound(contest.id, round);
  }
}
