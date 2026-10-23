import { COLORS, FONTS } from "./theme";
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { listMessages, postMessage, loadChatName, saveChatName, listHostMessages, removeMessage } from '../services/live-chat';
import { CHAT_POLL_MS, type ChatMessage, type HostMessage } from '../services/live-chat-model';
const text = { fontFamily: FONTS.regular, color: COLORS.text, fontSize: 16, lineHeight: 26 };
const input = { fontFamily: FONTS.regular, color: COLORS.text, borderColor: COLORS.border, borderWidth: 1, padding: 10, borderRadius: 6 };
function Messages({ messages }: { messages: ChatMessage[] }) {
  return <View accessibilityLiveRegion="polite">{messages.map((m, i) => <View key={`${m.created_at}:${i}`} style={{ paddingVertical: 8 }}>
    <Text style={text}>{m.display_name}: {m.body}</Text>
    <Text style={{ color: COLORS.textDim }}>{new Date(m.created_at).toLocaleTimeString()}</Text>
  </View>)}</View>;
}
export function LiveChat({ token }: { token: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [name, setName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [readable, setReadable] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadChatName().then(n => { if (alive) { setName(n || ''); setReady(true); } }).catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(false), 30000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    let alive = true; let fetching = false;
    async function refresh() {
      if (fetching) return;
      fetching = true;
      try { const rows = await listMessages(token); if (alive) { setMessages(rows); setReadable(true); setPollError(''); } }
      catch (e) { if (alive) { setMessages([]); setReadable(false); setPollError((e as Error).message); } }
      finally { fetching = false; }
    }
    void refresh();
    const timer = setInterval(refresh, CHAT_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [token, tick]);
  async function join() {
    setBusy(true);
    try { setName(await saveChatName(draftName)); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function send() {
    if (busy || cooldown || !readable) return;
    setBusy(true);
    try { await postMessage(token, name, body); setBody(''); setError(''); setTick(n => n + 1); }
    catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (message.includes('Wait 30 seconds')) setCooldown(true);
      if (/revoked|expired|Invalid share link/.test(message)) { setMessages([]); setReadable(false); }
    } finally { setBusy(false); }
  }
  return <View style={{ gap: 10, marginTop: 18 }}>
    <Text style={{ ...text, fontWeight: '700', fontSize: 20 }}>Round chat</Text>
    <Text style={{ color: COLORS.textDim }}>Anyone with the link can chat. Use a display name without contact details. Updates every 5 seconds.</Text>
    <Messages messages={messages} />
    {!!(pollError || error) && <Text accessibilityRole="alert" style={text}>{pollError || error}</Text>}
    {ready && (!name ? <>
      <TextInput accessibilityLabel="Chat display name" placeholder="Display name (1–30 characters)" placeholderTextColor="#a8b8ae" value={draftName} onChangeText={setDraftName} style={input} />
      <Pressable accessibilityRole="button" disabled={busy || !readable} onPress={join}><Text style={text}>Join chat</Text></Pressable>
    </> : <>
      <Text style={text}>Chatting as {name}</Text>
      <TextInput accessibilityLabel="Chat message" placeholder="Message (1–500 characters)" placeholderTextColor="#a8b8ae" value={body} onChangeText={setBody} editable={!busy && readable} multiline style={input} />
      <Pressable accessibilityRole="button" disabled={busy || cooldown || !readable} onPress={send}><Text style={text}>{cooldown ? 'Wait 30 seconds' : busy ? 'Sending…' : 'Send message'}</Text></Pressable>
    </>)}
  </View>;
}
export function HostChat({ localId }: { localId: string }) {
  const [messages, setMessages] = useState<HostMessage[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true; let fetching = false;
    async function refresh() {
      if (fetching) return;
      fetching = true;
      try { const rows = await listHostMessages(localId); if (alive) { setMessages(rows); setError(''); } }
      catch (e) { if (alive) { setMessages([]); setError((e as Error).message); } }
      finally { fetching = false; }
    }
    void refresh();
    const timer = setInterval(refresh, CHAT_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [localId, tick]);
  async function remove(id: string) {
    setBusy(true);
    try { await removeMessage(id); setMessages(rows => rows.filter(m => m.id !== id)); setTick(n => n + 1); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 8, marginVertical: 12 }}>
    <Text style={text}>Round chat · host moderation</Text>
    {!!error && <Text accessibilityRole="alert" style={text}>{error}</Text>}
    {messages.map(m => <View key={m.id}><Messages messages={[m]} /><Pressable accessibilityRole="button" accessibilityLabel={`Remove message from ${m.display_name}`} disabled={busy} onPress={() => remove(m.id)}><Text style={{ color: COLORS.primary, padding: 8 }}>Remove message</Text></Pressable></View>)}
    {!messages.length && !error && <Text style={text}>No messages yet.</Text>}
  </View>;
}
