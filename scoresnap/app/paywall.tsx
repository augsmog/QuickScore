import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  X,
  Check,
  Crown,
  Camera,
  Zap,
  Trophy,
  DollarSign,
  Star,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS } from "../src/ui/theme";
import { useScanStore } from "../src/stores/scan-store";
import {
  getPackages,
  purchasePackage,
  restorePurchases,
} from "../src/services/purchases";
import RevenueCatUI from "react-native-purchases-ui";
import type { PurchasesPackage } from "react-native-purchases";

export default function PaywallScreen() {
  const router = useRouter();
  const { scansUsed, isPro } = useScanStore();
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [useNativePaywall, setUseNativePaywall] = useState(true);
  const [packages, setPackages] = useState<{
    monthly: PurchasesPackage | null;
    annual: PurchasesPackage | null;
    lifetime: PurchasesPackage | null;
  }>({ monthly: null, annual: null, lifetime: null });

  // Try RevenueCat's native paywall first
  useEffect(() => {
    if (isPro) return;

    (async () => {
      try {
        // Present RevenueCat's native paywall UI
        const result = await RevenueCatUI.presentPaywallIfNeeded({
          requiredEntitlementIdentifier: "ScoreSnap Pro",
        });

        if (result === "PURCHASED" || result === "RESTORED") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          return;
        }

        // User dismissed — fall through to custom paywall
        if (result === "NOT_PRESENTED") {
          // Already has entitlement, go back
          router.back();
          return;
        }

        // CANCELLED — show custom paywall as fallback
        setUseNativePaywall(false);
      } catch (e) {
        // Native paywall not configured yet — use custom
        console.warn("RevenueCat paywall not available, using custom:", e);
        setUseNativePaywall(false);
      }
    })();
  }, []);

  // Load packages for custom paywall
  useEffect(() => {
    if (useNativePaywall || isPro) return;
    (async () => {
      try {
        const pkgs = await getPackages();
        setPackages(pkgs);
      } catch (e) {
        console.warn("Failed to load packages:", e);
      }
    })();
  }, [useNativePaywall]);

  const handlePurchase = useCallback(
    async (pkg: PurchasesPackage | null) => {
      if (!pkg) {
        Alert.alert(
          "Not Available",
          "This product is not yet configured. Please try again later."
        );
        return;
      }
      setLoading(true);
      try {
        const success = await purchasePackage(pkg);
        if (success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        }
      } catch (e: any) {
        Alert.alert("Purchase Failed", e.message || "Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      Haptics.notificationAsync(
        restored
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
      if (restored) {
        Alert.alert("Restored!", "Your Pro subscription has been restored.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(
          "No Subscription Found",
          "We couldn't find an active subscription for this account."
        );
      }
    } catch (e: any) {
      Alert.alert("Restore Failed", e.message || "Please try again.");
    } finally {
      setRestoring(false);
    }
  }, [router]);

  // If already Pro, show confirmation
  if (isPro) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
          <Crown size={48} color={COLORS.gold} />
          <Text style={{ color: COLORS.gold, fontWeight: "800", fontSize: 24, marginTop: 16 }}>
            You're a Pro!
          </Text>
          <Text style={{ color: COLORS.textDim, fontSize: 14, marginTop: 8, textAlign: "center" }}>
            Unlimited scans, all game modes, and full settlement tracking.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={{ backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 24 }}
          >
            <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>Back to App</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // While native paywall is being presented, show loading
  if (useNativePaywall) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  // ─── Custom Fallback Paywall ───────────────────────────────────────

  const features = [
    { icon: <Camera size={18} color={COLORS.accent} />, label: "Unlimited scorecard scans", desc: "AI-powered OCR for handwritten & printed scorecards" },
    { icon: <Trophy size={18} color={COLORS.accent} />, label: "All 25+ game modes", desc: "Wolf, Banker, Hammer, Vegas, Nines, and more" },
    { icon: <DollarSign size={18} color={COLORS.accent} />, label: "Settlement tracking", desc: "See who owes whom across all games" },
    { icon: <Zap size={18} color={COLORS.accent} />, label: "Share & export results", desc: "Send results to your group instantly" },
  ];

  const annualPrice = packages.annual?.product.priceString || "$29.99";
  const monthlyPrice = packages.monthly?.product.priceString || "$4.99";
  const lifetimePrice = packages.lifetime?.product.priceString || "$49.99";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* Close */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, flexDirection: "row", justifyContent: "flex-end" }}>
        <Pressable
          onPress={() => router.back()}
          style={{ borderRadius: 20, padding: 8, backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1 }}
        >
          <X size={18} color={COLORS.textDim} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ alignItems: "center", marginTop: 8, marginBottom: 28 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.gold + "22", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Crown size={36} color={COLORS.gold} />
          </View>
          <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 26 }}>ScoreSnap Pro</Text>
          <Text style={{ color: COLORS.textDim, fontSize: 14, marginTop: 4, textAlign: "center" }}>
            Unlimited scanning. Every game mode. Full settlement.
          </Text>
          {scansUsed > 0 && (
            <View style={{ marginTop: 12, backgroundColor: COLORS.warn + "15", borderColor: COLORS.warn + "33", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: COLORS.warn, fontSize: 12, fontWeight: "600", textAlign: "center" }}>
                You've used your free scan. Upgrade to keep scanning.
              </Text>
            </View>
          )}
        </View>

        {/* Features */}
        {features.map((f) => (
          <View key={f.label} style={{ flexDirection: "row", gap: 14, marginBottom: 16, backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderColor: COLORS.border, borderWidth: 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.accent + "15", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {f.icon}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 15 }}>{f.label}</Text>
              <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 }}>{f.desc}</Text>
            </View>
          </View>
        ))}

        {/* What's free */}
        <View style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderColor: COLORS.border, borderWidth: 1, marginBottom: 24 }}>
          <Text style={{ color: COLORS.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Always Free</Text>
          {["1 scorecard scan to try it out", "Manual score entry (unlimited)", "7 core game types", "Offline scoring"].map((item) => (
            <View key={item} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Check size={14} color={COLORS.accent} />
              <Text style={{ color: COLORS.text, fontSize: 13 }}>{item}</Text>
            </View>
          ))}
        </View>

        {/* ─── Annual CTA (Best Value) ─── */}
        <Pressable
          onPress={() => handlePurchase(packages.annual)}
          disabled={loading}
          style={{ borderRadius: 20, padding: 24, marginBottom: 12, alignItems: "center", backgroundColor: COLORS.gold + "15", borderColor: COLORS.gold, borderWidth: 2, opacity: loading ? 0.7 : 1 }}
        >
          <Text style={{ color: COLORS.textDim, fontSize: 12, fontWeight: "600", marginBottom: 4 }}>BEST VALUE</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
            <Text style={{ color: COLORS.gold, fontWeight: "800", fontSize: 34 }}>{annualPrice}</Text>
            <Text style={{ color: COLORS.gold, fontSize: 14 }}>/year</Text>
          </View>
          <Text style={{ color: COLORS.textDim, fontSize: 12 }}>Just $2.50/month — less than a sleeve of balls</Text>
          <View style={{ backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 16, width: "100%", alignItems: "center" }}>
            {loading ? <ActivityIndicator color="#000" /> : (
              <Text style={{ color: "#000", fontWeight: "700", fontSize: 16 }}>Start Free Trial</Text>
            )}
          </View>
          <Text style={{ color: COLORS.textDim, fontSize: 11, marginTop: 8 }}>7-day free trial, cancel anytime</Text>
        </Pressable>

        {/* ─── Monthly ─── */}
        <Pressable
          onPress={() => handlePurchase(packages.monthly)}
          disabled={loading}
          style={{ borderRadius: 16, padding: 16, marginBottom: 12, alignItems: "center", backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1, opacity: loading ? 0.7 : 1 }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 22 }}>{monthlyPrice}</Text>
            <Text style={{ color: COLORS.textDim, fontSize: 13 }}>/month</Text>
          </View>
        </Pressable>

        {/* ─── Lifetime ─── */}
        <Pressable
          onPress={() => handlePurchase(packages.lifetime)}
          disabled={loading}
          style={{ borderRadius: 16, padding: 16, marginBottom: 16, alignItems: "center", backgroundColor: COLORS.accent + "10", borderColor: COLORS.accent + "44", borderWidth: 1, opacity: loading ? 0.7 : 1 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Star size={16} color={COLORS.accent} />
            <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>One-Time Purchase</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 22 }}>{lifetimePrice}</Text>
            <Text style={{ color: COLORS.textDim, fontSize: 13 }}>forever</Text>
          </View>
          <Text style={{ color: COLORS.textDim, fontSize: 11, marginTop: 4 }}>Pay once, own it for life</Text>
        </Pressable>

        {/* Restore */}
        <Pressable onPress={handleRestore} disabled={restoring} style={{ alignItems: "center", paddingVertical: 12 }}>
          {restoring ? (
            <ActivityIndicator color={COLORS.textDim} size="small" />
          ) : (
            <Text style={{ color: COLORS.textDim, fontSize: 13 }}>Restore Purchases</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
