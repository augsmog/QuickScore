import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from './theme';
export function PaywallTeaser({feature, children}: {feature: string; children?: import('react').ReactNode}) {
  const router = useRouter();
  return <View style={{flex:1, backgroundColor:COLORS.bg, justifyContent:'center', padding:32, gap:20}}>
    <Text style={{color:COLORS.text,fontSize:24}}>{feature} with SnapScore Pro</Text>
    <Text style={{color:COLORS.textDim}}>Unlock settlement and statistics, all 30 game modes, and unlimited cloud scans. Scoring, leaderboards and sharing results are free.</Text>
    {children}
    <Pressable onPress={()=>router.push('/paywall')}><Text style={{color:COLORS.primary}}>See plans</Text></Pressable>
    <Pressable onPress={()=>router.back()}><Text style={{color:COLORS.text}}>Back to scores</Text></Pressable>
  </View>;
}
