import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../../src/db/supabase';
import { client, onlineEnabled, remoteIdentity } from '../../src/services/cross-device';
import { playerLinkApi, validPlayerToken, type LinkRoster } from '../../src/services/player-link';
import { GuestGroupCard } from '../../src/ui/GuestGroupCard';
import { SafeScreen } from '../../src/ui/SafeScreen';
import { COLORS, FONTS } from '../../src/ui/theme';

const api = playerLinkApi((name, args) => supabase.rpc(name, args) as unknown as Promise<{ data: any; error: any }>);

/** Player link: a guest with no account picks who they are and keeps their group's card. */
export default function PlayerLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [roster, setRoster] = useState<LinkRoster | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = useCallback(async () => {
    setError(''); setRoster(null); setPlayer(null);
    try {
      if (!onlineEnabled) throw Error('Web scoring is not available right now.');
      if (!validPlayerToken(token)) throw Error('This link is not complete. Ask the organizer to send it again.');
      // A guest session, created without an account. The link, not the session, grants access.
      await remoteIdentity();
      const found = await api.roster(token);
      setRoster(found);
      if (found.me) { await client.discover(); setPlayer(found.me); }
    } catch (e) { setError((e as Error).message); }
  }, [token]);
  useEffect(() => { void open(); }, [open]);

  async function pick(playerId: string) {
    setBusy(true); setError('');
    try {
      await api.join(token, playerId);
      await client.discover();
      setPlayer(playerId);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const gone = useCallback((message: string) => { setPlayer(null); setRoster(null); setError(message); }, []);
  const name = roster?.rounds.flatMap(r => r.groups).flatMap(g => g.players).find(p => p.id === player)?.displayName;

  return <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}><ScrollView contentContainerStyle={styles.content}>
    <Head><title>Keep score · SnapScore</title><meta name="referrer" content="no-referrer" /><meta name="robots" content="noindex,nofollow" /></Head>
    <Text style={styles.brand}>SNAPSCORE</Text>
    <Text accessibilityRole="header" style={styles.title}>{roster?.name ?? 'Keep score'}</Text>
    {!!error && <View style={{ gap: 12 }}>
      <Text testID="guest-error" accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => void open()} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable>
    </View>}
    {!roster && !error && <Text style={styles.note}>Opening the round…</Text>}

    {roster && !player && !error && <View style={{ gap: 12 }}>
      {!roster.open && <Text style={styles.note}>This round is finished or paused, so scores can no longer be entered.</Text>}
      {roster.open && <>
        <Text style={styles.lead}>Who are you?</Text>
        <Text style={styles.note}>You will keep the card for your whole group. No account needed.</Text>
        {roster.rounds[0]?.groups.map(group => <View key={group.id} style={{ gap: 8 }}>
          <Text style={styles.group}>{group.name}</Text>
          {group.players.map(p => <Pressable key={p.id} testID={`guest-pick-${p.displayName}`} accessibilityRole="button" disabled={busy} onPress={() => void pick(p.id)} style={[styles.pick, busy && { opacity: 0.5 }]}>
            <Text numberOfLines={1} style={styles.pickText}>{p.displayName}</Text>
          </Pressable>)}
        </View>)}
        {!roster.rounds[0]?.groups.some(g => g.players.length) && <Text style={styles.note}>No players are in a group yet. Ask the organizer.</Text>}
      </>}
    </View>}

    {roster && player && <View style={{ gap: 12 }}>
      <View style={styles.identity}>
        <Text testID="guest-identity" numberOfLines={1} style={[styles.note, { flex: 1 }]}>Scoring as {name ?? 'your group'}</Text>
        <Pressable accessibilityRole="button" onPress={() => setPlayer(null)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.link}>Not you?</Text></Pressable>
      </View>
      <GuestGroupCard contestId={roster.contest_id} playerId={player} onGone={gone} />
    </View>}

    <Text style={styles.nudge}>Set up your own games and settle up in the SnapScore app.</Text>
  </ScrollView></SafeScreen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 28, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center', gap: 14 },
  brand: { fontFamily: FONTS.displaySC, fontSize: 14, letterSpacing: 3, color: COLORS.primary },
  title: { fontFamily: FONTS.display, fontSize: 30, lineHeight: 36, color: COLORS.text },
  lead: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.text },
  note: { fontFamily: FONTS.regular, fontSize: 16, lineHeight: 24, color: COLORS.textDim },
  error: { fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 26, color: COLORS.error },
  group: { fontFamily: FONTS.displaySC, fontSize: 14, letterSpacing: 2, color: COLORS.textDim, marginTop: 8 },
  pick: { minHeight: 56, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceHigh },
  pickText: { fontFamily: FONTS.semibold, fontSize: 19, color: COLORS.text },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: COLORS.primary },
  buttonText: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.onPrimary },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  link: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.primary },
  nudge: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 22, color: COLORS.textDim, textAlign: 'center', marginTop: 24 },
});
