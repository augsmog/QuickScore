import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { client, onlineQueue, queueSnapshotScore, refreshOnline, resolveOnlineConflict, watchOnline } from '../services/cross-device';
import * as Crypto from 'expo-crypto';
import { supabase } from '../db/supabase';
import { flagLabel, groupCard, nextHole, playerLinkApi, type ScoreFlag } from '../services/player-link';
import { RoundBoard } from './RoundBoard';
import { useOnlineStore } from '../stores/online-store';
import { COLORS, FONTS, RADII } from './theme';

const api = playerLinkApi((name, args) => supabase.rpc(name, args) as unknown as Promise<{ data: any; error: any }>);

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
  // Changes waiting for the group's scorekeeper (or the organizer) to accept or deny.
  const [flags, setFlags] = useState<ScoreFlag[]>([]);
  // After the organizer finalizes, a scorer can reopen for one hour to fix a score.
  const [reopenedUntil, setReopenedUntil] = useState<string | null>(null);
  // Scores entered with no signal: queued on this device, shown as not sent until the server has them.
  const [unsent, setUnsent] = useState<Record<string, number | null>>({});
  const revision = event?.snapshot.revision;
  useEffect(() => {
    let alive = true;
    if (revision === undefined) return;
    api.flags(contestId).then(list => { if (alive) setFlags(list); }).catch(() => {});
    return () => { alive = false; };
  }, [contestId, revision]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const refresh = async () => { await refreshOnline(); return useOnlineStore.getState().events[contestId]?.snapshot ?? null; };
    const change = (state: string) => {
      stop?.(); stop = undefined;
      if (state === 'active') stop = watchOnline(contestId, refresh, () => { if (!useOnlineStore.getState().events[contestId]?.snapshot.completed) setStatus('Reconnecting. Your scores are kept on this device.'); });
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

  // A score entered with no signal stops being "not sent" once the server shows it.
  const cellsNow = event?.snapshot;
  useEffect(() => {
    if (!cellsNow || !Object.keys(unsent).length) return;
    const arrived = Object.keys(unsent).filter(key => {
      const [round, player, hole] = key.split(':');
      const cell = cellsNow.rounds.find(r => r.id === round)?.players.find(p => p.id === player)?.cells.find(c => c.hole === Number(hole));
      return (cell?.strokes ?? null) === unsent[key];
    });
    if (!arrived.length) return;
    setUnsent(u => { const next = { ...u }; for (const key of arrived) delete next[key]; return next; });
    if (arrived.length === Object.keys(unsent).length) setStatus(s => s.startsWith('Not sent yet') ? 'Back online. Your scores were sent.' : s);
  }, [cellsNow, unsent]);

  if (!event) return <Text style={styles.note}>Loading the round…</Text>;
  const { snapshot } = event;
  const card = groupCard(snapshot, playerId);
  const current = card ? Math.min(hole ?? nextHole(card), card.round.course.holes.length || 18) : 1;
  const holes = card ? card.round.course.holes.length || 18 : 18;
  const par = card?.round.course.holes.find(h => h.num === current)?.par ?? 4;
  const reopened = !!reopenedUntil && Date.parse(reopenedUntil) > Date.now();
  const closed = (snapshot.completed && !reopened) || (!snapshot.completed && snapshot.capabilities.enabled !== true);
  const FLAGGED = "Sent to your group's scorekeeper to approve. The score already entered counts until they decide.";

  async function save(player: string, strokes: number | null) {
    if (!card) return;
    const key = `${card.round.id}:${player}:${current}`;
    // Stay on this hole: the card never moves on by itself while someone is entering scores.
    setHole(current);
    setPending(p => ({ ...p, [key]: strokes }));
    setStatus('');
    try {
      if (snapshot.completed) {
        // A fix on a reopened, finalized card goes straight to the server: it needs a connection.
        const version = card.players.find(p => p.id === player)?.cells.find(c => c.hole === current)?.version ?? 0;
        const receipt = await api.correct({ contest_id: contestId, round_id: card.round.id, player_id: player, hole: current, strokes, version }, Crypto.randomUUID());
        if (receipt.flagged) setStatus(FLAGGED);
        else if (receipt.status === 'conflict') setStatus(`Hole ${current} was just changed on another device. Showing the latest score; change it again if it is wrong.`);
        await client.discover();
        setFlags(await api.flags(contestId));
        return;
      }
      await queueSnapshotScore(contestId, card.round.id, player, current, strokes);
      setUnsent(u => { if (!(key in u)) return u; const next = { ...u }; delete next[key]; return next; });
      await client.discover();
      const queue = await onlineQueue();
      const mine = queue.entries.filter(e => e.draft.contest_id === contestId);
      // Not applied: either held for the group's scorekeeper, or someone else changed this hole
      // first. Either way show what counts now and say so. Nothing is overwritten silently.
      for (const entry of mine.filter(e => e.state === 'conflict')) {
        const held = (entry.receipt as { flagged?: boolean } | undefined)?.flagged === true;
        await resolveOnlineConflict(entry.id, 'keep-current');
        setStatus(held ? FLAGGED : `Hole ${entry.draft.hole} was just changed on another device. Showing the latest score; change it again if it is wrong.`);
      }
      setFlags(await api.flags(contestId).catch(() => flags));
      if (mine.some(e => e.state === 'denied')) setStatus('That score was not accepted. You can only score your own group.');
      await client.discover();
    } catch (e) {
      if (snapshot.completed) setStatus((e as Error).message || 'Could not save the fix. Check your connection and try again.');
      else {
        // No signal: the score is in this device's queue. Keep showing it, marked as not sent,
        // until the server has it. It is sent again by itself when the connection returns.
        setUnsent(u => ({ ...u, [key]: strokes }));
        setStatus('Not sent yet. Your score is kept on this device and will send when you are back online.');
      }
    } finally {
      setPending(p => { const next = { ...p }; delete next[key]; return next; });
    }
  }

  async function reopen() {
    setStatus('');
    try { setReopenedUntil((await api.reopen(contestId)).until); }
    catch (e) { setStatus((e as Error).message); }
  }
  async function decide(flag: ScoreFlag, accept: boolean) {
    setStatus('');
    try { await api.resolveFlag(flag.id, accept); await client.discover(); setFlags(await api.flags(contestId)); }
    catch (e) { setStatus((e as Error).message); }
  }
  const toDecide = flags.filter(f => f.can_resolve && !f.mine);

  return <View style={{ gap: 16 }}>
    <View accessibilityRole="tablist" style={styles.tabs}>
      {(['card', 'board'] as const).map(name => <Pressable key={name} testID={`guest-tab-${name}`} accessibilityRole="tab" accessibilityState={{ selected: tab === name }}
        onPress={() => setTab(name)} style={[styles.tab, tab === name && styles.tabOn]}>
        <Text style={[styles.tabText, tab === name && { color: COLORS.onPrimary }]}>{name === 'card' ? 'Scorecard' : 'Leaderboard'}</Text>
      </Pressable>)}
    </View>
    {!!status && <Text testID="guest-status" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>}

    {tab === 'card' && !card && <Text style={styles.note}>Your player is not in a group yet. Ask the organizer.</Text>}
    {tab === 'card' && card && <View style={{ gap: 12 }}>
      <Text style={styles.note}>{card.round.name} · {card.groupName}{!snapshot.completed && closed ? ' · scoring paused' : ''}</Text>
      {snapshot.completed && <View testID="guest-final" style={styles.final}>
        <Text style={styles.name}>{reopened ? 'Reopened to fix a score' : 'Round finalized'}</Text>
        <Text style={styles.note}>{reopened ? 'Fix what is wrong. The round still shows as final to everyone.' : 'Scores are final. For one hour after finalizing you can reopen your card to fix a mistake.'}</Text>
        {!reopened && <Pressable testID="guest-reopen" accessibilityRole="button" onPress={() => void reopen()} style={styles.textButton}><Text style={styles.link}>Reopen to fix a score</Text></Pressable>}
      </View>}
      {toDecide.map(flag => <View key={flag.id} testID={`guest-flag-${flag.player_name}-${flag.hole}`} style={styles.flag}>
        <Text style={styles.name}>Someone changed a score</Text>
        <Text style={styles.note}>{flagLabel(flag)}. Your {flag.current_strokes ?? 'empty'} counts until you decide.</Text>
        <View style={{ flexDirection: 'row', gap: 24 }}>
          <Pressable testID={`guest-flag-accept-${flag.player_name}-${flag.hole}`} accessibilityRole="button" onPress={() => void decide(flag, true)} style={styles.textButton}><Text style={styles.link}>Use {flag.proposed_strokes ?? 'no score'}</Text></Pressable>
          <Pressable testID={`guest-flag-deny-${flag.player_name}-${flag.hole}`} accessibilityRole="button" onPress={() => void decide(flag, false)} style={styles.textButton}><Text style={styles.link}>Keep {flag.current_strokes ?? 'it empty'}</Text></Pressable>
        </View>
      </View>)}
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
        const asked = flags.find(f => f.mine && f.player_id === player.id && f.round_id === card.round.id && f.hole === current);
        // While my change waits for approval, + and − step from what I asked for.
        const waiting = key in unsent;
        const value = key in pending ? pending[key] : waiting ? unsent[key] : asked ? asked.proposed_strokes : server;
        const total = player.cells.reduce((sum, c) => sum + (c.strokes ?? 0), 0);
        return <View key={player.id} style={styles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.name}>{player.displayName}</Text>
            <Text testID={`guest-row-note-${player.displayName}`} style={styles.note}>{waiting ? 'Not sent yet' : asked ? `Counts as ${server ?? 'no score'} · your change is waiting` : total ? `${total} so far` : 'No scores yet'}</Text>
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

    {tab === 'board' && <RoundBoard snapshot={snapshot} />}
  </View>;
}

const styles = StyleSheet.create({
  final: { backgroundColor: COLORS.surfaceHighest, borderRadius: 16, padding: 14, gap: 4 },
  flag: { backgroundColor: COLORS.warnContainer, borderRadius: 16, padding: 14, gap: 4 },
  textButton: { minHeight: 44, justifyContent: 'center' },
  link: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.primary },
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
});
