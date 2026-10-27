import { Linking, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../theme';
import type { RecapModel } from './model';
import { CROSS_DEVICE_SHARING_ENABLED } from '../../config/features';

/** Screenshot-ready surface. TODO: image export when view-shot is a dependency. */
export function RecapCard({ model }: { model: RecapModel }) {
  return <View testID="recap-card" style={styles.card}>
    <Text style={styles.eyebrow}>SNAPSCORE / {model.completed ? 'ROUND RECAP' : 'ROUND IN PROGRESS'}</Text>
    <Text style={styles.title}>{model.title}</Text>
    <Text style={styles.muted}>{model.course}</Text>
    <View style={styles.hero}>
      <Text style={styles.trophy} accessibilityLabel="Trophy">🏆</Text>
      <Text style={styles.eyebrow}>{model.headline}</Text>
      <Text style={styles.winner}>{model.winnerNames || 'Everyone finishes even'}</Text>
      {!!model.winner && <Text style={styles.amount}>{model.winner.amount}{model.winners.length > 1 ? ' each' : ''}</Text>}
      {!model.completed && <Text style={styles.muted}>Current standings · results may change</Text>}
    </View>
    <Text style={styles.eyebrow}>SCORES & NET $</Text>
    {model.players.map(player => <View key={player.name} style={styles.row}>
      <View style={styles.player}>
        <Text style={styles.name}>{player.name}</Text>
        <Text style={styles.muted}>{player.scoreLabel}</Text>
      </View>
      <Text style={[styles.net, { color: player.net > 0 ? COLORS.primary : player.net < 0 ? COLORS.error : COLORS.textDim }]}>{player.amount}</Text>
    </View>)}
    {!!model.lines.length && <View style={styles.games}>{model.lines.map(line => <Text key={line} style={styles.result}>{line}</Text>)}</View>}
    {(CROSS_DEVICE_SHARING_ENABLED || !!model.liveUrl) && <>
      <Text style={styles.eyebrow}>FOLLOW THE ROUND</Text>
      {model.liveUrl ? <Text accessibilityRole="link" onPress={() => void Linking.openURL(model.liveUrl!)} style={styles.link}>{model.liveUrl}</Text>
        : <Text style={styles.muted}>Use “Share live scoreboard” below to add a live link.</Text>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: COLORS.surfaceLow, borderRadius: 24, borderWidth: 1, borderColor: COLORS.primary + '55', padding: 24, gap: 10 },
  eyebrow: { color: COLORS.primary, fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.8 },
  title: { color: COLORS.text, fontFamily: FONTS.headline, fontSize: 24 },
  muted: { color: COLORS.textDim, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 18 },
  hero: { alignItems: 'center', backgroundColor: COLORS.primary + '12', borderRadius: 18, padding: 20, gap: 8, marginVertical: 8 },
  trophy: { fontSize: 36 }, winner: { color: COLORS.text, fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 24, textAlign: 'center' },
  amount: { color: COLORS.primary, fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 44 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.textDim + '33' },
  player: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: COLORS.text, fontFamily: FONTS.medium, fontSize: 15 }, net: { fontFamily: FONTS.bold, fontSize: 16, flexShrink: 0 },
  games: { paddingVertical: 10, gap: 8 }, result: { color: COLORS.text, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 19 },
  link: { color: COLORS.primary, fontFamily: FONTS.medium, fontSize: 12, textDecorationLine: 'underline' },
});
