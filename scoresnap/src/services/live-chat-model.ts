export type ChatMessage = { display_name: string; body: string; created_at: string };
export type HostMessage = ChatMessage & { id: string };
export const CHAT_POLL_MS = 5000;
// Count Unicode characters like PostgreSQL char_length, including emoji.
export function validateMessage(name: string, body: string) {
  const displayName = name.trim();
  const message = body.trim();
  if ([...displayName].length < 1 || [...displayName].length > 30) throw new Error('Enter a display name of 1–30 characters.');
  if ([...message].length < 1 || [...message].length > 500) throw new Error('Enter a message of 1–500 characters.');
  return { name: displayName, body: message };
}
export function chatError(message: string): Error {
  if (message.includes('rate limit')) return new Error('Chat is busy. Wait 30 seconds before trying again.');
  if (message.includes('revoked')) return new Error('This share link has been revoked.');
  if (message.includes('expired')) return new Error('This share link has expired.');
  if (message.includes('invalid link')) return new Error('Invalid share link.');
  return new Error('Unable to load or send chat. Please try again.');
}
// Rebuild the public allowlist; text stays literal and is rendered only in React Text.
export function sanitizeMessages(data: unknown): ChatMessage[] {
  if (!Array.isArray(data)) throw new Error('Invalid chat response.');
  return data.map(row => {
    if (!row || typeof row.display_name !== 'string' || typeof row.body !== 'string'
      || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Invalid chat response.');
    const clean = validateMessage(row.display_name, row.body);
    return { display_name: clean.name, body: clean.body, created_at: row.created_at };
  });
}
