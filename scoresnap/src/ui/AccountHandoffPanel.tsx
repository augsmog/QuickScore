import { Dimensions, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../stores/auth-store';
import { finishAccountHandoff, useHandoffStore } from '../services/account-handoff';
import { COLORS } from './theme';
import { isCompactViewport } from './compact-viewport';
export const HANDOFF_ACTION_MIN_TARGET = 44;
export function AccountHandoffPanel() {
  const anonymous = useAuthStore(s => s.isAnonymous);
  const { message, busy, error } = useHandoffStore();
  const router = useRouter();
  const compact = isCompactViewport(Dimensions.get('window'));
  const insets = useSafeAreaInsets();
  if (!anonymous && !message && !busy) return null;
  const gap = compact ? 4 : 16;
  // Rendered as a sibling above the root Stack (no SafeScreen ancestor), so it must
  // clear the top safe-area band itself rather than relying on a screen wrapper.
  return <View style={{ padding: gap, paddingTop: insets.top + gap, backgroundColor: COLORS.surfaceHigh }}>
    <Text accessibilityLiveRegion="polite" style={{ color: COLORS.text, ...(compact ? { fontSize: 11, lineHeight: 13 } : {}) }}>{busy ? 'Saving guest rounds to your account…' : message || 'Keep your guest rounds across devices. Sign in on this device first. Sync or resolve queued scores before continuing.'}</Text>
    {anonymous && <Pressable accessibilityRole="button" onPress={() => router.push('/auth/sign-in')} style={{ minHeight: HANDOFF_ACTION_MIN_TARGET, justifyContent: 'center' }}><Text style={{ color: COLORS.primary, ...(compact ? { fontSize: 11, lineHeight: 13 } : {}) }}>Save rounds to an account</Text></Pressable>}
    {!anonymous && error && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void finishAccountHandoff()} style={{ minHeight: HANDOFF_ACTION_MIN_TARGET, justifyContent: 'center' }}><Text style={{ color: COLORS.primary }}>Retry round handoff</Text></Pressable>}
  </View>;
}
