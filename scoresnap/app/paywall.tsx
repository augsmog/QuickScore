import { showAlert } from "@/services/platform-alert";
import { SafeScreen } from "../src/ui/SafeScreen";
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Linking, Platform, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { getPackages, purchasePackage, restorePurchases, syncProStatus } from '../src/services/purchases';
import { eligibleAnnualTrials, buildPaywallView, type PaywallSelection } from '../src/services/paywall-plans';
import { proEnabled } from '../src/services/entitlements';
import { useScanStore } from '../src/stores/scan-store';
import { PRIVACY_URL, TERMS_URL } from '../src/config/support';
import { PAYWALL as P } from '../src/ui/paywall-tokens';
import { PAYWALL_COPY as C } from '../src/ui/paywall-copy';
import { PaywallIcon, PaywallRadio } from '../src/ui/paywall-icons';
import { posthog } from '../src/config/posthog';

export default function PaywallScreen() {
  const router = useRouter();
  const { tier: target } = useLocalSearchParams<{ tier?: string }>();
  const tier = useScanStore(s => s.tier);
  useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  // AUG-1263: the Pro row is hidden while pro_enabled is off (below), so never default-select it.
  const [selection, setSelection] = useState<PaywallSelection>({ tier: target === 'td' || !proEnabled() ? 'td' : 'pro', period: 'year' });
  const [packages, setPackages] = useState<Awaited<ReturnType<typeof getPackages>>>({ annual: null, monthly: null, td_annual: null, td_monthly: null });
  const [eligible, setEligible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const p = await getPackages();
        if (live) setPackages(p);
        const trials = await eligibleAnnualTrials(p);
        if (live) setEligible(trials);
      } catch { /* Fallback prices remain visible; purchases stay disabled. */ }
    })();
    return () => { live = false; };
  }, []);
  async function act(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try { await work(); }
    catch (e: unknown) { showAlert(C.subscription, e instanceof Error ? e.message || C.retry : C.retry); }
    finally { setBusy(false); }
  }
  const v = buildPaywallView(packages, eligible, tier, selection, proEnabled());
  const tag = (label: string) => <Text style={[s.tag, label === C.current && s.current]}>{label}</Text>;
  return <SafeScreen style={s.safe}>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.top}>
        <Pressable testID="paywall-close" accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={s.closeButton}><PaywallIcon name="close" /></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={s.topLink} onPress={() => act(async () => {
          const restored = await restorePurchases();
          showAlert(C.restore, restored ? C.restored : C.nothing);
        })}><Text style={[s.link, { fontSize: 14 }]}>{v.restore}</Text></Pressable>
      </View>
      <View style={{ gap: 4 }}><Text style={s.eyebrow}>{v.eyebrow}</Text><Text style={s.headline}>{v.headline}</Text></View>
      <View>{v.values.map((value, i) => <View key={value.icon} style={[s.value, i < 2 && s.rule]}>
        <PaywallIcon name={value.icon} /><View style={{ flex: 1, gap: 2 }}><Text style={s.valueTitle}>{value.title}</Text>{!!value.body && <Text style={s.body}>{value.body}</Text>}</View>
      </View>)}</View>
      <Text style={s.body}>{v.scans}</Text>
      <View style={{ gap: 8 }}>{v.rows.map(row => {
        const title = <View style={[s.titleRow, row.tier === "td" && s.tdPlanTitle]}><Text style={s.planTitle}>{row.name}</Text>{!!row.tag && tag(row.tag)}</View>;
        const price = row.price ? <View style={s.priceCol}><Text style={s.price} numberOfLines={1}>{row.price}</Text>{!!row.trial && tag(row.trial)}</View> : null;
        return <Pressable key={row.tier} accessibilityRole="radio" accessibilityState={{ checked: row.selected }} aria-checked={row.selected}
        onPress={() => setSelection({ ...selection, tier: row.tier })} style={[s.plan, row.selected && s.selected]}>
        <PaywallRadio selected={row.selected} />
        <View style={{ flex: 1, gap: 2 }}>
          {row.tier === "td" ? <View style={s.tdTitleAndPrice}>{title}{price}</View> : title}
          {!!row.body && <Text style={s.body}>{row.body}</Text>}
          {!!row.alternate && <Pressable accessibilityRole="button" style={s.alternateLink} onPress={event => { event.stopPropagation(); setSelection({ tier: row.tier, period: selection.period === 'year' ? 'month' : 'year' }); }}><Text style={s.body}>{row.alternate}</Text></Pressable>}
        </View>
        {row.tier !== "td" && price}
      </Pressable>;
      })}</View>
      <View style={{ gap: 6, alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || v.disabled }} disabled={busy || v.disabled} style={[s.cta, (busy || v.disabled) && { opacity: 0.55 }]}
          onPress={() => act(async () => { if (v.package && await purchasePackage(v.package)) { await syncProStatus(); posthog?.capture('subscription_purchase_completed', { selected_tier: selection.tier, billing_period: selection.period }); router.back(); } })}><Text style={s.ctaText} numberOfLines={1} adjustsFontSizeToFit>{v.cta}</Text></Pressable>
        {!!v.billed && <Text style={s.billed}>{v.billed}</Text>}
        {!!v.oneTrial && <Text style={s.small}>{v.oneTrial}</Text>}
      </View>
      <Text style={[s.small, { lineHeight: 15 }]}>{v.legal}</Text>
      <View style={s.footer}>
        <Pressable accessibilityRole="link" style={s.footerLink} onPress={() => Linking.openURL(TERMS_URL)}><Text style={s.link}>{v.terms}</Text></Pressable>
        <Text style={{ color: P.dot, fontSize: 12 }}>{v.dot}</Text>
        <Pressable accessibilityRole="link" style={s.footerLink} onPress={() => Linking.openURL(PRIVACY_URL)}><Text style={s.link}>{v.privacy}</Text></Pressable>
      </View>
    </ScrollView>
  </SafeScreen>;
}
// Keep the native focus/touch bounds large enough on Android without changing iOS layout.
const PAYWALL_TOUCH_SIZE = Platform.OS === 'android' ? 48 : 44;
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: P.paper },
  content: { paddingHorizontal: P.padding, paddingBottom: 10, gap: P.gap },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: PAYWALL_TOUCH_SIZE, marginTop: 2 },
  closeButton: { minWidth: PAYWALL_TOUCH_SIZE, minHeight: PAYWALL_TOUCH_SIZE, alignItems: 'center', justifyContent: 'center' },
  topLink: { minHeight: PAYWALL_TOUCH_SIZE, justifyContent: 'center' },
  footerLink: { minHeight: 44, justifyContent: 'center' },
  alternateLink: { minHeight: PAYWALL_TOUCH_SIZE, justifyContent: 'center' },
  link: { fontFamily: P.medium, fontSize: 12, color: P.green, textDecorationLine: 'underline' },
  eyebrow: { fontFamily: P.semibold, fontSize: 12, letterSpacing: 1.2, color: P.muted },
  headline: { fontFamily: P.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, color: P.ink },
  value: { flexDirection: 'row', gap: 14, paddingVertical: 7 },
  rule: { borderBottomColor: P.rule, borderBottomWidth: 1 },
  valueTitle: { fontFamily: P.semibold, fontSize: 15, color: P.ink },
  body: { fontFamily: P.regular, fontSize: 13, lineHeight: 18, color: P.muted },
  plan: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: P.radius, backgroundColor: P.card, borderColor: P.rule, borderWidth: 1 },
  selected: { borderColor: P.green, borderWidth: 2 },
  // flexShrink/flexWrap so at large font scale (android-compact 1.3x) the plan name keeps its full
  // text ("Free" not "Fre") and its badge wraps instead of clipping (AUG-1376 r7).
  tdTitleAndPrice: { flexDirection: "row", alignItems: "center", gap: 12 },
  tdPlanTitle: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexShrink: 1, flexWrap: 'wrap' },
  planTitle: { fontFamily: P.semibold, fontSize: 16, color: P.ink, flexShrink: 1 },
  tag: { fontFamily: P.semibold, fontSize: 11, color: P.green, backgroundColor: P.tint, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  current: { color: P.muted, backgroundColor: P.neutral },
  // The price column never shrinks, so the full "$price/interval" string ("$79.99/year") stays
  // intact; the flexible title column absorbs the crowding instead.
  priceCol: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  price: { fontFamily: P.bold, fontSize: 16, color: P.ink },
  cta: { height: P.ctaHeight, width: '100%', borderRadius: P.radius, backgroundColor: P.green, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: P.semibold, fontSize: 17, color: P.card },
  billed: { fontFamily: P.medium, fontSize: 13, color: P.ink },
  small: { fontFamily: P.regular, fontSize: 11, color: P.muted },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
});
