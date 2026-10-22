import { ScrollView, Text } from 'react-native';
import { RecapCard } from '../../src/ui/recap/RecapCard';
import { sampleRecap } from '../../src/ui/recap/fixture';
import { COLORS } from '../../src/ui/theme';

export default function RecapCardPreview() {
  if (!__DEV__) return null;
  return <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20, gap: 12 }}>
    <Text style={{ color: COLORS.textDim, textAlign: 'center' }}>Sample round · example link · screenshot preview</Text>
    <RecapCard model={sampleRecap} />
  </ScrollView>;
}
