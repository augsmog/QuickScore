import type { ChatMessage } from './live-chat-model';
export type ModeratedMessage = ChatMessage & { id: string; participant_id: string; is_own: boolean };
export type ChatPreferences = { blocked: Record<string, string>; reported: string[] };
export const emptyPreferences = (): ChatPreferences => ({ blocked: {}, reported: [] });
export function readPreferences(raw: string | null): ChatPreferences {
  if (!raw) return emptyPreferences();
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.reported) || !data.reported.every((id: unknown) => typeof id === 'string')
    || !data.blocked || typeof data.blocked !== 'object' || Array.isArray(data.blocked)
    || !Object.values(data.blocked).every(n => typeof n === 'string')) throw new Error('Unable to load chat preferences.');
  return { blocked: data.blocked, reported: data.reported };
}
export function blockParticipant(state: ChatPreferences, message: ModeratedMessage): ChatPreferences {
  if (message.is_own) return state;
  return { ...state, blocked: { ...state.blocked, [message.participant_id]: message.display_name } };
}
export function unblockParticipant(state: ChatPreferences, id: string): ChatPreferences {
  const blocked = { ...state.blocked }; delete blocked[id]; return { ...state, blocked };
}
export function hideReportedMessage(state: ChatPreferences, id: string): ChatPreferences {
  return { ...state, reported: Array.from(new Set([...state.reported, id])) };
}
export const visibleMessages = (messages: ModeratedMessage[], state: ChatPreferences) =>
  messages.filter(m => !Object.prototype.hasOwnProperty.call(state.blocked, m.participant_id) && !state.reported.includes(m.id));
