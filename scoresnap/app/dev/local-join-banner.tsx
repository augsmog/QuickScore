import { SafeScreen } from "../../src/ui/SafeScreen";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LocalJoinLimitationBanner } from "../../src/ui/LocalJoinLimitationBanner";
import { COLORS, FONTS } from "../../src/ui/theme";

/** Static sample only; does not create, join, or share a contest. */
export default function LocalJoinBannerPreview() {
  return <SafeScreen style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>SNAPSCORE / SUNDAY LEDGER</Text>
      <Text style={styles.heading}>Join with code</Text>
      <Text style={styles.body}>Play as a guest. No account needed.</Text>
      <LocalJoinLimitationBanner />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>SAMPLE ROUND · GUEST PREVIEW</Text>
        <Text style={styles.title}>Sunday at the Pines</Text>
        <Text style={styles.body}>18 holes · Four friends · Skins</Text>
        <Text style={styles.label}>Join code</Text>
        <TextInput accessibilityLabel="Sample join code" editable={false} value="PINE42" style={styles.input} />
        <Text style={styles.label}>Display name</Text>
        <TextInput accessibilityLabel="Sample display name" editable={false} value="Sam" style={styles.input} />
        <View style={styles.button}><Text style={{ color: COLORS.onPrimary, fontFamily: FONTS.semibold }}>Find contest</Text></View>
      </View>
      <Text style={styles.body}>Sample data · Preview only</Text>
    </ScrollView>
  </SafeScreen>;
}

const styles = StyleSheet.create({
  page: { padding: 24, gap: 16, width: "100%", maxWidth: 440, alignSelf: "center" },
  eyebrow: { color: COLORS.textDim, fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1 },
  heading: { color: COLORS.text, fontFamily: FONTS.headline, fontSize: 32 },
  title: { color: COLORS.text, fontFamily: FONTS.headline, fontSize: 23 },
  body: { color: COLORS.textDim, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: COLORS.surface, borderColor: COLORS.outline, borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  label: { color: COLORS.text, fontFamily: FONTS.semibold, fontSize: 14 },
  input: { backgroundColor: COLORS.surfaceHigh, color: COLORS.text, fontSize: 18, padding: 14, borderRadius: 12 },
  button: { backgroundColor: COLORS.primary, alignItems: "center", padding: 16, borderRadius: 12, marginTop: 4 },
});
