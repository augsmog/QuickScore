import { showAlert } from '@/services/platform-alert';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import { supabase } from '../db/supabase';
import { onlineEnabled } from '../services/cross-device';
import { linkUrl, memberLabel, playerLinkApi, webOrigin, type LinkMember } from '../services/player-link';
import { useOnlineStore } from '../stores/online-store';
import type { Contest } from '../stores/contest-store';
import { COLORS, FONTS } from './theme';

const api = playerLinkApi((name, args) => supabase.rpc(name, args) as unknown as Promise<{ data: any; error: any }>);
// A link's secret is shown once by the server. Keep it for this app session so a second
// tap re-shares the same link instead of making another.
const made = new Map<string, string>();

/**
 * Organizer only, for a round with online sharing on: links for people without the app.
 * A player link lets a guest keep one group's card; a spectator link is watch-only.
 */
export function WebLinks({ contest }: { contest: Contest }) {
  const event = useOnlineStore(s => s.events[contest.id]);
  const [members, setMembers] = useState<LinkMember[]>([]);
  const [moving, setMoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const host = onlineEnabled && event?.membership.role === 'host' && event.snapshot.protocol === 1;

  async function refresh() {
    try { setMembers(await api.members(contest.id)); } catch (e) { setMessage((e as Error).message); }
  }
  useEffect(() => { if (host) void refresh(); }, [host, contest.id, event?.snapshot.revision]);
  if (!host) return null;

  async function run(work: () => Promise<string | void>) {
    setBusy(true); setMessage('');
    try { const done = await work(); if (done) setMessage(done); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  const share = (kind: 'player' | 'spectator') => run(async () => {
    const key = `${contest.id}:${kind}`;
    const url = made.get(key) ?? linkUrl(webOrigin(), kind, kind === 'player' ? await api.create(contest.id) : await api.createSpectator(contest.id));
    made.set(key, url);
    const text = kind === 'player'
      ? `Keep score for ${contest.name} in your browser, no app needed: ${url}`
      : `Follow ${contest.name} live: ${url}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(url); return 'Link copied.'; }
    await Share.share({ message: text });
  });
  const end = (kind: 'player' | 'spectator') => {
    const go = () => run(async () => {
      if (kind === 'player') await api.revoke(contest.id); else await api.revokeSpectator(contest.id);
      made.delete(`${contest.id}:${kind}`);
      await refresh();
      return kind === 'player' ? 'Player links ended. Web scorers were removed; their scores stay.' : 'Spectator links ended.';
    });
    showAlert(kind === 'player' ? 'End player links?' : 'End spectator links?',
      kind === 'player' ? 'Everyone scoring on the web is removed. Scores already entered stay.' : 'Anyone watching by link loses access.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'End links', style: 'destructive', onPress: () => void go() }]);
  };
  const remove = (member: LinkMember) => showAlert('Remove this web scorer?', `${memberLabel(member)} can no longer enter scores. Scores already entered stay.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void run(async () => { await api.remove(contest.id, member.member_id); await refresh(); return 'Web scorer removed.'; }) }]);
  const players = event!.snapshot.rounds[0]?.players.filter(p => p.group_id) ?? [];
  const button = (label: string, action: () => void, id: string, danger = false) => <Pressable testID={id} accessibilityRole="button" disabled={busy} onPress={action} style={{ minHeight: 44, justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
    <Text style={{ fontFamily: FONTS.semibold, fontSize: 16, color: danger ? COLORS.error : COLORS.primary }}>{label}</Text>
  </Pressable>;

  return <View testID="web-links" style={{ paddingHorizontal: 20, paddingTop: 12, gap: 2 }}>
    <Text accessibilityRole="header" style={{ fontFamily: FONTS.headline, fontSize: 18, color: COLORS.text }}>For people without the app</Text>
    <Text style={{ fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: COLORS.textDim }}>A player link lets someone keep their group's card in a browser. A spectator link only watches.</Text>
    {button('Share player link', () => void share('player'), 'web-share-player')}
    {button('Share spectator link', () => void share('spectator'), 'web-share-spectator')}
    {!!message && <Text accessibilityLiveRegion="polite" style={{ fontFamily: FONTS.regular, color: COLORS.textDim }}>{message}</Text>}
    {members.length > 0 && <Text accessibilityRole="header" style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text, marginTop: 8 }}>Scoring on the web</Text>}
    {members.map(member => <View key={member.member_id} testID={`web-member-${member.player_name}`} style={{ paddingVertical: 4 }}>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 15, color: COLORS.text }}>{memberLabel(member)}</Text>
      <View style={{ flexDirection: 'row', gap: 24 }}>
        {button(moving === member.member_id ? 'Cancel move' : 'Move to another card', () => setMoving(moving === member.member_id ? null : member.member_id), `web-move-${member.player_name}`)}
        {button('Remove', () => remove(member), `web-remove-${member.player_name}`, true)}
      </View>
      {moving === member.member_id && players.filter(p => p.id !== member.player_id).map(p => <View key={p.id}>
        {button(`Give them ${p.displayName}'s card`, () => void run(async () => { await api.assign(contest.id, member.member_id, p.id); setMoving(null); await refresh(); return 'Web scorer moved.'; }), `web-assign-${p.displayName}`)}
      </View>)}
    </View>)}
    {members.length > 0 && button('End player links', () => end('player'), 'web-end-player', true)}
    {made.has(`${contest.id}:spectator`) && button('End spectator links', () => end('spectator'), 'web-end-spectator', true)}
  </View>;
}
