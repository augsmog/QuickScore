import { StyleSheet, Text, View } from 'react-native';
import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';
import { formatDollars, leaderboard, money } from '../services/player-link';
import { COLORS, FONTS } from './theme';

const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

/** The live board web players and spectators both see: everyone to par, then the money. */
export function RoundBoard({ snapshot }: { snapshot: SyncSnapshotV1 }) {
  const board = leaderboard(snapshot);
  const cash = money(snapshot);
  return <View style={{ gap: 4 }}>
      {board.map((row, i) => <View key={row.id} testID={`guest-board-${row.name}`} style={styles.boardRow}>
        <Text style={[styles.note, { width: 28 }]}>{row.thru ? i + 1 : '–'}</Text>
        <Text numberOfLines={1} style={[styles.name, { flex: 1 }]}>{row.name}</Text>
        <Text style={styles.note}>{row.thru ? `thru ${row.thru}` : 'not started'}</Text>
        <Text style={[styles.boardScore, row.toPar < 0 && { color: COLORS.primary }]}>{row.thru ? toPar(row.toPar) : ''}</Text>
      </View>)}
      {!!snapshot.games?.length && <View style={{ marginTop: 16, gap: 4 }}>
        <Text accessibilityRole="header" style={styles.heading}>Money</Text>
        {cash.pending && <Text style={styles.note}>Money shows once the games have enough scores.</Text>}
        {!cash.pending && cash.net.map(n => <View key={n.name} testID={`guest-net-${n.name}`} style={styles.boardRow}>
          <Text numberOfLines={1} style={[styles.name, { flex: 1 }]}>{n.name}</Text>
          <Text style={[styles.boardScore, { width: 96, color: n.amount > 0 ? COLORS.primary : n.amount < 0 ? COLORS.error : COLORS.text }]}>{n.amount > 0 ? '+' : ''}{formatDollars(n.amount)}</Text>
        </View>)}
        {!cash.pending && !!cash.payments.length && <Text accessibilityRole="header" style={[styles.heading, { marginTop: 12 }]}>Who pays whom</Text>}
        {!cash.pending && cash.payments.map(p => <Text key={`${p.from}>${p.to}`} style={styles.pay}>{p.from} pays {p.to} {formatDollars(p.amount)}</Text>)}
        {!snapshot.completed && !cash.pending && <Text style={styles.note}>Running totals. They change until the round is finished.</Text>}
      </View>}
    </View>;
}

const styles = StyleSheet.create({
  note: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: COLORS.textDim },
  name: { fontFamily: FONTS.semibold, fontSize: 18, color: COLORS.text },
  heading: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.primary },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderBottomWidth: 1, borderColor: COLORS.surfaceHigh },
  boardScore: { width: 52, textAlign: 'right', fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 20, color: COLORS.text },
  pay: { fontFamily: FONTS.regular, fontSize: 17, lineHeight: 28, color: COLORS.text },
});
