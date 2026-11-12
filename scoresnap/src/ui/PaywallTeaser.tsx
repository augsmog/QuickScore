import { GAME_LIBRARY_CAPTION } from "../engine/types";
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from './theme';
export function PaywallTeaser({feature, children}: {feature: string; children?: import('react').ReactNode}) {
  const router = useRouter();
  return <View style={{flex:1, backgroundColor:COLORS.bg, justifyContent:'center', padding:32, gap:20}}>
    <Text style={{color:COLORS.text,fontSize:24}}>{feature} with SnapScore Pro</Text>
    <Text style={{color:COLORS.textDim}}>See settlement, statistics, game variants, and unlimited cloud scans with Pro. {GAME_LIBRARY_CAPTION} Scoring, leaderboards and sharing results are free for supported Free games.</Text>
    {children}
    <Pressable onPress={()=>router.push('/paywall')}><Text style={{color:COLORS.primary}}>Try Pro free for 7 days</Text></Pressable>
    <Pressable onPress={()=>router.back()}><Text style={{color:COLORS.text}}>Back to scores</Text></Pressable>
  </View>;
}
