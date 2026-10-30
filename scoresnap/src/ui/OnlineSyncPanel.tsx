import { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { client, onlineEnabled, onlineQueue, replayOnlineScores, resolveOnlineConflict, watchOnline } from '../services/cross-device';
import { useOnlineStore } from '../stores/online-store';
import { useAuthStore } from '../stores/auth-store';
import type { Entry } from '../services/score-outbox';
import type { Contest } from '../stores/contest-store';
import { COLORS } from './theme';

export function OnlineSyncPanel({ contest }: { contest: Contest }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [requests, setRequests] = useState<{ id: string; requested_name: string; status: string }[]>([]);
  const [message, setMessage] = useState('');
  const error = useOnlineStore(s => s.error);
  const actor = useAuthStore(s => s.remoteUserId);
  useEffect(() => { setRequests([]); setEntries([]); setMessage(''); }, [actor]);
  const anonymous = useAuthStore(s => s.isAnonymous);
  const remote = useOnlineStore(s => s.events[contest.id]);
  async function refresh() {
    try {
      let snapshot;
      if (!anonymous) {
        try {
          const host = await client.rejoinHost(contest.id);
          snapshot = host.snapshot;
          setRequests(host.requests.filter((r: { status: string }) => r.status === 'pending'));
        } catch { await client.discover(); snapshot = useOnlineStore.getState().events[contest.id]?.snapshot ?? null; setRequests([]); }
      } else { await client.discover(); snapshot = useOnlineStore.getState().events[contest.id]?.snapshot ?? null; }
      const box = await onlineQueue();
      setEntries(box.entries.filter(e => e.draft.contest_id === contest.id));
      return snapshot;
    } catch { setMessage('Online sync unavailable. Local scores and queued requests stay on this device.'); return null; }
  }
  useEffect(() => {
    if (!onlineEnabled || !open) return;
    let stop: (() => void) | undefined;
    const change = (state: string) => {
      stop?.(); stop = undefined;
      if (state === 'active') stop = watchOnline(contest.id, refresh, () => setMessage('Waiting to sync'));
    };
    change(AppState.currentState ?? 'active');
    const subscription = AppState.addEventListener('change', change);
    return () => { subscription.remove(); stop?.(); };
  }, [open, contest.id, anonymous, actor]);
  if (!onlineEnabled) return null;
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" onPress={action} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: COLORS.primary }}>{label}</Text></Pressable>;
  const resolve = (entry: Entry, choice: 'keep-current' | 'use-mine') => {
    Alert.alert('Resolve score conflict?', 'This cancels later queued edits for this hole. Review and enter those scores again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => { void resolveOnlineConflict(entry.id, choice).then(refresh).catch(() => setMessage('Could not save your choice. Try again.')); } },
    ]);
  };
  return <View style={{ paddingHorizontal: 20 }}>
    {button(open ? 'Close online sync' : 'Online sync', () => setOpen(!open))}
    {!!error && <Text accessibilityRole="alert" style={{ color: COLORS.error }}>{error}</Text>}
    {open && <ScrollView style={{ maxHeight: 260 }}>
      <Text style={{ color: COLORS.text }}>{message || (remote ? 'Current online snapshot' : 'Checking membership')}</Text>
      {button('Retry sync', () => { void replayOnlineScores().then(refresh).catch(() => setMessage('Waiting to sync. Queued scores are retained.')); })}
      {entries.map(entry => <View key={entry.id}>
        <Text accessibilityRole="alert" style={{ color: COLORS.text }}>Round {entry.draft.round_id} · Hole {entry.draft.hole}: {entry.state === 'queued' ? 'Waiting to sync' : entry.state === 'denied' ? 'Sync denied. Draft retained.' : `Conflict · current ${entry.receipt?.strokes ?? 'clear'} · yours ${entry.draft.strokes ?? 'clear'}`}</Text>
        {entry.state === 'conflict' && <>{button('Keep current', () => resolve(entry, 'keep-current'))}{button('Use my score', () => resolve(entry, 'use-mine'))}</>}
      </View>)}
      {requests.map(request => <View key={request.id}>
        <Text style={{ color: COLORS.text }}>{request.requested_name} requests a player slot</Text>
        {Array.from(new Map((remote?.snapshot.rounds.flatMap(r => r.players) ?? []).map(player => [player.id, player])).values()).map(player => <View key={player.id}>{button(`Approve as ${player.displayName}`, () => {
          Alert.alert('Approve player transfer?', 'The previous identity will lose access to this slot.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => { void client.decide(request.id, true, player.id).then(refresh).catch(() => setMessage('Approval failed. Try again.')); } }]);
        })}</View>)}
        {button('Reject request', () => { void client.decide(request.id, false, null).then(refresh).catch(() => setMessage('Decision failed. Try again.')); })}
      </View>)}
    </ScrollView>}
  </View>;
}
