import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../db/supabase';
import { client, onlineEnabled } from '../services/cross-device';
import { playerLinkApi } from '../services/player-link';
import { fixTarget, reopenLine, reopenState, type ReopenState, type ReopenWindow } from '../services/reopen-window';
import { useOnlineStore } from '../stores/online-store';
import { COLORS, FONTS } from './theme';

const api = playerLinkApi((name, args) => supabase.rpc(name, args) as unknown as Promise<{ data: any; error: any }>);
const newId = () => require('expo-crypto').randomUUID() as string;

export interface Reopen {
  /** Null when this round has no reopen: not finalized, not shared, or this person cannot score it. */
  state: ReopenState | null;
  line: string; message: string; busy: boolean;
  reopen: () => Promise<void>;
  /** Fix one score on a reopened card. Needs a connection; says so if it fails. */
  fix: (roundNumber: number, localPlayerId: string, hole: number, strokes: number | null) => Promise<void>;
}

/**
 * A finalized, shared round: final at once, one hour in which a scorer may reopen to fix a
 * score, locked after. The server keeps the clock and refuses late writes; this shows it.
 */
export function useReopen(contestId: string, completed: boolean): Reopen {
  const event = useOnlineStore(s => s.events[contestId]);
  const role = event?.membership.role;
  const applies = onlineEnabled && completed && event?.snapshot.protocol === 1 && (role === 'host' || role === 'player' || role === 'scorer');
  const [window, setWindow] = useState<ReopenWindow>({});
  const [offset, setOffset] = useState(0); // server clock minus this phone's clock
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const sending = useRef(false);

  useEffect(() => {
    setWindow({}); setOffset(0); setMessage('');
    if (!applies) return;
    let alive = true;
    void api.window(contestId).then(w => {
      if (!alive || !w) return;
      setOffset(Date.parse(w.now) - Date.now());
      setWindow({ finalizedAt: w.finalized_at, reopenedUntil: w.reopened_until });
    });
    // The minute count and the lock both move with time, not with a tap.
    const timer = setInterval(() => setTick(n => n + 1), 20000);
    return () => { alive = false; clearInterval(timer); };
  }, [applies, contestId]);

  const now = Date.now() + offset;
  const state = applies ? reopenState(window, now) : null;

  async function reopen() {
    if (sending.current || state !== 'final') return;
    sending.current = true; setBusy(true); setMessage('');
    try { const { until } = await api.reopen(contestId); setWindow(w => ({ ...w, reopenedUntil: until })); }
    catch (e) {
      if ((e as Error).message.includes('locked')) setWindow(w => ({ ...w, closed: true }));
      else setMessage((e as Error).message);
    } finally { sending.current = false; setBusy(false); }
  }

  async function fix(roundNumber: number, localPlayerId: string, hole: number, strokes: number | null) {
    if (sending.current || state !== 'reopened') return;
    const snapshot = useOnlineStore.getState().events[contestId]?.snapshot;
    const target = snapshot && fixTarget(snapshot, roundNumber, localPlayerId, hole);
    if (!target) { setMessage('That score is not in the shared round, so it cannot be fixed here.'); return; }
    sending.current = true; setBusy(true); setMessage('');
    try {
      const receipt = await api.correct({ ...target, strokes }, newId());
      await client.discover();
      setMessage(receipt.flagged ? `Hole ${hole}: sent to the group scorekeeper to decide. The first score counts until then.`
        : receipt.status === 'conflict' ? `Hole ${hole} was just changed on another device. Check it and fix it again if it is wrong.`
        : `Hole ${hole} fixed.`);
    } catch (e) {
      if ((e as Error).message.includes('finished or paused') || (e as Error).message.includes('locked')) setWindow(w => ({ ...w, closed: true }));
      else setMessage(`Not saved. ${(e as Error).message}`);
    } finally { sending.current = false; setBusy(false); }
  }

  return { state, line: state ? reopenLine(window, now) : '', message, busy, reopen, fix };
}

/** The three looks of a finalized round on the score screen. All wording is a draft. */
export function ReopenBanner({ reopen }: { reopen: Reopen }) {
  if (!reopen.state) return null;
  return <View testID={`reopen-${reopen.state}`} style={[styles.box, reopen.state === 'reopened' && styles.open]}>
    <Text style={styles.line}>{reopen.line}</Text>
    {reopen.state === 'final' && <Pressable testID="reopen-button" accessibilityRole="button" accessibilityState={{ disabled: reopen.busy, busy: reopen.busy }}
      disabled={reopen.busy} onPress={() => void reopen.reopen()} style={({ pressed }) => [styles.button, (pressed || reopen.busy) && styles.dim]}>
      <Text style={styles.buttonText}>{reopen.busy ? 'Reopening…' : 'Reopen to fix a score'}</Text>
    </Pressable>}
    {!!reopen.message && <Text testID="reopen-message" accessibilityLiveRegion="polite" style={styles.line}>{reopen.message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  box: { marginHorizontal: 20, marginTop: 8, padding: 12, borderRadius: 16, backgroundColor: COLORS.surfaceHigh, gap: 4 },
  open: { backgroundColor: COLORS.warnContainer },
  // Tabular figures: the minute count changes without the line shifting.
  line: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 21, color: COLORS.text, fontVariant: ['tabular-nums'] },
  button: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  buttonText: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.primary },
  dim: { opacity: 0.5 },
});
