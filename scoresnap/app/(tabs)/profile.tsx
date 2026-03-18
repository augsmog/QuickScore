import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { User, Settings, Crown, BarChart3, Camera, Zap } from "lucide-react-native";
import { COLORS } from "../../src/ui/theme";
import { useContestStore } from "../../src/stores/contest-store";
import { useScanStore } from "../../src/stores/scan-store";

export default function ProfileScreen() {
  const router = useRouter();
  const contests = useContestStore((s) => s.contests);
  const completed = contests.filter((c) => c.status === "completed").length;
  const { scansUsed, isPro, getRemainingFreeScans } = useScanStore();
  const freeRemaining = getRemainingFreeScans();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "800", paddingTop: 16, marginBottom: 24 }}>
          Profile
        </Text>

        {/* Profile Card */}
        <View
          style={{
            backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
            borderRadius: 20, padding: 20, marginBottom: 16, alignItems: "center",
          }}
        >
          <View
            style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: COLORS.accent + "22",
              alignItems: "center", justifyContent: "center", marginBottom: 12,
            }}
          >
            <User size={36} color={COLORS.accent} />
          </View>
          <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 18 }}>
            Golfer
          </Text>
          <Text style={{ color: COLORS.textDim, fontSize: 13, marginTop: 4 }}>
            Handicap: --
          </Text>
        </View>

        {/* Scan Usage */}
        <View
          style={{
            backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
            borderRadius: 16, padding: 16, marginBottom: 16,
            flexDirection: "row", alignItems: "center", gap: 12,
          }}
        >
          <View
            style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: isPro ? COLORS.accent + "22" : freeRemaining > 0 ? COLORS.accent + "22" : COLORS.warn + "22",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Camera size={22} color={isPro ? COLORS.accent : freeRemaining > 0 ? COLORS.accent : COLORS.warn} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 14 }}>
              Scorecard Scans
            </Text>
            <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>
              {isPro
                ? "Unlimited scans (Pro)"
                : freeRemaining > 0
                ? `${freeRemaining} free scan remaining`
                : `${scansUsed} scan${scansUsed !== 1 ? "s" : ""} used · Upgrade for more`}
            </Text>
          </View>
          {!isPro && freeRemaining === 0 && (
            <Pressable
              onPress={() => router.push("/paywall")}
              style={{
                backgroundColor: COLORS.gold + "22", borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 6,
              }}
            >
              <Text style={{ color: COLORS.gold, fontSize: 11, fontWeight: "700" }}>Upgrade</Text>
            </Pressable>
          )}
        </View>

        {/* Stats */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          {[
            { value: String(contests.length), label: "Contests" },
            { value: String(completed), label: "Completed" },
            { value: String(scansUsed), label: "Scans" },
          ].map((stat) => (
            <View
              key={stat.label}
              style={{
                flex: 1, backgroundColor: COLORS.card, borderColor: COLORS.border,
                borderWidth: 1, borderRadius: 16, padding: 16, alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "800" }}>
                {stat.value}
              </Text>
              <Text style={{ color: COLORS.textDim, fontSize: 11, marginTop: 4 }}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Pro Upgrade */}
        {!isPro && (
          <Pressable
            onPress={() => router.push("/paywall")}
            style={{
              backgroundColor: COLORS.gold + "15", borderColor: COLORS.gold + "33",
              borderWidth: 1, borderRadius: 20, padding: 20, marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <Crown size={24} color={COLORS.gold} />
              <Text style={{ color: COLORS.gold, fontWeight: "700", fontSize: 16 }}>
                Upgrade to ScoreSnap Pro
              </Text>
            </View>
            <Text style={{ color: COLORS.textDim, fontSize: 13, lineHeight: 19 }}>
              Unlimited scorecard scans, all 25+ game types, settlement tracking, and more.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <View style={{ backgroundColor: COLORS.gold + "22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: COLORS.gold, fontSize: 12, fontWeight: "700" }}>$4.99/mo</Text>
              </View>
              <View style={{ backgroundColor: COLORS.gold + "22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: COLORS.gold, fontSize: 12, fontWeight: "700" }}>$29.99/yr (Save 50%)</Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Settings Links */}
        {[
          { icon: <Settings size={20} color={COLORS.textDim} />, label: "Settings" },
          { icon: <BarChart3 size={20} color={COLORS.textDim} />, label: "Statistics" },
        ].map((item) => (
          <Pressable
            key={item.label}
            style={{
              backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
              borderRadius: 14, padding: 16, marginBottom: 8,
              flexDirection: "row", alignItems: "center", gap: 12,
            }}
          >
            {item.icon}
            <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: "600", flex: 1 }}>
              {item.label}
            </Text>
            <Text style={{ color: COLORS.textDim, fontSize: 18 }}>›</Text>
          </Pressable>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
