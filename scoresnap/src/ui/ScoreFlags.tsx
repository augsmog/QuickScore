import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../db/supabase';
import { client, onlineEnabled } from '../services/cross-device';
import { playerLinkApi, type ScoreFlag } from '../services/player-link';
import { flagLine, flagRole, localFlags } from '../services/score-flags';
import { useFlagStore } from '../stores/flag-store';
import { useOnlineStore } from '../stores/online-store';
import type { Contest } from '../stores/contest-store';
import { COLORS, FONTS } from './theme';

const api = playerLinkApi((name, args) => supabase.rpc(name, args) as unknown as Promise<{ data: any; error: any }>);
const NONE: ScoreFlag[] = [];

/**
 * Score changes waiting for a decision, on the round screen. The group scorekeeper and the
 * organizer get "Use" and "Keep"; the person who asked, and everyone else, see it as waiting.
 * The first score counts until someone decides. All wording here is a draft.
 */
export function ScoreFlags({ contest }: { contest: Contest }) {
  const event = useOnlineStore(s => s.events[contest.id]);
  const flags = useFlagStore(s => s.flags[contest.id]) ?? NONE;
  const setFlags = useFlagStore(s => s.setFlags);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const live = onlineEnabled && event?.snapshot.protocol === 1;
  const revision = event?.snapshot.revision;

  async function load() {
    const list = await api.flags(contest.id);
    setFlags(contest.id, localFlags(list, useOnlineStore.getState().events[contest.id]?.snapshot.id_map));
  }
  useEffect(() => {
    if (!live) { if (useFlagStore.getState().flags[contest.id]?.length) setFlags(contest.id, []); return; }
    // A failed read keeps the last list: a flag must not vanish because the signal dropped.
    void load().catch(() => {});
  }, [live, contest.id, revision]);

  if (!live || (flags.length === 0 && !message)) return null;

  async function decide(flag: ScoreFlag, accept: boolean) {
    if (busy) return;
    setBusy(flag.id); setMessage('');
    try {
      await api.resolveFlag(flag.id, accept);
      if (accept) await client.discover();
      await load();
      setMessage(accept ? 'Score changed.' : 'Score kept.');
    } catch (e) {
      // The link wording for a refusal is about web access; in the app say what happened here.
      setMessage((e as { code?: string }).code === '42501' ? 'You can no longer decide this change. Ask the organizer.' : (e as Error).message);
      void load().catch(() => {});
    }
    finally { setBusy(null); }
  }

  return <View testID="score-flags" style={styles.box}>
    {flags.length > 0 && <Text accessibilityRole="header" style={styles.title}>{flags.length === 1 ? '1 score change waiting' : `${flags.length} score changes waiting`}</Text>}
    {flags.map(flag => {
      const id = `${flag.player_name}-${flag.hole}`;
      const working = busy === flag.id;
      return <View key={flag.id} testID={`score-flag-${id}`} style={styles.row}>
        <Text style={styles.line}>{flagLine(flag)}</Text>
        {flagRole(flag) === 'decide' && working && <Text style={styles.saving}>Saving…</Text>}
        {flagRole(flag) === 'decide' && !working && <View style={styles.actions}>
          <Pressable testID={`score-flag-accept-${id}`} accessibilityRole="button" accessibilityState={{ disabled: !!busy, busy: working }}
            accessibilityLabel={`Use ${flag.proposed_strokes ?? 'no score'} for ${flag.player_name} on hole ${flag.hole}`}
            disabled={!!busy} onPress={() => void decide(flag, true)} style={({ pressed }) => [styles.button, (pressed || !!busy) && styles.dim]}>
            <Text style={styles.buttonText}>Use {flag.proposed_strokes ?? 'no score'}</Text>
          </Pressable>
          <Pressable testID={`score-flag-deny-${id}`} accessibilityRole="button" accessibilityState={{ disabled: !!busy, busy: working }}
            accessibilityLabel={`Keep ${flag.current_strokes ?? 'no score'} for ${flag.player_name} on hole ${flag.hole}`}
            disabled={!!busy} onPress={() => void decide(flag, false)} style={({ pressed }) => [styles.button, (pressed || !!busy) && styles.dim]}>
            <Text style={styles.buttonText}>Keep {flag.current_strokes ?? 'it empty'}</Text>
          </Pressable>
        </View>}
      </View>;
    })}
    {!!message && <Text testID="score-flags-message" accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
  </View>;
}

/** On a player's row: this hole's score has a change waiting. Text, not colour alone. */
export function FlagBadge() {
  return <View testID="score-flag-badge" accessible accessibilityLabel="A score change is waiting on this hole" style={styles.badge}>
    <Text style={styles.badgeText}>Change waiting</Text>
  </View>;
}

const styles = StyleSheet.create({
  box: { marginHorizontal: 20, marginBottom: 8, padding: 12, borderRadius: 16, backgroundColor: COLORS.warnContainer, gap: 6 },
  title: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.warn },
  row: { gap: 2 },
  line: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 21, color: COLORS.text },
  actions: { flexDirection: 'row', gap: 12 },
  button: { minHeight: 44, minWidth: 88, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: COLORS.warn },
  buttonText: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.warn },
  dim: { opacity: 0.5 },
  saving: { minHeight: 44, textAlignVertical: 'center', paddingVertical: 11, fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.warn },
  message: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: COLORS.warnContainer, borderWidth: 1, borderColor: COLORS.warn },
  badgeText: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.warn },
});
