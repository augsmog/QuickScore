import { requireCleanChat } from './chat-filter';
import { readPreferences, type ChatPreferences, type ModeratedMessage } from './chat-moderation-model';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '../db/supabase';
import { CHAT_NAME_KEY, CHAT_SESSION_KEY, CHAT_MODERATION_KEY, persistGate } from '../stores/persisted-keys';
import { validShareToken } from './live-share-snapshot';
import { chatError, sanitizeMessages, validateMessage, type HostMessage } from './live-chat-model';
let sessionPromise: Promise<string> | undefined;
let sessionGeneration = 0;
export function resetChatSessionCache() {
  sessionGeneration += 1;
  sessionPromise = undefined;
}
export function getChatSession(): Promise<string> {
  const generation = sessionGeneration;
  if (!sessionPromise) sessionPromise = (async () => {
    const stored = await AsyncStorage.getItem(CHAT_SESSION_KEY);
    if (generation !== sessionGeneration) return '';
    if (validShareToken(stored)) return stored;
    const session = Array.from(await Crypto.getRandomBytesAsync(32), b => b.toString(16).padStart(2, '0')).join('');
    if (generation !== sessionGeneration || persistGate.suppressed) return session;
    await AsyncStorage.setItem(CHAT_SESSION_KEY, session);
    return session;
  })().catch(() => {
    if (sessionGeneration === generation) sessionPromise = undefined;
    throw new Error('Chat needs local storage. Enable it and try again.');
  });
  return sessionPromise;
}
export const loadChatName = () => AsyncStorage.getItem(CHAT_NAME_KEY);
export async function saveChatName(name: string) {
  requireCleanChat(name, '');
  const clean = validateMessage(name, 'name').name;
  if (!persistGate.suppressed) await AsyncStorage.setItem(CHAT_NAME_KEY, clean);
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
  requireCleanChat(name, body);
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

export async function loadChatPreferences() {
  return readPreferences(await AsyncStorage.getItem(CHAT_MODERATION_KEY));
}
export async function saveChatPreferences(state: ChatPreferences) {
  if (persistGate.suppressed) throw new Error('Chat preferences are unavailable. Open chat again.');
  await AsyncStorage.setItem(CHAT_MODERATION_KEY, JSON.stringify(state));
}
export type ChatContext = { token: string } | { localId: string };
async function moderationArgs(context: ChatContext) {
  return { p_token: 'token' in context ? context.token : null,
    p_local_id: 'localId' in context ? context.localId : null, p_session: await getChatSession() };
}
export async function listModeratedMessages(context: ChatContext): Promise<ModeratedMessage[]> {
  const { data, error } = await supabase.rpc('list_moderated_messages', await moderationArgs(context));
  if (error) throw chatError(error.message);
  return sanitizeMessages(data).map((row, i) => {
    const source = data[i];
    if (typeof source.id !== 'string' || typeof source.participant_id !== 'string' || typeof source.is_own !== 'boolean') throw new Error('Invalid chat response.');
    return { ...row, id: source.id, participant_id: source.participant_id, is_own: source.is_own };
  });
}
export async function reportChatMessage(context: ChatContext, id: string) {
  const { error } = await supabase.rpc('report_chat_message', {
    ...await moderationArgs(context), p_message_id: id, p_reason: 'Offensive or abusive content',
  });
  if (error) throw new Error('Unable to send report. Please try again.');
}
