import { ScrollView, Text, View } from 'react-native';
import { SafeScreen } from '../../src/ui/SafeScreen';
import { PayUpTicket } from '../../src/ui/share/PayUpTicket';
import { sampleTickets } from '../../src/ui/share/pay-up-ticket-fixture';
import { COLORS } from '../../src/ui/theme';

/** Design preview of the share image, with made-up rounds. Development builds only. */
export default function PayUpTicketPreview() {
  if (!__DEV__) return null;
  return <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16, alignItems: 'center' }}>
    {sampleTickets.map((sample, i) => <View key={sample.label} testID={`ticket-sample-${i}`} style={{ gap: 6 }}>
      <Text style={{ color: COLORS.textDim }}>{sample.label}</Text>
      <PayUpTicket model={sample.model} />
    </View>)}
  </ScrollView></SafeScreen>;
}
