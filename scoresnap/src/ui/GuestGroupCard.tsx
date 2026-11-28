import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { client, onlineQueue, queueSnapshotScore, refreshOnline, resolveOnlineConflict, watchOnline } from '../services/cross-device';
import { formatDollars, groupCard, leaderboard, money, nextHole } from '../services/player-link';
import { useOnlineStore } from '../stores/online-store';
import { COLORS, FONTS, RADII } from './theme';

const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

/**
 * The web guest's round: one group's card to keep, and the live board with the money.
 * Scores go through the same durable queue the app uses, so a dropped connection keeps them.
 */
export function GuestGroupCard({ contestId, playerId, onGone }: { contestId: string; playerId: string; onGone: (message: string) => void }) {
  const event = useOnlineStore(s => s.events[contestId]);
  const [tab, setTab] = useState<'card' | 'board'>('card');
  const [hole, setHole] = useState<number | null>(null);
  // What the guest just tapped, shown until the server's copy catches up.
  const [pending, setPending] = useState<Record<string, number | null>>({});
  const [status, setStatus] = useState('');
  const seen = useRef(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const refresh = async () => { await refreshOnline(); return useOnlineStore.getState().events[contestId]?.snapshot ?? null; };
    const change = (state: string) => {
      stop?.(); stop = undefined;
      if (state === 'active') stop = watchOnline(contestId, refresh, () => setStatus('Reconnecting. Your scores are kept on this device.'));
    };
    change(AppState.currentState ?? 'active');
    const sub = AppState.addEventListener('change', change);
    return () => { sub.remove(); stop?.(); };
  }, [contestId]);

  // Access can end while the page is open: the organizer revoked links, or the round finished.
  useEffect(() => {
    if (event) { seen.current = true; return; }
    if (seen.current) onGone('The organizer ended web access for this round, or the round is finished.');
  }, [event, onGone]);

  if (!event) return <Text style={styles.note}>Loading the round…</Text>;
  const { snapshot } = event;
  const card = groupCard(snapshot, playerId);
  const current = card ? Math.min(hole ?? nextHole(card), card.round.course.holes.length || 18) : 1;
  const holes = card ? card.round.course.holes.length || 18 : 18;
  const par = card?.round.course.holes.find(h => h.num === current)?.par ?? 4;
  const closed = snapshot.completed || snapshot.capabilities.enabled !== true;

  async function save(player: string, strokes: number | null) {
    if (!card) return;
    const key = `${card.round.id}:${player}:${current}`;
    // Stay on this hole: the card never moves on by itself while someone is entering scores.
    setHole(current);
    setPending(p => ({ ...p, [key]: strokes }));
    setStatus('');
    try {
      await queueSnapshotScore(contestId, card.round.id, player, current, strokes);
      await client.discover();
      const queue = await onlineQueue();
      const mine = queue.entries.filter(e => e.draft.contest_id === contestId);
      // Someone else changed this hole first: show theirs and say so. Nothing is overwritten silently.
      for (const entry of mine.filter(e => e.state === 'conflict')) {
        await resolveOnlineConflict(entry.id, 'keep-current');
        setStatus(`Hole ${entry.draft.hole} was just changed on another device. Showing the latest score; change it again if it is wrong.`);
      }
      if (mine.some(e => e.state === 'denied')) setStatus('That score was not accepted. You can only score your own group.');
      await client.discover();
    } catch {
      setStatus('Saved on this device. It will send when you are back online.');
    } finally {
      setPending(p => { const next = { ...p }; delete next[key]; return next; });
    }
  }

  const board = leaderboard(snapshot);
  const cash = money(snapshot);
  return <View style={{ gap: 16 }}>
    <View accessibilityRole="tablist" style={styles.tabs}>
      {(['card', 'board'] as const).map(name => <Pressable key={name} testID={`guest-tab-${name}`} accessibilityRole="tab" accessibilityState={{ selected: tab === name }}
        onPress={() => setTab(name)} style={[styles.tab, tab === name && styles.tabOn]}>
        <Text style={[styles.tabText, tab === name && { color: COLORS.onPrimary }]}>{name === 'card' ? 'Scorecard' : 'Leaderboard'}</Text>
      </Pressable>)}
    </View>
    {!!status && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>}

    {tab === 'card' && !card && <Text style={styles.note}>Your player is not in a group yet. Ask the organizer.</Text>}
    {tab === 'card' && card && <View style={{ gap: 12 }}>
      <Text style={styles.note}>{card.round.name} · {card.groupName}{closed ? ' · scoring closed' : ''}</Text>
      <View style={styles.holeBar}>
        <Pressable testID="guest-hole-prev" accessibilityRole="button" accessibilityLabel="Previous hole" disabled={current <= 1} onPress={() => setHole(current - 1)} style={[styles.step, current <= 1 && styles.off]}><Text style={styles.stepText}>‹</Text></Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text testID="guest-hole" accessibilityRole="header" style={styles.hole}>Hole {current}</Text>
          <Text style={styles.note}>Par {par}</Text>
        </View>
        <Pressable testID="guest-hole-next" accessibilityRole="button" accessibilityLabel="Next hole" disabled={current >= holes} onPress={() => setHole(current + 1)} style={[styles.step, current >= holes && styles.off]}><Text style={styles.stepText}>›</Text></Pressable>
      </View>
      {card.players.map(player => {
        const key = `${card.round.id}:${player.id}:${current}`;
        const server = player.cells.find(c => c.hole === current)?.strokes ?? null;
        const value = key in pending ? pending[key] : server;
        const total = player.cells.reduce((sum, c) => sum + (c.strokes ?? 0), 0);
        return <View key={player.id} style={styles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.name}>{player.displayName}</Text>
            <Text style={styles.note}>{total ? `${total} so far` : 'No scores yet'}</Text>
          </View>
          <Pressable testID={`guest-minus-${player.displayName}`} accessibilityRole="button" accessibilityLabel={`One fewer for ${player.displayName}`} disabled={closed || !value || value <= 1}
            onPress={() => void save(player.id, (value ?? par) - 1)} style={[styles.step, (closed || !value || value <= 1) && styles.off]}><Text style={styles.stepText}>−</Text></Pressable>
          <Text testID={`guest-score-${player.displayName}`} accessibilityLabel={`${player.displayName}, hole ${current}: ${value ?? 'no score'}`} style={styles.score}>{value ?? '–'}</Text>
          <Pressable testID={`guest-plus-${player.displayName}`} accessibilityRole="button" accessibilityLabel={value ? `One more for ${player.displayName}` : `Enter par for ${player.displayName}`} disabled={closed || (value ?? 0) >= 15}
            onPress={() => void save(player.id, value ? value + 1 : par)} style={[styles.step, (closed || (value ?? 0) >= 15) && styles.off]}><Text style={styles.stepText}>+</Text></Pressable>
        </View>;
      })}
      <Text style={styles.note}>Tap + to enter par, then adjust. Scores save as you tap.</Text>
    </View>}

    {tab === 'board' && <View style={{ gap: 4 }}>
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
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: COLORS.surfaceHigh, borderRadius: RADII.xl, padding: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.xl },
  tabOn: { backgroundColor: COLORS.primary },
  tabText: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.text },
  note: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: COLORS.textDim },
  status: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 22, color: COLORS.warn, backgroundColor: COLORS.warnContainer, padding: 12, borderRadius: 12 },
  holeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 16, padding: 12 },
  hole: { fontFamily: FONTS.display, fontSize: 30, color: COLORS.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 16, padding: 12 },
  name: { fontFamily: FONTS.semibold, fontSize: 18, color: COLORS.text },
  step: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceHighest },
  off: { opacity: 0.35 },
  stepText: { fontFamily: FONTS.semibold, fontSize: 28, lineHeight: 32, color: COLORS.primary },
  score: { width: 44, textAlign: 'center', fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 30, color: COLORS.text },
  heading: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.primary },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderBottomWidth: 1, borderColor: COLORS.surfaceHigh },
  boardScore: { width: 52, textAlign: 'right', fontFamily: FONTS.score, fontVariant: ['tabular-nums'], fontSize: 20, color: COLORS.text },
  pay: { fontFamily: FONTS.regular, fontSize: 17, lineHeight: 28, color: COLORS.text },
});
