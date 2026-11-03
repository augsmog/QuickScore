import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Share } from 'react-native';
import { createLiveLink, revokeLiveLinks, publishSnapshot } from '../services/live-share';
import { useContestStore, type Contest } from '../stores/contest-store';
import { HostChat } from './LiveChat';
import { COLORS } from './theme';
import { CROSS_DEVICE_SHARING_ENABLED } from '../config/features';
import { useAuthStore } from '../stores/auth-store';
import { clearLiveShareUrl, liveShareScope, setLiveShareUrl } from '../services/live-share-url-state';
import { createLiveShareOperationGate } from '../services/live-share-operation';

export function LiveShare({ contest }: { contest: Contest }) {
  // Hide cross-device sharing UI until feature is ready
  if (!CROSS_DEVICE_SHARING_ENABLED) {
    return null;
  }
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const activeOperation = useRef(createLiveShareOperationGate());
  const scopeOperation = useRef(createLiveShareOperationGate());
  const actorId = useAuthStore(s => s.user?.id ?? s.remoteUserId ?? null);
  const scope = liveShareScope(actorId, contest.id);
  useEffect(() => {
    activeOperation.current.invalidate();
    scopeOperation.current.invalidate();
    setBusy(false);
    setMessage('');
    return () => {
      activeOperation.current.invalidate();
      scopeOperation.current.invalidate();
      clearLiveShareUrl(scope);
    };
  }, [scope]);
  useEffect(() => {
    let previousActorId = actorId;
    return useAuthStore.subscribe((state) => {
      const currentActorId = state.user?.id ?? state.remoteUserId ?? null;
      if (currentActorId === previousActorId) return;
      clearLiveShareUrl(liveShareScope(previousActorId, contest.id));
      previousActorId = currentActorId;
      activeOperation.current.invalidate();
      scopeOperation.current.invalidate();
      // The invalidated operation's finally block intentionally avoids updating
      // state for a stale actor. Clear its UI lock here because A→B→A can leave
      // the rendered scope unchanged, so the scope effect will not run again.
      setBusy(false);
    });
  }, [contest.id]);
  useEffect(() => {
    if (!contest.liveShareEnabled) return;
    const operationId = scopeOperation.current.begin();
    const timer = setInterval(() => {
      if (!scopeOperation.current.isCurrent(operationId)) return;
      const auth = useAuthStore.getState();
      const currentActorId = auth.user?.id ?? auth.remoteUserId ?? null;
      if (currentActorId !== actorId) return;
      const latest = useContestStore.getState().contests.find(c => c.id === contest.id);
      if (latest?.liveShareEnabled) void publishSnapshot(latest)
        .then(() => {
          if (scopeOperation.current.isCurrent(operationId)) setMessage('Live scoreboard synced.');
        })
        .catch(() => {
          if (scopeOperation.current.isCurrent(operationId)) setMessage('Sync interrupted. Retrying while this screen is open.');
        });
    }, 10000);
    return () => {
      clearInterval(timer);
      scopeOperation.current.invalidate();
    };
  }, [actorId, contest.id, contest.liveShareEnabled]);
  async function run(revoke = false) {
    const operationId = activeOperation.current.begin();
    setBusy(true);
    try {
      if (revoke) {
        await revokeLiveLinks(contest.id);
        if (!activeOperation.current.isCurrent(operationId)) return;
        clearLiveShareUrl(scope);
        useContestStore.getState().updateContest(contest.id, { liveShareEnabled: false });
        setMessage('All live links revoked.');
      } else {
        const origin = Platform.OS === 'web' ? window.location.origin : process.env.EXPO_PUBLIC_WEB_URL;
        if (!origin || !/^https?:\/\//.test(origin)) throw new Error('Configure the public web URL to share.');
        const token = await createLiveLink(contest);
        if (!activeOperation.current.isCurrent(operationId)) return;
        const auth = useAuthStore.getState();
        const currentActorId = auth.user?.id ?? auth.remoteUserId ?? null;
        const currentContest = useContestStore.getState().contests.find(c => c.id === contest.id);
        if (currentActorId !== actorId || !currentContest) return;
        useContestStore.getState().updateContest(contest.id, { liveShareEnabled: true });
        const url = `${origin.replace(/\/$/, '')}/r/${token}`;
        setLiveShareUrl(scope, url);
        if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(url);
        else await Share.share({ message: url });
        if (!activeOperation.current.isCurrent(operationId)) return;
        setMessage('Live link copied / shared. Anyone with the link can view names and scores and chat with a display name. Expires 7 days after the round ends.');
      }
    } catch (e) {
      if (activeOperation.current.isCurrent(operationId)) setMessage((e as Error).message);
    } finally {
      if (activeOperation.current.isCurrent(operationId)) setBusy(false);
    }
  }
  return <View style={{ paddingHorizontal: 20 }}>
    <Pressable disabled={busy} onPress={() => run()}><Text style={{ color: COLORS.primary, padding: 8 }}>Share live scoreboard</Text></Pressable>
    {contest.liveShareEnabled && <Pressable disabled={busy} onPress={() => run(true)}><Text style={{ color: COLORS.text, padding: 8 }}>Revoke live links</Text></Pressable>}
    {contest.liveShareEnabled && <HostChat key={contest.id} localId={contest.id} />}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: COLORS.textDim }}>{message}</Text>}
  </View>;
}
