import { COLORS, FONTS } from "../../src/ui/theme";
import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { LiveChat } from '../../src/ui/LiveChat';
import { CHAT_POLL_MS } from '../../src/services/live-chat-model';
import { getSharedRound } from '../../src/services/live-share';
import type { SharedRound } from '../../src/services/live-share-snapshot';
export default function SharedScoreboard() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [round, setRound] = useState<SharedRound | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
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
  }, [token]);
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
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
  </ScrollView>;
}
const styles = StyleSheet.create({ page:{flex:1,backgroundColor:COLORS.bg},content:{padding:20,paddingTop:48,maxWidth:860,width:'100%',alignSelf:'center',gap:12},title:{fontSize:30,fontFamily:FONTS.display,color:COLORS.text},heading:{fontSize:18,fontFamily:FONTS.display,color:COLORS.primary,marginTop:14},note:{fontFamily:FONTS.regular,color:COLORS.textDim,fontSize:14},text:{fontFamily:FONTS.regular,color:COLORS.text,fontSize:16,lineHeight:26},row:{paddingVertical:12,borderBottomWidth:1,borderColor:COLORS.border},grid:{flexDirection:'row',paddingVertical:12},name:{fontFamily:FONTS.regular,color:COLORS.text,width:130},cell:{fontFamily:FONTS.score,fontVariant:['tabular-nums'],color:COLORS.text,width:38,textAlign:'center'} });
