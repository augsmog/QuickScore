import { FullScreenSheet } from "./SafeScreen";
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { COLORS, FONTS } from './theme';
import { maskChatText } from '../services/chat-filter';
import { blockParticipant, emptyPreferences, hideReportedMessage, unblockParticipant, visibleMessages, type ChatPreferences, type ModeratedMessage } from '../services/chat-moderation-model';
import { loadChatPreferences, saveChatPreferences, reportChatMessage, type ChatContext } from '../services/live-chat';
const text = { fontFamily: FONTS.regular, color: COLORS.text, fontSize: 16, lineHeight: 26 };
const target = { minHeight: 44, minWidth: 44, justifyContent: 'center' as const, padding: 8 };
export function ChatModeration({ messages, context, onRemove }: { messages: ModeratedMessage[]; context: ChatContext; onRemove?: (id: string) => void }) {
  const [preferences, setPreferences] = useState(emptyPreferences);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ModeratedMessage | null>(null);
  const [report, setReport] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void loadChatPreferences().then(p => { if (alive) { setPreferences(p); setReady(true); } })
      .catch(() => { if (alive) setError('Unable to load chat preferences. Open chat again.'); });
    return () => { alive = false; };
  }, []);
  async function persist(next: ChatPreferences) {
    await saveChatPreferences(next); setPreferences(next);
  }
  async function act(kind: 'block' | 'report') {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      if (kind === 'report') {
        // Hide before the request; failures leave the sheet open for retry.
        await persist(hideReportedMessage(preferences, selected.id));
        await reportChatMessage(context, selected.id);
      } else await persist(blockParticipant(preferences, selected));
      setSelected(null); setReport(false);
      if (kind === 'report') Alert.alert('Report sent', 'The SnapScore team reviews reports within 24 hours.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <View>
    {!!error && <Text accessibilityRole="alert" style={text}>{error}</Text>}
    {ready && visibleMessages(messages, preferences).map(m => <View key={m.id} style={{ paddingVertical: 8 }}>
      <Text style={text}>{maskChatText(m.display_name)}: {maskChatText(m.body)}</Text>
      <Text style={text}>{new Date(m.created_at).toLocaleTimeString()}</Text>
      {!m.is_own && <Pressable accessibilityRole="button" accessibilityLabel={`Message actions for ${maskChatText(m.display_name)}`} style={target} onPress={() => { setSelected(m); setReport(false); }}><Text style={text}>Message actions</Text></Pressable>}
      {!!onRemove && <Pressable accessibilityRole="button" style={target} onPress={() => onRemove(m.id)}><Text style={text}>Remove message</Text></Pressable>}
    </View>)}
    <Pressable accessibilityRole="button" style={target} onPress={() => setBlockedOpen(v => !v)}><Text style={text}>Blocked people</Text></Pressable>
    {blockedOpen && (Object.keys(preferences.blocked).length ? Object.entries(preferences.blocked).map(([id, name]) =>
      <Pressable key={id} accessibilityRole="button" style={target} disabled={busy} onPress={() => {
        setBusy(true); void persist(unblockParticipant(preferences, id)).catch(() => setError('Unable to save chat preferences.')).finally(() => setBusy(false));
      }}><Text style={text}>Unblock {maskChatText(name)}</Text></Pressable>) : <Text style={text}>No blocked people.</Text>)}
    <FullScreenSheet visible={!!selected} transparent animationType="slide" onRequestClose={() => { if (!busy) setSelected(null); }}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <View accessibilityViewIsModal style={{ backgroundColor: COLORS.bg, padding: 24, gap: 8 }}>
          <Text style={text}>{report ? 'Report this message? The SnapScore team reviews reports within 24 hours.' : 'Message actions'}</Text>
          {!!error && <Text accessibilityRole="alert" style={text}>{error}</Text>}
          <Pressable accessibilityRole="button" style={target} disabled={busy} onPress={() => report ? void act('report') : setReport(true)}><Text style={text}>{report ? 'Send report' : 'Report'}</Text></Pressable>
          {!report && <Pressable accessibilityRole="button" style={target} disabled={busy} onPress={() => void act('block')}><Text style={text}>Block {maskChatText(selected?.display_name || '')}</Text></Pressable>}
          <Pressable accessibilityRole="button" style={target} disabled={busy} onPress={() => { setSelected(null); setReport(false); }}><Text style={text}>Cancel</Text></Pressable>
        </View>
      </View>
    </FullScreenSheet>
  </View>;
}
