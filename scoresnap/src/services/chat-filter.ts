// Whole words only, to avoid masking ordinary names.
const WORDS = ['fuck', 'fucking', 'shit', 'bullshit', 'cunt'];
const pattern = () => new RegExp(`\\b(${WORDS.join('|')})\\b`, 'gi');
export const hasObjectionableWords = (value: string) => pattern().test(value.normalize('NFKC'));
export const maskChatText = (value: string) => value.normalize('NFKC').replace(pattern(), '••••');
export function requireCleanChat(name: string, body: string) {
  if (hasObjectionableWords(name) || hasObjectionableWords(body)) throw new Error('Please change the language before sending.');
}
