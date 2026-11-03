import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeScreen } from '../../src/ui/SafeScreen';
import { COLORS, FONTS, RADII, TYPOGRAPHY } from '../../src/ui/theme';
import { CROSS_DEVICE_SHARING_ENABLED } from '../../src/config/features';
import { useAuthStore } from '../../src/stores/auth-store';
import { useOnlineStore } from '../../src/stores/online-store';
import { leagueService, type League, type LeagueEvent } from '../../src/services/leagues';
import { AnimatedPressable } from '../../src/ui/AnimatedPressable';

function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <AnimatedPressable disabled={disabled} onPress={onPress} style={{ backgroundColor: disabled ? COLORS.surface : COLORS.primary, borderRadius: RADII.md, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', opacity: disabled ? 0.55 : 1 }}>
    <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: disabled ? COLORS.textDim : COLORS.onPrimary }}>{title}</Text>
  </AnimatedPressable>;
}

export default function LeaguesScreen() {
  const router = useRouter();
  const { remoteUserId, isAnonymous } = useAuthStore();
  const onlineEvents = useOnlineStore(s => s.events);
  const hostEvents = useMemo(() => Object.entries(onlineEvents)
    .filter(([, event]) => event.membership.role === 'host' && event.membership.status === 'approved')
    .map(([id, event]) => ({ id, name: event.snapshot.name || 'Online event' })), [onlineEvents]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [roster, setRoster] = useState<Array<{ league_player_id: string; display_name: string; role: string; status: string }>>([]);
  const [leagueName, setLeagueName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingJoins, setPendingJoins] = useState<Record<string, boolean>>({});
  const [mappingEvent, setMappingEvent] = useState<string | null>(null);
  const [mapOptions, setMapOptions] = useState<Awaited<ReturnType<typeof leagueService.mapOptions>> | null>(null);
  const [mapMember, setMapMember] = useState<string | null>(null);
  const [mapPlayer, setMapPlayer] = useState<string | null>(null);
  const selectedLeague = leagues.find(league => league.id === selected);

  const refresh = useCallback(async (leagueId = selected, role?: League['role']) => {
    if (!remoteUserId || !leagueId) return;
    const actor = remoteUserId;
    try {
      const nextEvents = await leagueService.events(leagueId);
      const nextRoster = !isAnonymous && role === 'host' ? await leagueService.roster(leagueId) : [];
      if (useAuthStore.getState().remoteUserId !== actor) return;
      setEvents(nextEvents);
      setRoster(nextRoster);
    } catch (e) {
      if (useAuthStore.getState().remoteUserId === actor) {
        setEvents([]); setRoster([]); setMapOptions(null); setMappingEvent(null);
      }
      throw e;
    }
  }, [remoteUserId, isAnonymous, selected]);

  const load = useCallback(async () => {
    if (!CROSS_DEVICE_SHARING_ENABLED || !remoteUserId) return;
    const actor = remoteUserId;
    setBusy(true); setError(null);
    try {
      const rows = await leagueService.list();
      if (useAuthStore.getState().remoteUserId !== actor) return;
      setLeagues(rows);
      const next = selected && rows.some(row => row.id === selected) ? selected : rows[0]?.id ?? null;
      setSelected(next); if (next) await refresh(next, rows.find(row => row.id === next)?.role); else { setEvents([]); setRoster([]); }
    } catch (e: any) {
      if (useAuthStore.getState().remoteUserId === actor) {
        setLeagues([]); setSelected(null); setEvents([]); setRoster([]); setMapOptions(null); setMappingEvent(null);
        setError(e?.message || 'Could not load leagues.');
      }
    }
    finally { setBusy(false); }
  }, [remoteUserId, isAnonymous, selected, refresh]);

  useEffect(() => {
    setLeagues([]); setSelected(null); setEvents([]); setRoster([]);
    setPendingJoins({}); setMappingEvent(null); setMapOptions(null); setMapMember(null); setMapPlayer(null);
    setError(null);
  }, [remoteUserId]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); await load(); }
    catch (e: any) { setError(e?.message || 'The league action failed.'); }
    finally { setBusy(false); }
  }

  if (!CROSS_DEVICE_SHARING_ENABLED) return <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg, padding: 24 }} edges={['top']}>
    <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text }}>Leagues</Text>
    <Text style={{ ...TYPOGRAPHY.body, color: COLORS.textDim, marginTop: 12 }}>Leagues require cross-device sharing to be enabled.</Text>
  </SafeScreen>;

  return <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
    <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }}>
      <Text style={{ fontFamily: FONTS.headline, fontSize: 28, color: COLORS.text }}>LEAGUES</Text>
      <Text style={{ ...TYPOGRAPHY.body, color: COLORS.textDim, marginTop: 4 }}>Recurring rosters with event-by-event access.</Text>
    </View>
    {!remoteUserId ? <View style={{ padding: 20 }}>
      <Text style={{ ...TYPOGRAPHY.body, color: COLORS.textDim }}>Sign in to open leagues. Event access still requires the event host’s approval.</Text>
      <Action title="SIGN IN" onPress={() => router.push('/auth/sign-in')} />
    </View> : <View style={{ flex: 1, paddingHorizontal: 20, gap: 12 }}>
      {isAnonymous ? <Text style={{ ...TYPOGRAPHY.body, color: COLORS.textDim }}>Your host manages the recurring roster. Each event still requires its own host approval.</Text> : <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={leagueName} onChangeText={setLeagueName} maxLength={80} placeholder="League name" placeholderTextColor={COLORS.textDim} style={{ flex: 1, color: COLORS.text, backgroundColor: COLORS.surface, borderRadius: RADII.md, paddingHorizontal: 12, fontFamily: FONTS.regular }} />
        <Action title="CREATE" disabled={busy || !leagueName.trim()} onPress={() => void run(async () => { await leagueService.create(leagueName); setLeagueName(''); })} />
      </View>}
      {error ? <Text accessibilityRole="alert" style={{ ...TYPOGRAPHY.body, color: COLORS.danger }}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={COLORS.primary} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {leagues.map(league => <Pressable key={league.id} onPress={() => { setSelected(league.id); setEvents([]); setRoster([]); void refresh(league.id, league.role).catch(e => setError(e?.message || 'Could not load this league.')); }} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADII.md, backgroundColor: league.id === selected ? COLORS.primary : COLORS.surface }}>
          <Text style={{ fontFamily: FONTS.bold, color: league.id === selected ? COLORS.onPrimary : COLORS.text }}>{league.name}</Text>
        </Pressable>)}
      </View>
      {selected ? <View style={{ flex: 1, gap: 12 }}>
        {!isAnonymous ? <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>ROSTER · {roster.filter(m => m.status === 'active').length} ACTIVE</Text> : null}
        {!isAnonymous ? roster.map(member => member.role === 'host' ? null : <View key={member.league_player_id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: 10 }}>
          <Text style={{ ...TYPOGRAPHY.body, color: COLORS.text }}>{member.display_name}{member.status === 'removed' ? ' · removed' : ''}</Text>
          <Pressable onPress={() => void run(() => leagueService.setMemberActive(selected, member.league_player_id, member.status !== 'active'))}>
            <Text style={{ fontFamily: FONTS.bold, color: COLORS.primary }}>{member.status === 'active' ? 'REMOVE' : 'RESTORE'}</Text>
          </Pressable>
        </View>) : null}
        <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginTop: 6 }}>EVENTS</Text>
        {events.map(event => <View key={event.id} style={{ backgroundColor: COLORS.surface, borderRadius: RADII.lg, padding: 14, gap: 8 }}>
          <Text style={{ fontFamily: FONTS.bold, color: COLORS.text, fontSize: 16 }}>{event.name}</Text>
          <Text style={{ ...TYPOGRAPHY.body, color: COLORS.textDim }}>{event.status === 'completed' ? 'Completed' : 'Active'} · {event.authorized ? 'Access approved' : 'Join requires event host approval'}</Text>
          {!event.authorized ? <Action title={pendingJoins[event.id] ? 'REQUEST PENDING' : 'REQUEST EVENT ACCESS'} disabled={busy || pendingJoins[event.id]} onPress={() => void run(async () => { await leagueService.requestEventJoin(selected, event.id); setPendingJoins(old => ({ ...old, [event.id]: true })); })} /> : event.rounds.map(round => <View key={round.number} style={{ gap: 4 }}>
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>ROUND {round.number}</Text>
            {round.players.map((player, i) => <Text key={`${round.number}-${player.name}-${i}`} style={{ ...TYPOGRAPHY.body, color: COLORS.text }}>{player.name} · {player.holes.filter(h => h.strokes != null).length} holes scored</Text>)}
          </View>)}
          {selectedLeague?.role === 'host' && !isAnonymous ? <Action title={mappingEvent === event.id ? 'CLOSE PLAYER MAPPING' : 'MAP ROSTER TO EVENT'} onPress={() => {
            if (mappingEvent === event.id) { setMappingEvent(null); setMapOptions(null); return; }
            setMappingEvent(event.id); setMapMember(null); setMapPlayer(null);
            void leagueService.mapOptions(selected, event.id).then(setMapOptions).catch(e => setError(e?.message || 'Could not load mapping options.'));
          }} /> : null}
          {mappingEvent === event.id && mapOptions ? <View style={{ gap: 8, paddingTop: 4 }}>
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>CHOOSE A LEAGUE MEMBER</Text>
            {mapOptions.roster.map(member => <Pressable key={member.id} onPress={() => setMapMember(member.id)} style={{ padding: 8, borderRadius: RADII.md, backgroundColor: mapMember === member.id ? COLORS.primary : COLORS.bg }}><Text style={{ color: mapMember === member.id ? COLORS.onPrimary : COLORS.text }}>{member.name}</Text></Pressable>)}
            <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim }}>CHOOSE THEIR EVENT PLAYER</Text>
            {mapOptions.players.map(player => <Pressable key={player.id} onPress={() => setMapPlayer(player.id)} style={{ padding: 8, borderRadius: RADII.md, backgroundColor: mapPlayer === player.id ? COLORS.primary : COLORS.bg }}><Text style={{ color: mapPlayer === player.id ? COLORS.onPrimary : COLORS.text }}>{player.name}</Text></Pressable>)}
            <Action title="SAVE MAPPING" disabled={busy || !mapMember || !mapPlayer} onPress={() => void run(async () => {
              await leagueService.mapPlayer(selected, event.id, mapMember!, mapPlayer!);
              setMappingEvent(null); setMapOptions(null); setMapMember(null); setMapPlayer(null);
            })} />
          </View> : null}
        </View>)}
        <Text style={{ ...TYPOGRAPHY.label, color: COLORS.textDim, marginTop: 6 }}>LINK A HOSTED EVENT</Text>
        {!isAnonymous ? !hostEvents.length ? <Action title="CREATE OR OPEN AN ONLINE EVENT" onPress={() => router.push('/contest/new')} /> : hostEvents.map(event => <Action key={event.id} title={`LINK ${event.name.toUpperCase()}`} disabled={busy} onPress={() => void run(() => leagueService.linkEvent(selected, event.id))} />) : null}
      </View> : <Text style={{ ...TYPOGRAPHY.body, color: COLORS.textDim }}>Create a league to start a recurring roster.</Text>}
    </View>}
  </SafeScreen>;
}
