import { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Head from 'expo-router/head';
import { supabase } from '../db/supabase';
import { client, onlineEnabled, refreshOnline, remoteIdentity, watchOnline } from '../services/cross-device';
import { guestSessionMessage, playerLinkApi } from '../services/player-link';
import { useOnlineStore } from '../stores/online-store';
import { RoundBoard } from './RoundBoard';
import { SafeScreen } from './SafeScreen';
import { COLORS, FONTS } from './theme';

const api = playerLinkApi((name, args) => supabase.rpc(name, args) as unknown as Promise<{ data: any; error: any }>);

/**
 * The website's "Join a round" by 6-letter code: watch only. The board and the money,
 * never a way to enter scores; scoring on the web needs the organizer's player link.
 */
export function WatchByCode({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [contestId, setContestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const event = useOnlineStore(s => (contestId ? s.events[contestId] : undefined));

  async function watch(entered: string) {
    setBusy(true); setError('');
    try {
      if (!onlineEnabled) throw Error('Watching is not available right now.');
      // A guest session with no account. The code only ever grants watching.
      await remoteIdentity();
      const id = await api.watchCode(entered);
      await client.discover();
      setContestId(id);
    } catch (e) { setError(guestSessionMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (initialCode) void watch(initialCode); }, [initialCode]);
  useEffect(() => {
    if (!contestId) return;
    let stop: (() => void) | undefined;
    const refresh = async () => { await refreshOnline(); return useOnlineStore.getState().events[contestId]?.snapshot ?? null; };
    const change = (state: string) => { stop?.(); stop = undefined; if (state === 'active') stop = watchOnline(contestId, refresh, () => {}); };
    change(AppState.currentState ?? 'active');
    const sub = AppState.addEventListener('change', change);
    return () => { sub.remove(); stop?.(); };
  }, [contestId]);

  return <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}><ScrollView contentContainerStyle={styles.content}>
    <Head><title>Join a round · SnapScore</title><meta name="referrer" content="no-referrer" /><meta name="robots" content="noindex,nofollow" /></Head>
    <Text style={styles.brand}>SNAPSCORE</Text>
    {!event && <>
      <Text accessibilityRole="header" style={styles.title}>Join a round</Text>
      <Text style={styles.note}>Enter the code from the organizer to follow the round live. To keep score, ask the organizer for a player link.</Text>
      <TextInput testID="watch-code" accessibilityLabel="Round code" placeholder="Code" placeholderTextColor={COLORS.textDim} value={code} onChangeText={setCode}
        autoCapitalize="characters" autoCorrect={false} maxLength={12} style={styles.input} onSubmitEditing={() => void watch(code)} />
      <Pressable testID="watch-go" accessibilityRole="button" disabled={busy || !code.trim()} onPress={() => void watch(code)} style={[styles.button, (busy || !code.trim()) && { opacity: 0.5 }]}>
        <Text style={styles.buttonText}>{busy ? 'Opening…' : 'Watch the round'}</Text>
      </Pressable>
      {!!error && <Text testID="watch-error" accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!contestId && !error && <Text style={styles.note}>Opening the round…</Text>}
    </>}
    {event && <>
      <Text testID="watch-title" accessibilityRole="header" style={styles.title}>{event.snapshot.name}</Text>
      <Text style={styles.note}>{event.snapshot.completed ? 'Round complete' : 'Round in progress · you are watching'}</Text>
      <RoundBoard snapshot={event.snapshot} />
    </>}
    <Text style={styles.nudge}>Set up your own games and settle up in the SnapScore app.</Text>
  </ScrollView></SafeScreen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 28, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 14 },
  brand: { fontFamily: FONTS.displaySC, fontSize: 14, letterSpacing: 3, color: COLORS.primary },
  title: { fontFamily: FONTS.display, fontSize: 30, lineHeight: 36, color: COLORS.text },
  note: { fontFamily: FONTS.regular, fontSize: 16, lineHeight: 24, color: COLORS.textDim },
  input: { fontFamily: FONTS.score, fontSize: 24, letterSpacing: 4, color: COLORS.text, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.surfaceHigh, paddingHorizontal: 18, minHeight: 60 },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.primary },
  buttonText: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.onPrimary },
  error: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 24, color: COLORS.error },
  nudge: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 22, color: COLORS.textDim, textAlign: 'center', marginTop: 24 },
});
