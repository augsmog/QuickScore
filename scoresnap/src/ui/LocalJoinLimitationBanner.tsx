import { StyleSheet, Text, View } from "react-native";
import { getLocalJoinLimitation } from "../services/local-join-limitation";
import { COLORS, FONTS } from "./theme";

export function LocalJoinLimitationBanner() {
  const { title, message } = getLocalJoinLimitation();
  return <View testID="local-join-limitation" style={styles.banner}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.message}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  banner: { backgroundColor: COLORS.warnContainer, borderColor: COLORS.warn, borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 14, gap: 5 },
  title: { color: COLORS.warn, fontFamily: FONTS.bold, fontSize: 15, lineHeight: 21 },
  message: { color: COLORS.text, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20 },
});
