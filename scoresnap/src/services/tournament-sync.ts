/**
 * Tournament Supabase sync service
 * Syncs tournament rounds, groups, and scores to Supabase tables
 */

import { REAL_AUTH_CONFIGURED } from '../config/auth';
import { supabase } from '../db/supabase';
import type { Contest, RoundInfo, ContestGroup } from '../stores/contest-store';
import type { Player } from '../engine/types';

/**
 * Sync a round to Supabase
 */
export async function syncRound(contestId: string, round: RoundInfo): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.is_anonymous) {
    throw new Error('Sign in to sync tournaments.');
  }

  // Upsert round
  const { error: roundError } = await supabase
    .from('contest_rounds')
    .upsert({
      id: round.id,
      contest_id: contestId,
      round_number: round.number,
      name: round.name,
      date: round.date || null,
      course_name: round.course?.name || null,
      course_data: round.course || null,
    }, {
      onConflict: 'id',
    });

  if (roundError) {
    console.error('Failed to sync round:', roundError);
    throw new Error(`Failed to sync round: ${roundError.message}`);
  }

  // Sync groups for this round
  await syncRoundGroups(contestId, round.id, round.groups);
}

/**
 * Sync groups for a specific round
 */
export async function syncRoundGroups(contestId: string, roundId: string, groups: ContestGroup[]): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.is_anonymous) return;

  // Delete existing groups for this round (we'll recreate them)
  const { error: deleteError } = await supabase
    .from('contest_groups')
    .delete()
    .eq('round_id', roundId);

  if (deleteError) {
    console.error('Failed to delete old groups:', deleteError);
  }

  // Insert new groups
  for (const group of groups) {
    const { error: groupError } = await supabase
      .from('contest_groups')
      .insert({
        id: group.id,
        contest_id: contestId,
        round_id: roundId,
        name: group.name,
        tee_time: group.teeTime || null,
        external_id: group.externalId || null,
      });

    if (groupError) {
      console.error('Failed to sync group:', groupError);
      continue;
    }

    // Sync players in this group
    await syncGroupPlayers(contestId, group.id, group.players);
  }
}

/**
 * Sync players within a group
 */
export async function syncGroupPlayers(contestId: string, groupId: string, players: Player[]): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.is_anonymous) return;

  // Delete existing players for this group
  const { error: deleteError } = await supabase
    .from('contest_players')
    .delete()
    .eq('group_id', groupId);

  if (deleteError) {
    console.error('Failed to delete old players:', deleteError);
  }

  // Insert players
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const { error: playerError } = await supabase
      .from('contest_players')
      .insert({
        id: player.id,
        contest_id: contestId,
        group_id: groupId,
        name: player.name,
        handicap: player.handicap,
        team: player.team || null,
        sort_order: i,
        status: player.status || 'active',
        course_handicaps: player.courseHandicaps || null,
      });

    if (playerError) {
      console.error('Failed to sync player:', playerError);
    }
  }
}

/**
 * Sync a player's score for a specific hole and round
 */
export async function syncScore(
  contestId: string,
  roundId: string,
  playerId: string,
  hole: number,
  strokes: number
): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.is_anonymous) return;

  const { error } = await supabase
    .from('hole_scores')
    .upsert({
      contest_id: contestId,
      round_id: roundId,
      player_id: playerId,
      hole,
      strokes,
    }, {
      onConflict: 'contest_id,player_id,hole,round_id',
    });

  if (error) {
    console.error('Failed to sync score:', error);
    throw new Error(`Failed to sync score: ${error.message}`);
  }
}

/**
 * Update contest tournament metadata
 */
export async function syncContestTournamentMeta(contestId: string, isTournament: boolean, currentRound: number): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.is_anonymous) return;

  const { error } = await supabase
    .from('contests')
    .update({
      is_tournament: isTournament,
      current_round: currentRound,
    })
    .eq('id', contestId);

  if (error) {
    console.error('Failed to sync tournament meta:', error);
  }
}

/**
 * Sync entire tournament structure (rounds and groups)
 */
export async function syncTournament(contest: Contest): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return;
  if (!contest.isTournament || !contest.rounds) return;

  // Sync tournament metadata
  await syncContestTournamentMeta(contest.id, true, contest.currentRound || 1);

  // Sync all rounds
  for (const round of contest.rounds) {
    await syncRound(contest.id, round);
  }
}
