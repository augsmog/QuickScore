import { TournamentCompletion } from './TournamentCompletion';
import { confirmedTournamentTotals } from '../services/tournament-totals';
import { projectScore, pendingConfirmation } from '../services/score-projection';
import type { Entry } from '../services/score-outbox';
import { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, Text, TextInput, View } from 'react-native';
import { client, refreshOnline, onlineEnabled, queueOnlineScore, watchOnline, onlineQueue, replayOnlineScores, resolveOnlineConflict } from '../services/cross-device';
import { snapshotScore } from '../services/sync-v1';
import { foregroundSync } from '../services/online-client';
import { useOnlineStore } from '../stores/online-store';
import { useAuthStore } from '../stores/auth-store';
import { COLORS } from './theme';

export function OnlineGuestScorecard() {
  const events = useOnlineStore(s => s.events);
  const actor = useAuthStore(s => s.remoteUserId);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!onlineEnabled || !actor) return;
    let stop: (() => void) | undefined;
    const change = (state: string) => {
      stop?.(); stop = undefined;
      if (state === 'active') {
        const poll = foregroundSync(async () => { await refreshOnline(); return null; }, () => setMessage('Waiting for approval or connection'));
        stop = poll.stop;
      }
    };
    change(AppState.currentState ?? 'active');
    const sub = AppState.addEventListener('change', change);
    return () => { sub.remove(); stop?.(); };
  }, [actor]);
  return <View>{!!message && <Text style={{ color: COLORS.text }}>{message}</Text>}
    {Object.entries(events).map(([id, event]) => <ApprovedScorecard key={`${actor}:${id}`} id={id} onError={setMessage} />)}
  </View>;
}
function ApprovedScorecard({ id, onError }: { id: string; onError: (message: string) => void }) {
  const event = useOnlineStore(s => s.events[id]);
  const [entries, setEntries] = useState<Entry[]>([]);
  async function inspectQueue(awaitingFetch = false) {
    const queue = await onlineQueue();
    const durable = queue.entries.filter(e => e.draft.contest_id === id);
    setEntries(previous => awaitingFetch ? pendingConfirmation(previous, durable) : durable);
  }
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    let stop: (() => void) | undefined;
    const refresh = async () => { await refreshOnline(); await inspectQueue(); return useOnlineStore.getState().events[id]?.snapshot ?? null; };
    const change = (state: string) => {
      stop?.(); stop = undefined;
      if (state === 'active') stop = watchOnline(id, refresh, () => onError('Waiting to sync. Drafts retained.'));
    };
    change(AppState.currentState ?? 'active');
    const sub = AppState.addEventListener('change', change);
    return () => { sub.remove(); stop?.(); };
  }, [id]);
  if (!event) return null;
  const { snapshot, membership } = event;
  return <View><Text style={{ color: COLORS.text }}>{snapshot.name} · Approved online scorecard</Text>
    <Pressable accessibilityRole="button" style={{ minHeight: 44 }} onPress={() => { void replayOnlineScores().then(() => client.discover()).then(() => inspectQueue()).catch(() => onError('Waiting to sync. Drafts retained.')); }}><Text style={{ color: COLORS.primary }}>Retry queued scores</Text></Pressable>
    {entries.map(entry => <View key={entry.id}><Text style={{ color: COLORS.text }}>Hole {entry.draft.hole}: {entry.state} · round {entry.draft.round_id} · yours {entry.draft.strokes ?? 'clear'}{entry.receipt ? ` · current ${entry.receipt.strokes ?? 'clear'}` : ''}</Text>
      {entry.state === 'conflict' && (['keep-current', 'use-mine'] as const).map(choice => <Pressable key={choice} accessibilityRole="button" style={{ minHeight: 44 }} onPress={() => Alert.alert('Resolve score conflict?', 'Later queued edits for this hole will be cancelled. Review and enter them again.', [{ text: 'Cancel' }, { text: 'Confirm', onPress: () => { void resolveOnlineConflict(entry.id, choice).then(() => client.discover()).then(() => inspectQueue()).catch(() => onError('Could not save conflict choice')); } }])}><Text style={{ color: COLORS.primary }}>{choice === 'keep-current' ? 'Keep current' : 'Use my score'}</Text></Pressable>)}
    </View>)}
    <TournamentCompletion id={id} report={onError} />
    <Text style={{ color: COLORS.text }}>Confirmed tournament totals · queued edits excluded</Text>
    {confirmedTournamentTotals(snapshot).map(total => <View key={total.playerId}>
      <Text style={{ color: COLORS.text }}>{total.displayName}: {total.strokes ?? '—'}{total.complete ? '' : ' · incomplete'}</Text>
      {total.rounds.map(result => <Text key={result.roundId} style={{ color: COLORS.text }}>
        {snapshot.rounds.find(round => round.id === result.roundId)?.name}: {result.strokes ?? '—'} · {result.scored}/{result.holes} holes{result.holes ? '' : ' · course needs repair'}
      </Text>)}
    </View>)}
    {snapshot.rounds.map(round => <View key={round.id}>
      <Text style={{ color: COLORS.text }}>{round.name} · {round.course.name || 'Course needs repair'}</Text>
      {!round.course.holes.length && <Text style={{ color: COLORS.text }}>Course details need manual repair. Pars are unavailable.</Text>}
      {round.players.filter(p => p.id === membership.player_id).map(player => <View key={player.id}>
        <Text style={{ color: COLORS.text }}>{player.displayName}</Text>
        {player.cells.map(cell => {
          const key = `${round.id}:${player.id}:${cell.hole}`;
          const target = { contest_id: id, round_id: round.id, player_id: player.id, hole: cell.hole };
          const projection = projectScore(target, cell.strokes, entries);
          return <View key={key}><Text style={{ color: COLORS.text }}>Hole {cell.hole} · current {cell.strokes ?? 'clear'}{projection.state !== 'current' ? ` · ${projection.state}${projection.state === 'queued' ? ` ${projection.strokes ?? 'clear'}` : ''}` : ''} · par {round.course.holes.find(h => h.num === cell.hole)?.par ?? '—'}</Text>
            <TextInput accessibilityLabel={`${round.name} hole ${cell.hole} strokes`} keyboardType="number-pad" value={drafts[key] ?? (projection.strokes === null ? '' : String(projection.strokes))} onChangeText={value => { if (/^\d{0,2}$/.test(value)) setDrafts(s => ({ ...s, [key]: value })); }} style={{ color: COLORS.text, minHeight: 44 }} />
            <Pressable accessibilityRole="button" style={{ minHeight: 44 }} onPress={() => {
              const value = drafts[key] ?? (projection.strokes === null ? '' : String(projection.strokes));
              const strokes = value === '' ? null : Number(value);
              if (strokes !== null && (strokes < 1 || strokes > 15)) { onError('Enter 1–15 strokes, or clear the field.'); return; }
              void (async () => {
                const { draft, version } = snapshotScore(onlineEnabled, snapshot, round.id, player.id, cell.hole, strokes);
                await queueOnlineScore(draft, version);
                // Show the durable draft before attempting any network operation.
                await inspectQueue();
                setDrafts(s => { const next = { ...s }; delete next[key]; return next; });
                onError('Saved on this device. Waiting to sync.');
                try {
                  await replayOnlineScores();
                  await inspectQueue(true);
                  await client.discover();
                  await inspectQueue();
                  onError('Review the current score and queue below.');
                } catch { await inspectQueue(true); onError('Waiting for confirmation. Saved drafts are retained.'); }
              })().catch(() => onError('Could not save on this device. Your entered score is retained; try again.'));
            }}><Text style={{ color: COLORS.primary }}>Save hole {cell.hole}</Text></Pressable>
          </View>;
        })}
      </View>)}
    </View>)}
  </View>;
}
