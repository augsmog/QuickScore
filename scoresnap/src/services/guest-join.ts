import type { Contest } from "../stores/contest-store";

export const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const normalizeJoinCode = (code: string) => code.trim().toUpperCase();
export const validJoinCode = (code: string) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(normalizeJoinCode(code));
export function generateJoinCode(existing: string[] = [], random = Math.random): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = Array.from({ length: 6 }, () => JOIN_ALPHABET[Math.floor(random() * JOIN_ALPHABET.length)]).join("");
    if (!existing.includes(code)) return code;
  }
  throw new Error("Could not allocate a unique join code. Try again.");
}
export interface GuestBinding { guestId: string; contestId: string; groupId: string; playerId: string; displayName: string }
export interface GuestJoinState { guestId: string | null; bindings: GuestBinding[] }
// Pure store transition: local identities are convenience, not server authorization.
export function bindGuest(state: GuestJoinState, contest: Contest, playerId: string, name: string, newId: () => string): GuestJoinState {
  if (!name.trim()) throw new Error("Enter your display name.");
  if (contest.status !== "active") throw new Error("This contest has ended.");
  const group = contest.groups.find(g => g.players.some(p => p.id === playerId));
  if (!group) throw new Error("Choose an existing player slot.");
  const previous = state.bindings.find(b => b.contestId === contest.id);
  if (previous && previous.playerId !== playerId) throw new Error("This guest is already bound to another player.");
  const guestId = state.guestId || newId();
  return { guestId, bindings: [...state.bindings.filter(b => b.contestId !== contest.id), { guestId, contestId: contest.id, groupId: group.id, playerId, displayName: name.trim() }] };
}
export interface ContestJoinService { lookup(code: string): Promise<Contest | undefined> }
export function localContestJoinService(read: () => Contest[]): ContestJoinService {
  return { async lookup(code) {
    if (!validJoinCode(code)) throw new Error("Enter a valid six-character code.");
    return read().find(c => c.joinCode === normalizeJoinCode(code));
  } };
}
export function claimGuestHistory() {
  // TODO GS-5: authenticated, transactional server claim using a guest capability.
  // No sharing schema exists yet; never imply that local rounds are cloud-backed.
  return "Claim your rounds — coming soon. Your rounds are saved on this device. Keep this browser’s data to retain them.";
}
