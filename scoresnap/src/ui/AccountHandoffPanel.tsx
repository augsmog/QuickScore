import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../stores/auth-store';
import { finishAccountHandoff, useHandoffStore } from '../services/account-handoff';
import { COLORS } from './theme';
export function AccountHandoffPanel() {
  const anonymous = useAuthStore(s => s.isAnonymous);
  const { message, busy, error } = useHandoffStore();
  const router = useRouter();
  if (!anonymous && !message && !busy) return null;
  return <View style={{ padding: 16, backgroundColor: COLORS.surfaceHigh }}>
    <Text accessibilityLiveRegion="polite" style={{ color: COLORS.text }}>{busy ? 'Saving guest rounds to your account…' : message || 'Keep your guest rounds across devices. Sign in on this device first. Sync or resolve queued scores before continuing.'}</Text>
    {anonymous && <Pressable accessibilityRole="button" onPress={() => router.push('/auth/sign-in')}><Text style={{ color: COLORS.primary }}>Save rounds to an account</Text></Pressable>}
    {!anonymous && error && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void finishAccountHandoff()}><Text style={{ color: COLORS.primary }}>Retry round handoff</Text></Pressable>}
  </View>;
}
