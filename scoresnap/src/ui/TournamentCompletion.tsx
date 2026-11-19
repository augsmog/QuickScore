import { Alert, Pressable, Text, View } from 'react-native';
import { tournament } from '../services/cross-device';
import { useOnlineStore } from '../stores/online-store';
import { COLORS } from './theme';
export function TournamentCompletion({ id, report }: { id: string; report(message: string): void }) {
  const event = useOnlineStore(s => s.events[id]);
  if (!event || event.snapshot.completed || !['host', 'scorer'].includes(event.membership.role)) return null;
  const run = (work: () => Promise<unknown>) => { void work().then(() => report('Tournament updated.')).catch(() => report('Submission not confirmed. Sync all scores and refresh before trying again.')); };
  return <View>
    <Text style={{ color: COLORS.text }}>Submit only after everyone in the group has synced and resolved conflicts. Other phones may still have unsent drafts.</Text>
    {event.snapshot.rounds.map(round => <View key={round.id}>{round.groups.map(group =>
      <Pressable key={group.id} accessibilityRole="button" style={{ minHeight: 44 }} onPress={() => Alert.alert('Submit group?', 'Confirm everyone has synced. Any later accepted score change invalidates this submission.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Submit', onPress: () => run(() => tournament.submit(id, round.id, group.id)) }])}>
        <Text style={{ color: COLORS.primary }}>Submit {round.name} · {group.name}</Text>
      </Pressable>)}</View>)}
    {event.membership.role === 'host' && <Pressable accessibilityRole="button" style={{ minHeight: 44 }} onPress={() => Alert.alert('Finalize tournament?', 'Every group must have a current submission. Finalization closes online scoring. The server cannot see unsent drafts on other phones.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Finalize', onPress: () => run(() => tournament.finalize(id)) }])}><Text style={{ color: COLORS.primary }}>Finalize tournament</Text></Pressable>}
  </View>;
}
