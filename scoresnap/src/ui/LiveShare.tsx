import { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, Share } from 'react-native';
import { createLiveLink, revokeLiveLinks, publishSnapshot } from '../services/live-share';
import { useContestStore, type Contest } from '../stores/contest-store';
import { HostChat } from './LiveChat';
import { COLORS } from './theme';
import { CROSS_DEVICE_SHARING_ENABLED } from '../config/features';

/**
 * Keeps an enabled live scoreboard publishing every 10 s while the round screen is open,
 * independent of whether the Round status sheet (which hosts the LiveShare controls) is open.
 */
export function useLiveSharePublisher(contest: Contest | undefined) {
  const id = contest?.id;
  const on = CROSS_DEVICE_SHARING_ENABLED && !!contest?.liveShareEnabled;
  useEffect(() => {
    if (!on || !id) return;
    const timer = setInterval(() => {
      const latest = useContestStore.getState().contests.find(c => c.id === id);
      if (latest?.liveShareEnabled) void publishSnapshot(latest).catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [id, on]);
}

export function LiveShare({ contest, onLinkChange, publish = true }: { contest: Contest; onLinkChange?: (url?: string) => void; publish?: boolean }) {
  // Hide cross-device sharing UI until feature is ready
  if (!CROSS_DEVICE_SHARING_ENABLED) {
    return null;
  }
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!publish || !contest.liveShareEnabled) return;
    const timer = setInterval(() => {
      const latest = useContestStore.getState().contests.find(c => c.id === contest.id);
      if (latest?.liveShareEnabled) void publishSnapshot(latest).then(() => setMessage('Live scoreboard synced.')).catch(() => setMessage('Sync interrupted. Retrying while this screen is open.'));
    }, 10000);
    return () => clearInterval(timer);
  }, [contest.id, contest.liveShareEnabled, publish]);
  async function run(revoke = false) {
    setBusy(true);
    try {
      if (revoke) {
        await revokeLiveLinks(contest.id);
        useContestStore.getState().updateContest(contest.id, { liveShareEnabled: false });
        onLinkChange?.();
        setMessage('All live links revoked.');
      } else {
        const origin = Platform.OS === 'web' ? window.location.origin : process.env.EXPO_PUBLIC_WEB_URL;
        if (!origin || !/^https?:\/\//.test(origin)) throw new Error('Configure the public web URL to share.');
        const token = await createLiveLink(contest);
        useContestStore.getState().updateContest(contest.id, { liveShareEnabled: true });
        const url = `${origin.replace(/\/$/, '')}/r/${token}`;
        onLinkChange?.(url);
        if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(url);
        else await Share.share({ message: url });
        setMessage('Live link copied / shared. Anyone with the link can view names and scores and chat with a display name. Expires 7 days after the round ends.');
      }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <View style={{ paddingHorizontal: 20 }}>
    <Pressable disabled={busy} onPress={() => run()}><Text style={{ color: COLORS.primary, padding: 8 }}>Share live scoreboard</Text></Pressable>
    {contest.liveShareEnabled && <Pressable disabled={busy} onPress={() => run(true)}><Text style={{ color: COLORS.text, padding: 8 }}>Revoke live links</Text></Pressable>}
    {contest.liveShareEnabled && <HostChat key={contest.id} localId={contest.id} />}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: COLORS.textDim }}>{message}</Text>}
  </View>;
}
