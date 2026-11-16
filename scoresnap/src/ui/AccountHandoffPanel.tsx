import { Dimensions, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../stores/auth-store';
import { finishAccountHandoff, useHandoffStore } from '../services/account-handoff';
import { COLORS } from './theme';
import { accountHandoffLayout } from './account-handoff-layout';
export function AccountHandoffPanel() {
  const anonymous = useAuthStore(s => s.isAnonymous);
  const { message, busy, error } = useHandoffStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const L = accountHandoffLayout(Dimensions.get('window'), insets);
  const compact = L.compact;
  const action = { minHeight: L.actionMinHeight, justifyContent: 'center' as const, alignSelf: 'flex-start' as const };
  if (!anonymous && !message && !busy) return null;
  return <View style={{ paddingTop: L.paddingTop, paddingBottom: L.paddingBottom, paddingLeft: L.paddingLeft, paddingRight: L.paddingRight, backgroundColor: COLORS.surfaceHigh }}>
    <Text accessibilityLiveRegion="polite" style={{ color: COLORS.text, ...(compact ? { fontSize: 11, lineHeight: 13 } : {}) }}>{busy ? 'Saving guest rounds to your account…' : message || 'Keep your guest rounds across devices. Sign in on this device first. Sync or resolve queued scores before continuing.'}</Text>
    {anonymous && <Pressable accessibilityRole="button" style={action} onPress={() => router.push('/auth/sign-in')}><Text style={{ color: COLORS.primary, ...(compact ? { fontSize: 11, lineHeight: 13 } : {}) }}>Save rounds to an account</Text></Pressable>}
    {!anonymous && error && <Pressable accessibilityRole="button" style={action} disabled={busy} onPress={() => void finishAccountHandoff()}><Text style={{ color: COLORS.primary }}>Retry round handoff</Text></Pressable>}
  </View>;
}
