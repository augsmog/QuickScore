import { Dimensions, StyleSheet, Text, View } from "react-native";
import { getLocalJoinLimitation } from "../services/local-join-limitation";
import { COLORS, FONTS } from "./theme";

export function LocalJoinLimitationBanner() {
  const { title, message } = getLocalJoinLimitation();
  const compact = Dimensions.get("window").height < 700;
  return <View testID="local-join-limitation" style={[styles.banner, compact && styles.compactBanner]}>
    <Text style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
    <Text style={[styles.message, compact && styles.compactMessage]}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  banner: { backgroundColor: COLORS.warnContainer, borderColor: COLORS.warn, borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, gap: 5 },
  title: { color: COLORS.warn, fontFamily: FONTS.bold, fontSize: 15, lineHeight: 21 },
  message: { color: COLORS.text, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20 },
  compactBanner: { padding: 8, gap: 3 },
  compactTitle: { fontSize: 13, lineHeight: 17 },
  compactMessage: { fontSize: 12, lineHeight: 17 },
});
