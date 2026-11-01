import { LocalJoinLimitationBanner } from './LocalJoinLimitationBanner';
import { getLocalJoinLimitation } from '../services/local-join-limitation';
import { enrollNewRound } from '../services/online-enrollment';
import { supabase } from '../db/supabase';
import { client, onlineEnabled } from '../services/cross-device';
import { useOnlineStore } from '../stores/online-store';
import { useAuthStore } from '../stores/auth-store';
import { hostOrDiscover } from '../services/online-client';
import { useEffect, useState } from "react";
import { View, Text, Pressable, Share, Platform } from "react-native";
import { useContestStore, type Contest } from "../stores/contest-store";
import { generateJoinCode } from "../services/guest-join";
import { COLORS } from "./theme";
import { CROSS_DEVICE_SHARING_ENABLED } from "../config/features";

export function ContestJoinCode({ contest }: { contest: Contest }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!contest.joinCode) useContestStore.getState().updateContest(contest.id, { joinCode: generateJoinCode(useContestStore.getState().contests.map(c => c.joinCode || "")) });
  }, [contest.id, contest.joinCode]);
  const enabled = useOnlineStore(s => s.events[contest.id]?.snapshot?.protocol === 1);
  const actor = useAuthStore(s => s.remoteUserId);
  const [checking, setChecking] = useState(onlineEnabled);
  useEffect(() => {
    if (!onlineEnabled || !actor) { setChecking(false); return; }
    let mounted = true;
    setChecking(true);
    // Owner-hosts need not have a membership row. Memory-only snapshots disappear
    // on reload, so membership discovery alone cannot restore their shared round.
    // Re-prove authorization on the server; a local round is never proof of access.
    void hostOrDiscover(client, contest.id).catch(() => {
      if (mounted) setMessage('Could not check online sharing. Open Online sync to retry.');
    }).finally(() => { if (mounted) setChecking(false); });
    return () => { mounted = false; };
  }, [contest.id, actor]);
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.is_anonymous) throw Error('Sign in with email or Apple to enable online sharing.');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contest.id)) throw Error('Create a new round to enable online sharing. Older local rounds require import review.');
      await enrollNewRound(contest, session.user.id, {
        create: async row => { const {error} = await supabase.from('contests').insert(row); if (error && error.code !== '23505') throw error; },
        rpc: async (name, args) => { const {data,error} = await supabase.rpc(name,args); if(error) throw error; return data; },
      });
      await client.rejoinHost(contest.id);
      setMessage('Online sharing enabled. Share this invite with signed-in players.');
    } catch(e: any) { setMessage(e.message || 'Could not enable online sharing. Try again.'); }
    finally { setBusy(false); }
  };
  const share = async () => {
    const link = Platform.OS === "web" ? `${window.location.origin}/join/${contest.joinCode}` : `snapscore://join/${contest.joinCode}`;
    try {
      if (Platform.OS === "web" && navigator.clipboard) { await navigator.clipboard.writeText(link); setMessage(onlineEnabled ? "Online invite link copied" : "Local invite link copied · same browser only"); }
      else await Share.share({ message: onlineEnabled ? `Sign in with email or Apple. Join with code ${contest.joinCode}: ${link}` : `${getLocalJoinLimitation().title} — ${getLocalJoinLimitation().message} Join with code ${contest.joinCode}: ${link}` });
    } catch { setMessage("Could not share. Copy the code shown above."); }
  };
  
  // Hide same-browser-only join codes until cross-device sharing is ready
  if (!CROSS_DEVICE_SHARING_ENABLED) {
    return null;
  }
  
  return <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
    {onlineEnabled && !enabled && <Pressable disabled={busy || checking} onPress={() => void enable()}><Text style={{color: COLORS.primary, paddingVertical: 12}}>{checking ? 'Checking online sharing…' : busy ? 'Enabling…' : 'Enable online sharing'}</Text></Pressable>}
    {(enabled || !onlineEnabled) && <><Text testID="organizer-join-code" style={{ color: COLORS.primary }}>Join code: {contest.joinCode}</Text>

    {!onlineEnabled && <LocalJoinLimitationBanner />}
    <Pressable onPress={share}><Text style={{ color: COLORS.text, paddingVertical: 8 }}>{onlineEnabled ? "Copy / share invite" : "Copy / share local invite"}</Text></Pressable>
    </>}
    {!!message && <Text style={{ color: COLORS.textDim }}>{message}</Text>}
  </View>;
}
