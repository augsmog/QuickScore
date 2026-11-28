import { LocalJoinLimitationBanner } from './LocalJoinLimitationBanner';
import { getLocalJoinLimitation } from '../services/local-join-limitation';
import { enrollNewRound } from '../services/online-enrollment';
import { supabase } from '../db/supabase';
import { client, onlineEnabled } from '../services/cross-device';
import { useOnlineStore } from '../stores/online-store';
import { useAuthStore } from '../stores/auth-store';
import { hostOrDiscover } from '../services/online-client';
import { ownerInviteCode, OWNER_INVITE_UNAVAILABLE, OLD_ROUND_NOT_SHAREABLE, canShareOnline } from '../services/owner-invite';
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Share, Platform } from "react-native";
import { useContestStore, type Contest } from "../stores/contest-store";
import { generateJoinCode } from "../services/guest-join";
import { COLORS } from "./theme";
import { CROSS_DEVICE_SHARING_ENABLED, NATIVE_LINKS_ENABLED } from "../config/features";
import { isCompactViewport } from './compact-viewport';

// Rounds this app session already tried to switch sharing on for; one quiet try each.
const autoTried = new Set<string>();

export function ContestJoinCode({ contest }: { contest: Contest }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (contest.remoteRestored || contest.joinCode) return;
    // Re-read at effect time: discovery may have replaced the rendered local row.
    const state = useContestStore.getState();
    const current = state.contests.find(c => c.id === contest.id);
    if (current && !current.remoteRestored && !current.joinCode) state.updateContest(current.id, { joinCode: generateJoinCode(state.contests.map(c => c.joinCode || "")) });
  }, [contest.id, contest.joinCode, contest.remoteRestored]);
  const event = useOnlineStore(s => s.events[contest.id]);
  const enabled = event?.snapshot?.protocol === 1;
  const actor = useAuthStore(s => s.remoteUserId);
  // An old-format local round can never be shared; asking the server only yields an error.
  const oldRound = !contest.remoteRestored && !canShareOnline(contest.id);
  const [checking, setChecking] = useState(onlineEnabled && !oldRound);
  const [checkedContext, setCheckedContext] = useState<{ id: string; actor: string | null }>();
  const [failedSnapshot, setFailedSnapshot] = useState<object | null>();
  const checkFailed = failedSnapshot !== undefined && failedSnapshot === (event?.snapshot ?? null);
  const context = useRef<object | null>(null);
  const sharing = useRef(false);
  useEffect(() => {
    const operation = {};
    context.current = operation;
    let mounted = true;
    setMessage('');
    setFailedSnapshot(undefined);
    if (!onlineEnabled || !actor || oldRound) { setChecking(false); setCheckedContext(undefined); }
    else {
      setChecking(true);
    // Owner-hosts need not have a membership row. Memory-only snapshots disappear
    // on reload, so membership discovery alone cannot restore their shared round.
    // Re-prove authorization on the server; a local round is never proof of access.
      void hostOrDiscover(client, contest.id).catch(() => {
        if (mounted) { setFailedSnapshot(useOnlineStore.getState().events[contest.id]?.snapshot ?? null); setMessage(OWNER_INVITE_UNAVAILABLE); }
      }).finally(() => { if (mounted) { setCheckedContext({ id: contest.id, actor }); setChecking(false); } });
    }
    return () => { mounted = false; if (context.current === operation) context.current = null; };
  }, [contest.id, actor, oldRound]);
  const [busy, setBusy] = useState(false);
  const enable = async (quiet = false) => {
    if (contest.remoteRestored) { setMessage(OWNER_INVITE_UNAVAILABLE); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.is_anonymous) throw Error('Sign in with email or Apple to enable online sharing.');
      if (oldRound) throw Error(OLD_ROUND_NOT_SHAREABLE);
      await enrollNewRound(contest, session.user.id, {
        create: async row => { const {error} = await supabase.from('contests').insert(row); if (error && error.code !== '23505') throw error; },
        rpc: async (name, args) => { const {data,error} = await supabase.rpc(name,args); if(error) throw error; return data; },
      });
      await client.rejoinHost(contest.id);
      setMessage('Online sharing enabled. Share this invite with signed-in players.');
    } catch(e: any) { setMessage(quiet ? '' : e.message || 'Could not enable online sharing. Try again.'); }
    finally { setBusy(false); }
  };
  // Sharing is on by default for a new round when the organizer is signed in (owner decision 16,
  // AUG-1601). It can only be switched on before the first score, so do it as the round opens.
  // If it cannot be done now (offline, say), the manual "Enable online sharing" stays.
  const signedIn = useAuthStore(s => (s as { isAnonymous?: boolean }).isAnonymous) === false;
  const unscored = !(contest.rounds ?? [{ groups: contest.groups }]).some(r => (r.groups ?? []).some(g => (g.players ?? []).some(p => (p.scores ?? []).some(n => n !== 0))));
  useEffect(() => {
    if (!onlineEnabled || !signedIn || !actor || checking || enabled || oldRound || contest.remoteRestored || !unscored || contest.status !== 'active') return;
    if (autoTried.has(contest.id)) return;
    autoTried.add(contest.id);
    void enable(true);
  }, [contest.id, signedIn, actor, checking, enabled, oldRound, unscored]);
  const share = async () => {
    if (sharing.current) return;
    const operation = context.current;
    const current = () => context.current === operation && operation !== null &&
      useAuthStore.getState().remoteUserId === actor;
    let code = contest.joinCode;
    sharing.current = true;
    try {
      if (contest.remoteRestored) {
        if (!onlineEnabled || !actor || checking || !current()) return;
        // Never copy a persisted code or a cached code that may have rotated.
        // Authorization, identity and accepted snapshot must still match after the await.
        const fresh = await client.rejoinHost(contest.id);
        const accepted = useOnlineStore.getState().events[contest.id];
        code = ownerInviteCode(contest.id, accepted);
        if (!current()) return;
        if (!code || accepted?.snapshot !== fresh.snapshot) {
          setFailedSnapshot(useOnlineStore.getState().events[contest.id]?.snapshot ?? null); setMessage(OWNER_INVITE_UNAVAILABLE); return;
        }
        setFailedSnapshot(undefined);
      }
      if (!code) return;
      if (!NATIVE_LINKS_ENABLED) {
        const invite = onlineEnabled
          ? `Open SnapScore, tap Join with code, and enter ${code}. The host must approve your request.`
          : `${getLocalJoinLimitation().title} — ${getLocalJoinLimitation().message} Join with code ${code}.`;
        if (Platform.OS === "web" && navigator.clipboard) {
          await navigator.clipboard.writeText(invite);
          if (current()) setMessage(onlineEnabled ? "Join code instructions copied" : "Local join code copied · same browser only");
        } else await Share.share({ message: invite });
        return;
      }
      const link = Platform.OS === "web" ? `${window.location.origin}/join/${code}` : `snapscore://join/${code}`;
      if (Platform.OS === "web" && navigator.clipboard) { await navigator.clipboard.writeText(link); if (current()) setMessage(onlineEnabled ? "Online invite link copied" : "Local invite link copied · same browser only"); }
      else await Share.share({ message: onlineEnabled ? `Sign in with email or Apple. Join with code ${code}: ${link}` : `${getLocalJoinLimitation().title} — ${getLocalJoinLimitation().message} Join with code ${code}: ${link}` });
    } catch {
      if (contest.remoteRestored) { if (current()) { setFailedSnapshot(useOnlineStore.getState().events[contest.id]?.snapshot ?? null); setMessage(OWNER_INVITE_UNAVAILABLE); } }
      else if (current()) setMessage("Could not share. Copy the code shown above.");
    } finally { sharing.current = false; }
  };
  const checkedCurrent = checkedContext?.id === contest.id && checkedContext.actor === actor;
  const code = contest.remoteRestored ? (onlineEnabled && actor && checkedCurrent && !checking && !checkFailed ? ownerInviteCode(contest.id, event) : undefined) : contest.joinCode;
  const restoredUnavailable = contest.remoteRestored && !checking && !code;
  const visibleMessage = contest.remoteRestored && code && !checkFailed && message === OWNER_INVITE_UNAVAILABLE ? '' : message;
  
  // Hide same-browser-only join codes until cross-device sharing is ready
  if (!CROSS_DEVICE_SHARING_ENABLED) {
    return null;
  }
  
  const compact = Platform.OS === 'web' && typeof window !== 'undefined' && isCompactViewport({ width: window.innerWidth, height: window.innerHeight });
  return <View style={{ paddingHorizontal: 20, paddingBottom: compact ? 2 : 10 }}>
    {onlineEnabled && oldRound && <Text testID="old-round-not-shareable" style={{ color: COLORS.textDim, paddingVertical: 12 }}>{OLD_ROUND_NOT_SHAREABLE}</Text>}
    {onlineEnabled && !oldRound && !enabled && !contest.remoteRestored && <Pressable disabled={busy || checking} onPress={() => void enable()}><Text style={{color: COLORS.primary, paddingVertical: 12}}>{checking ? 'Checking online sharing…' : busy ? 'Enabling…' : 'Enable online sharing'}</Text></Pressable>}
    {contest.remoteRestored && checking && <Text style={{ color: COLORS.textDim }}>Checking online sharing…</Text>}
    {!!code && (enabled || !onlineEnabled) && <><Text testID="organizer-join-code" style={{ color: COLORS.primary }}>Join code: {code}</Text>

    {!onlineEnabled && <LocalJoinLimitationBanner />}
    <Pressable accessibilityRole="button" accessibilityLabel="Invite players" onPress={share} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: COLORS.text, paddingVertical: compact ? 4 : 8 }}>{onlineEnabled ? "Copy / share invite" : "Copy / share local invite"}</Text></Pressable>
    </>}
    {restoredUnavailable && !message && <Text style={{ color: COLORS.textDim }}>{OWNER_INVITE_UNAVAILABLE}</Text>}
    {!!visibleMessage && <Text style={{ color: COLORS.textDim }}>{visibleMessage}</Text>}
  </View>;
}
