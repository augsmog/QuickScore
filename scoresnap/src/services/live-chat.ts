import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '../db/supabase';
import { validShareToken } from './live-share-snapshot';
import { chatError, sanitizeMessages, validateMessage, type HostMessage } from './live-chat-model';
const SESSION_KEY = 'snapscore.chat.session.v1';
const NAME_KEY = 'snapscore.chat.name.v1';
let sessionPromise: Promise<string> | undefined;
export function getChatSession(): Promise<string> {
  if (!sessionPromise) sessionPromise = (async () => {
    const stored = await AsyncStorage.getItem(SESSION_KEY);
    if (validShareToken(stored)) return stored;
    const session = Array.from(await Crypto.getRandomBytesAsync(32), b => b.toString(16).padStart(2, '0')).join('');
    await AsyncStorage.setItem(SESSION_KEY, session);
    return session;
  })().catch(() => { sessionPromise = undefined; throw new Error('Chat needs local storage. Enable it and try again.'); });
  return sessionPromise;
}
export const loadChatName = () => AsyncStorage.getItem(NAME_KEY);
export async function saveChatName(name: string) {
  const clean = validateMessage(name, 'name').name;
  await AsyncStorage.setItem(NAME_KEY, clean);
  return clean;
}
export async function listMessages(token: string) {
  if (!validShareToken(token)) throw chatError('invalid link');
  const { data, error } = await supabase.rpc('list_messages', { p_token: token, p_since: null });
  if (error) throw chatError(error.message);
  return sanitizeMessages(data);
}
export async function postMessage(token: string, name: string, body: string) {
  if (!validShareToken(token)) throw chatError('invalid link');
  const clean = validateMessage(name, body);
  const session = await getChatSession();
  const { error } = await supabase.rpc('post_message', { p_token: token, p_session: session, p_name: clean.name, p_body: clean.body });
  if (error) throw chatError(error.message);
}
export async function listHostMessages(localId: string): Promise<HostMessage[]> {
  const { data, error } = await supabase.rpc('list_host_messages', { p_local_id: localId });
  if (error) throw new Error('Unable to load chat moderation.');
  const clean = sanitizeMessages(data);
  return clean.map((row, index) => ({ ...row, id: data[index].id }));
}
export async function removeMessage(id: string) {
  const { error } = await supabase.rpc('remove_message', { p_message_id: id });
  if (error) throw new Error('Unable to remove message. Try again.');
}
