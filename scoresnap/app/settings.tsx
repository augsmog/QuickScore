import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  ChevronRight,
  Target,
  Eye,
  Camera,
  Bell,
  Shield,
  RotateCcw,
  LogOut,
  Trash2,
  Ruler,
  Hash,
  Gauge,
  Zap,
  Info,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, FONTS, TYPOGRAPHY, RADII } from "../src/ui/theme";
import { AnimatedPressable } from "../src/ui/AnimatedPressable";
import {
  useSettingsStore,
  ScoreFormat,
  DistanceUnit,
  DefaultTee,
} from "../src/stores/settings-store";
import { useAuthStore } from "../src/stores/auth-store";
// Contest and scan stores cleared via AsyncStorage.multiRemove in handleDeleteAccount

// ─── Reusable row components ──────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontSize: 9,
        fontFamily: FONTS.bold,
        color: COLORS.primary,
        letterSpacing: 2,
        textTransform: "uppercase",
        marginTop: 28,
        marginBottom: 10,
        marginLeft: 4,
      }}
    >
      {title}
    </Text>
  );
}

function ToggleRow({
  icon,
  label,
  sublabel,
  value,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        backgroundColor: COLORS.surfaceLow,
        borderRadius: RADII.lg,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
          {label}
        </Text>
        {sublabel && (
          <Text
            style={{
              fontFamily: FONTS.regular,
              fontSize: 12,
              color: COLORS.textDim,
              marginTop: 2,
            }}
          >
            {sublabel}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.surfaceHigh, true: COLORS.primary + "55" }}
        thumbColor={value ? COLORS.primary : COLORS.textDim}
        ios_backgroundColor={COLORS.surfaceHigh}
      />
    </View>
  );
}

function PickerRow({
  icon,
  label,
  value,
  displayValue,
  options,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
}) {
  const handlePress = () => {
    Alert.alert(
      label,
      undefined,
      [
        ...options.map((opt) => ({
          text: opt.label,
          onPress: () => onSelect(opt.value),
          style: (opt.value === value ? "cancel" : "default") as "cancel" | "default",
        })),
        { text: "Cancel", style: "destructive" },
      ]
    );
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={{
        backgroundColor: COLORS.surfaceLow,
        borderRadius: RADII.lg,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      {icon}
      <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text, flex: 1 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: COLORS.primary }}>
        {displayValue}
      </Text>
      <ChevronRight size={14} color={COLORS.textDim} />
    </AnimatedPressable>
  );
}

function NumberRow({
  icon,
  label,
  sublabel,
  value,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  value: string | number;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        backgroundColor: COLORS.surfaceLow,
        borderRadius: RADII.lg,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
          {label}
        </Text>
        {sublabel && (
          <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
            {sublabel}
          </Text>
        )}
      </View>
      <Text style={{ fontFamily: FONTS.headline, fontSize: 16, color: COLORS.primary }}>
        {value}
      </Text>
      <ChevronRight size={14} color={COLORS.textDim} />
    </AnimatedPressable>
  );
}

// ─── Main Settings Screen ─────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettingsStore();
  const { user, signOut, isAnonymous } = useAuthStore();
  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all data including rounds, scores, statistics, and settings. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              "All your data will be permanently erased.",
              [
                { text: "Keep My Account", style: "cancel" },
                {
                  text: "Yes, Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      // Clear all persisted stores
                      await AsyncStorage.multiRemove([
                        "snapscore-contests",
                        "snapscore-auth",
                        "snapscore-settings",
                        "snapscore-scan",
                        "snapscore-onboarding",
                      ]);
                      // TODO: When Supabase is live, call supabase.auth.admin.deleteUser()
                      // and delete all user data from database
                      signOut();
                      router.replace("/onboarding");
                    } catch (e) {
                      Alert.alert("Error", "Failed to delete account. Please try again.");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          signOut();
          router.replace("/auth");
        },
      },
    ]);
  };

  const handleResetDefaults = () => {
    Alert.alert(
      "Reset to Defaults",
      "This will reset all settings to their default values.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => settings.resetToDefaults(),
        },
      ]
    );
  };

  const handleEditNumber = (title: string, currentValue: number, onSave: (v: number) => void) => {
    Alert.prompt(
      title,
      `Current: ${currentValue}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: (text?: string) => {
            const num = parseFloat(text || "0");
            if (!isNaN(num) && num >= 0) onSave(num);
          },
        },
      ],
      "plain-text",
      String(currentValue)
    );
  };

  const scoreFormatLabel: Record<ScoreFormat, string> = {
    to_par: "To Par (+2, -1)",
    gross: "Gross (74, 82)",
    both: "Both",
  };

  const teeLabel: Record<DefaultTee, string> = {
    tips: "Tips / Championship",
    blue: "Blue",
    white: "White",
    red: "Red",
    forward: "Forward",
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 12,
        }}
      >
        <AnimatedPressable onPress={() => router.back()}>
          <ChevronLeft size={26} color={COLORS.text} />
        </AnimatedPressable>
        <Text style={{ ...TYPOGRAPHY.headline, color: COLORS.text, flex: 1 }}>Settings</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Account ── */}
        <SectionHeader title="Account" />
        <View
          style={{
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            padding: 16,
            marginBottom: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: RADII.full,
              backgroundColor: COLORS.primary + "22",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: FONTS.headline, fontSize: 18, color: COLORS.primary }}>
              {(user?.name || "G")[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text }}>
              {user?.name || "Golfer"}
            </Text>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim }}>
              {user?.email || (isAnonymous ? "Guest account" : "No email")}
            </Text>
          </View>
          {user?.provider && (
            <View
              style={{
                backgroundColor: COLORS.surfaceHigh,
                borderRadius: RADII.md,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase" }}>
                {user.provider}
              </Text>
            </View>
          )}
        </View>

        {/* ── Scoring ── */}
        <SectionHeader title="Scoring" />

        <PickerRow
          icon={<Hash size={18} color={COLORS.textDim} />}
          label="Score Display"
          value={settings.scoreFormat}
          displayValue={scoreFormatLabel[settings.scoreFormat]}
          options={[
            { value: "to_par", label: "To Par (+2, -1)" },
            { value: "gross", label: "Gross (74, 82)" },
            { value: "both", label: "Both" },
          ]}
          onSelect={(v) => settings.updateSetting("scoreFormat", v as ScoreFormat)}
        />

        <ToggleRow
          icon={<Target size={18} color={COLORS.textDim} />}
          label="Show Net Scores"
          sublabel="Apply handicap strokes to displayed scores"
          value={settings.showNetScores}
          onToggle={(v) => settings.updateSetting("showNetScores", v)}
        />

        {Platform.OS === "ios" ? (
          <NumberRow
            icon={<Gauge size={18} color={COLORS.textDim} />}
            label="Default Bet Unit"
            sublabel="Starting bet size for new contests"
            value={`$${settings.defaultBetUnit}`}
            onPress={() =>
              handleEditNumber("Default Bet Unit ($)", settings.defaultBetUnit, (v) =>
                settings.updateSetting("defaultBetUnit", v)
              )
            }
          />
        ) : (
          <NumberRow
            icon={<Gauge size={18} color={COLORS.textDim} />}
            label="Default Bet Unit"
            sublabel="Starting bet size for new contests"
            value={`$${settings.defaultBetUnit}`}
            onPress={() => {}}
          />
        )}

        <ToggleRow
          icon={<Zap size={18} color={COLORS.textDim} />}
          label="Auto-Complete at 18"
          sublabel="Automatically finalize round after hole 18"
          value={settings.autoComplete18}
          onToggle={(v) => settings.updateSetting("autoComplete18", v)}
        />

        {/* ── Course & Play ── */}
        <SectionHeader title="Course & Play" />

        <PickerRow
          icon={<Ruler size={18} color={COLORS.textDim} />}
          label="Distance Unit"
          value={settings.distanceUnit}
          displayValue={settings.distanceUnit === "yards" ? "Yards" : "Meters"}
          options={[
            { value: "yards", label: "Yards" },
            { value: "meters", label: "Meters" },
          ]}
          onSelect={(v) => settings.updateSetting("distanceUnit", v as DistanceUnit)}
        />

        <PickerRow
          icon={<Target size={18} color={COLORS.textDim} />}
          label="Default Tee"
          value={settings.defaultTee}
          displayValue={teeLabel[settings.defaultTee]}
          options={[
            { value: "tips", label: "Tips / Championship" },
            { value: "blue", label: "Blue" },
            { value: "white", label: "White" },
            { value: "red", label: "Red" },
            { value: "forward", label: "Forward" },
          ]}
          onSelect={(v) => settings.updateSetting("defaultTee", v as DefaultTee)}
        />

        {Platform.OS === "ios" && (
          <NumberRow
            icon={<Target size={18} color={COLORS.textDim} />}
            label="Default Handicap"
            value={settings.defaultHandicap}
            onPress={() =>
              handleEditNumber("Default Handicap", settings.defaultHandicap, (v) =>
                settings.updateSetting("defaultHandicap", Math.min(54, Math.max(0, v)))
              )
            }
          />
        )}

        <ToggleRow
          icon={<Target size={18} color={COLORS.textDim} />}
          label="Gimmes"
          sublabel={settings.useGimmes ? `Within ${settings.gimmeDistance} feet` : "No gimmes — putt everything out"}
          value={settings.useGimmes}
          onToggle={(v) => settings.updateSetting("useGimmes", v)}
        />

        {/* ── Display ── */}
        <SectionHeader title="Display" />

        <ToggleRow
          icon={<Zap size={18} color={COLORS.textDim} />}
          label="Haptic Feedback"
          sublabel="Vibrate on score entry and actions"
          value={settings.hapticFeedback}
          onToggle={(v) => settings.updateSetting("hapticFeedback", v)}
        />

        <ToggleRow
          icon={<Eye size={18} color={COLORS.textDim} />}
          label="Show Hole Handicap"
          sublabel="Display hole difficulty index on scorecard"
          value={settings.showHoleHandicap}
          onToggle={(v) => settings.updateSetting("showHoleHandicap", v)}
        />

        <ToggleRow
          icon={<Ruler size={18} color={COLORS.textDim} />}
          label="Show Yardage"
          sublabel="Display hole yardage on scorecard"
          value={settings.showYardage}
          onToggle={(v) => settings.updateSetting("showYardage", v)}
        />

        <ToggleRow
          icon={<Eye size={18} color={COLORS.textDim} />}
          label="Compact Leaderboard"
          sublabel="Denser layout for large groups"
          value={settings.compactLeaderboard}
          onToggle={(v) => settings.updateSetting("compactLeaderboard", v)}
        />

        {/* ── OCR / Scanning ── */}
        <SectionHeader title="Scanning" />

        <ToggleRow
          icon={<Camera size={18} color={COLORS.textDim} />}
          label="Auto Claude Vision"
          sublabel="Use AI fallback when on-device OCR is uncertain"
          value={settings.autoClaude}
          onToggle={(v) => settings.updateSetting("autoClaude", v)}
        />

        <ToggleRow
          icon={<Camera size={18} color={COLORS.textDim} />}
          label="Confirm Before Import"
          sublabel="Review scanned scores before adding to contest"
          value={settings.confirmBeforeImport}
          onToggle={(v) => settings.updateSetting("confirmBeforeImport", v)}
        />

        {/* ── Notifications ── */}
        <SectionHeader title="Notifications" />

        <ToggleRow
          icon={<Bell size={18} color={COLORS.textDim} />}
          label="Round Reminders"
          sublabel="Get reminded to finish incomplete rounds"
          value={settings.roundReminders}
          onToggle={(v) => settings.updateSetting("roundReminders", v)}
        />

        <ToggleRow
          icon={<Bell size={18} color={COLORS.textDim} />}
          label="Settlement Reminders"
          sublabel="Reminders for unsettled bets"
          value={settings.settlementReminders}
          onToggle={(v) => settings.updateSetting("settlementReminders", v)}
        />

        {/* ── Privacy ── */}
        <SectionHeader title="Privacy" />

        <ToggleRow
          icon={<Shield size={18} color={COLORS.textDim} />}
          label="Share Statistics"
          sublabel="Allow friends to see your stats"
          value={settings.shareStatistics}
          onToggle={(v) => settings.updateSetting("shareStatistics", v)}
        />

        <ToggleRow
          icon={<Shield size={18} color={COLORS.textDim} />}
          label="Show in Leaderboards"
          sublabel="Appear in group leaderboards"
          value={settings.showInLeaderboards}
          onToggle={(v) => settings.updateSetting("showInLeaderboards", v)}
        />

        {/* ── About & Actions ── */}
        <SectionHeader title="About" />

        <AnimatedPressable
          onPress={() => Linking.openURL("https://august-industries.com/snapscore/privacy")}
          style={{
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Info size={18} color={COLORS.textDim} />
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text, flex: 1 }}>
            Privacy Policy
          </Text>
          <ChevronRight size={14} color={COLORS.textDim} />
        </AnimatedPressable>

        <AnimatedPressable
          onPress={() => Linking.openURL("https://august-industries.com/snapscore/terms")}
          style={{
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Info size={18} color={COLORS.textDim} />
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text, flex: 1 }}>
            Terms of Service
          </Text>
          <ChevronRight size={14} color={COLORS.textDim} />
        </AnimatedPressable>

        <View
          style={{
            backgroundColor: COLORS.surfaceLow,
            borderRadius: RADII.lg,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Info size={18} color={COLORS.textDim} />
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text, flex: 1 }}>
            Version
          </Text>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textDim }}>
            1.0.0
          </Text>
        </View>

        {/* Reset & Sign Out */}
        <View style={{ marginTop: 24, gap: 8, marginBottom: 20 }}>
          <AnimatedPressable
            onPress={handleResetDefaults}
            style={{
              backgroundColor: COLORS.surfaceLow,
              borderRadius: RADII.lg,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <RotateCcw size={18} color={COLORS.warn} />
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.warn }}>
              Reset to Defaults
            </Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleSignOut}
            style={{
              backgroundColor: COLORS.errorContainer + "44",
              borderRadius: RADII.lg,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <LogOut size={18} color={COLORS.error} />
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.error }}>
              Sign Out
            </Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleDeleteAccount}
            style={{
              backgroundColor: COLORS.errorContainer + "22",
              borderRadius: RADII.lg,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Trash2 size={18} color={COLORS.error} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.error }}>
                Delete Account
              </Text>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                Permanently erase all data
              </Text>
            </View>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
