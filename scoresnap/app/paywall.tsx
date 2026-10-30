import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';
import { getPackages, purchasePackage, restorePurchases, syncProStatus } from '../src/services/purchases';
import { eligibleAnnualTrials, PLAN_OPTIONS } from '../src/services/paywall-plans';
import { useScanStore } from '../src/stores/scan-store';
import { PRIVACY_URL, TERMS_URL } from '../src/config/support';
import { COLORS } from '../src/ui/theme';

export default function PaywallScreen() {
  const router = useRouter();
  const {tier: target} = useLocalSearchParams<{tier?: string}>();
  const tier = useScanStore(s=>s.tier);
  const [packages,setPackages] = useState<Awaited<ReturnType<typeof getPackages>>>({annual:null,monthly:null,td_annual:null,td_monthly:null});
  const [eligible,setEligible] = useState<Record<string,boolean>>({});
  const [busy,setBusy] = useState(false);
  useEffect(()=>{let live=true; (async()=>{const p=await getPackages();const trials=await eligibleAnnualTrials(p);if(live){setPackages(p);setEligible(trials);}})();return()=>{live=false;};},[]);
  async function act(work:()=>Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try { await work(); } catch(e:any) { Alert.alert('Subscription',e.message || 'Please try again.'); }
    finally {setBusy(false);}
  }
  return <SafeAreaView style={{flex:1,backgroundColor:COLORS.bg}}>
    <ScrollView contentContainerStyle={{padding:20,gap:20}}>
      <Pressable accessibilityRole="button" onPress={()=>router.back()}><Text style={{color:COLORS.text}}>Close</Text></Pressable>
      <Text style={{fontSize:26,color:COLORS.text,fontWeight:'700'}}>Choose your SnapScore plan</Text>
      <Text style={{color:COLORS.textDim}}>Free: 4 basic game modes, manual and offline scoring, 3 cloud scans per month, sharing results, and hosting one round with one group. Join and score any tournament free.</Text>
      <View style={{flexDirection:'row',gap:12,alignItems:'stretch'}}>
        {PLAN_OPTIONS.map(plan=><View key={plan.tier} style={{flex:1,padding:12,gap:16,borderRadius:16,borderWidth:2,borderColor:target===plan.tier?COLORS.gold:COLORS.border,backgroundColor:COLORS.card}}>
          <Text style={{color:COLORS.text,fontSize:20,fontWeight:'700'}}>{plan.name}</Text>
          <Text style={{color:COLORS.textDim,lineHeight:22}}>{plan.features}</Text>
          {plan.options.map(option=>{
            const pkg=packages[option.key];
            const trial=option.period==='year' && !!pkg && eligible[pkg.product.identifier] === true;
            const owned=tier==='td'||(tier==='pro' && plan.tier==='pro');
            const price=pkg?.product.priceString || option.fallback;
            return <View key={option.key} style={{gap:8}}>
              <Pressable disabled={busy||owned||!pkg} accessibilityRole="button" accessibilityState={{disabled:busy||owned||!pkg}}
                onPress={()=>act(async()=>{if(pkg && await purchasePackage(pkg)) router.back();})}
                style={{padding:12,borderRadius:12,backgroundColor:COLORS.primary,opacity:busy||owned||!pkg?.product ? 0.55:1}}>
                <Text style={{color:COLORS.onPrimary,fontWeight:'700'}}>{owned?'Current plan':tier==='pro'&&plan.tier==='td'?'Upgrade to TD':'Subscribe'} — {price}/{option.period}</Text>
              </Pressable>
              {trial && <Text style={{color:COLORS.gold}}>7-day free trial, then {price}/{option.period}</Text>}
              {!pkg && <Text style={{color:COLORS.textDim}}>Currently unavailable</Text>}
            </View>;
          })}
        </View>)}
      </View>
      <Text style={{color:COLORS.textDim,lineHeight:20}}>Payment is charged to your Apple Account at confirmation of purchase, or after any eligible trial. Subscription auto-renews unless cancelled at least 24 hours before the end of the period. Manage or cancel in Account Settings. One trial per Apple ID across Pro and Tournament Director.</Text>
      <Pressable disabled={busy} onPress={()=>act(async()=>{const restored=await restorePurchases();Alert.alert('Restore Purchases',restored?'Your subscription has been restored.':'No active subscription found.');})}><Text style={{color:COLORS.primary}}>Restore Purchases</Text></Pressable>
      <Pressable disabled={busy} onPress={()=>act(async()=>{
        await RevenueCatUI.presentPaywallIfNeeded({requiredEntitlementIdentifier:target==='td'||tier==='pro'?'SnapScore TD':'SnapScore Pro'});
        await syncProStatus();
      })}><Text style={{color:COLORS.primary}}>View native subscription options</Text></Pressable>
      <Pressable onPress={()=>Linking.openURL(TERMS_URL)}><Text style={{color:COLORS.primary}}>Terms of Use</Text></Pressable>
      <Pressable onPress={()=>Linking.openURL(PRIVACY_URL)}><Text style={{color:COLORS.primary}}>Privacy Policy</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
