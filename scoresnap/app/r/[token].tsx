import { SafeScreen } from "../../src/ui/SafeScreen";
import { COLORS, FONTS } from "../../src/ui/theme";
import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { LiveChat } from '../../src/ui/LiveChat';
import { CHAT_POLL_MS } from '../../src/services/live-chat-model';
import { getSharedRound } from '../../src/services/live-share';
import type { SharedRound } from '../../src/services/live-share-snapshot';
import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';
import { supabase } from '../../src/db/supabase';
import { playerLinkApi } from '../../src/services/player-link';
import { RoundBoard } from '../../src/ui/RoundBoard';
const links = playerLinkApi((name, args) => supabase.rpc(name, args) as unknown as Promise<{ data: any; error: any }>);
/** Spectator links read the live round every few seconds. No session, no score entry. */
const LIVE_POLL_MS = 10000;
export default function SharedScoreboard() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [round, setRound] = useState<SharedRound | null>(null);
  const [error, setError] = useState('');
  // A spectator link shows the same live board and money the players see. Older share
  // links (a copy uploaded by the organizer's phone) keep working below.
  const [live, setLive] = useState<SyncSnapshotV1 | null>(null);
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    let alive = true; let fetching = false; let shown = false; let older = false;
    setLive(null); setLegacy(false);
    async function refresh() {
      if (fetching || older) return;
      fetching = true;
      try {
        const snapshot = await links.board(token);
        if (alive) { shown = true; setLive(snapshot); setError(''); }
      } catch (e) {
        if (!alive) return;
        // Not a spectator link, or one the organizer ended. It may be an older share link.
        if ((e as { code?: string }).code === '22023' || !/^[a-f0-9]{64}$/.test(String(token))) { older = true; setLive(null); setLegacy(true); }
        // A dropped connection keeps the last board on screen.
        else if (!shown) setError((e as Error).message);
      } finally { fetching = false; }
    }
    void refresh();
    const timer = setInterval(refresh, LIVE_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [token]);
  useEffect(() => {
    if (!legacy) return;
    let alive = true; let fetching = false;
    async function refresh() {
      if (fetching) return;
      fetching = true;
      try {
        const data = await getSharedRound(token);
        if (alive) { setRound(data); setError(''); }
      } catch (e) { if (alive) { setRound(null); setError((e as Error).message); } }
      finally { fetching = false; }
    }
    void refresh();
    const timer = setInterval(refresh, CHAT_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [token, legacy]);
  if (live) return <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Head><title>Live scoreboard · SnapScore</title><meta name="referrer" content="no-referrer" /><meta name="robots" content="noindex,nofollow" /></Head>
    <Text style={styles.note}>SNAPSCORE · live scoreboard</Text>
    <Text testID="spectator-title" accessibilityRole="header" style={styles.title}>{live.name}</Text>
    <Text style={styles.note}>{live.completed ? 'Round complete' : 'Round in progress · updates every 10 seconds'}</Text>
    <RoundBoard snapshot={live} />
    <Text style={[styles.note, { textAlign: 'center', marginTop: 24 }]}>Set up your own games and settle up in the SnapScore app.</Text>
  </ScrollView></SafeScreen>;
  return <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Head><title>Live scoreboard · SnapScore</title><meta name="referrer" content="no-referrer" /><meta name="robots" content="noindex,nofollow" /></Head>
    <Text style={styles.title}>Live scoreboard</Text>
    <Text style={styles.note}>Scores and chat · updates every 5 seconds</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.text}>{error}</Text>}
    {!round && !error && <Text style={styles.text}>Loading scoreboard…</Text>}
    {round && <>
      <Text style={styles.note}>{round.completed ? 'Round complete' : 'Provisional results · round in progress'}</Text>
      <Text style={styles.heading}>Leaderboard</Text>
      {[...round.players].sort((a,b) => a.toPar-b.toPar).map((p,i) => <View key={i} style={styles.row}>
        <Text style={styles.text}>{p.displayName}</Text><Text style={styles.text}>{p.total} strokes · {p.toPar > 0 ? '+' : ''}{p.toPar} · thru {p.scores.filter(n=>n>0).length}</Text>
      </View>)}
      <Text style={styles.heading}>Hole by hole</Text>
      <ScrollView horizontal><View>
        <View style={styles.grid}><Text style={styles.name}>Player</Text>{Array.from({length: Math.max(0,...round.players.map(p=>p.scores.length))},(_,i)=><Text key={i} style={styles.cell}>{i+1}</Text>)}</View>
        {round.players.map((p,i)=><View key={i} style={styles.grid}><Text style={styles.name}>{p.displayName}</Text>{p.scores.map((s,j)=><Text key={j} style={styles.cell}>{s || '—'}</Text>)}</View>)}
      </View></ScrollView>
      <Text style={styles.heading}>Game results · unit summary</Text>
      {round.games.map((g,i)=><View key={i}><Text style={styles.heading}>{g.game.replace(/_/g,' ')}</Text>{g.standings.map((s,j)=><Text key={j} style={styles.text}>{s.displayName}: {s.units > 0 ? '+' : ''}{s.units} units</Text>)}</View>)}
      <LiveChat key={token} token={token} />
    </>}
  </ScrollView></SafeScreen>;
}
const styles = StyleSheet.create({ page:{flex:1,backgroundColor:COLORS.bg},content:{padding:20,paddingTop:48,maxWidth:860,width:'100%',alignSelf:'center',gap:12},title:{fontSize:30,fontFamily:FONTS.display,color:COLORS.text},heading:{fontSize:18,fontFamily:FONTS.display,color:COLORS.primary,marginTop:14},note:{fontFamily:FONTS.regular,color:COLORS.textDim,fontSize:14},text:{fontFamily:FONTS.regular,color:COLORS.text,fontSize:16,lineHeight:26},row:{paddingVertical:12,borderBottomWidth:1,borderColor:COLORS.border},grid:{flexDirection:'row',paddingVertical:12},name:{fontFamily:FONTS.regular,color:COLORS.text,width:130},cell:{fontFamily:FONTS.score,fontVariant:['tabular-nums'],color:COLORS.text,width:38,textAlign:'center'} });
