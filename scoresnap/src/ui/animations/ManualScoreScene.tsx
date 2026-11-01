import { Text, View } from "react-native";
import { Camera } from "lucide-react-native";
import { COLORS, FONTS } from "../theme";
import { SceneFrame, SceneRow, SceneText, styles, type SceneProps } from "./SceneFrame";
export function ManualScoreScene(props: SceneProps) {
 return <SceneFrame {...props} accent={COLORS.primary} label="Manual scoring example, Hole 7, Par 4. Tap to enter strokes. 12 players. Amy 4, Ben 5, Sam 3, Jo no score. Eight more players, or scan a card.">
 <View style={styles.header}><View><Text style={styles.title}>Hole 7 · Par 4</Text><SceneText muted>Tap to enter strokes</SceneText></View><View style={[styles.chip,{ backgroundColor: COLORS.bg, borderColor: COLORS.border, paddingHorizontal: 8 }]}><SceneText muted>12 players</SceneText></View></View>
 {[["Amy","4"],["Ben","5"],["Sam","3"],["Jo","–"]].map(([name,score],i) => <SceneRow key={name} index={i} active={name === 'Ben'}><SceneText>{name}</SceneText><View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>{['−',score,'+'].map((value,j) => <View key={j} style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 11, borderWidth: j === 1 ? 0 : 1, borderColor: COLORS.border, backgroundColor: name === 'Ben' && j === 2 ? COLORS.primary : COLORS.surface }}><Text style={{ fontFamily: FONTS.bold, fontSize: 16, color: name === 'Ben' && j === 2 ? COLORS.surface : j === 1 ? name === 'Ben' ? COLORS.warn : COLORS.primary : COLORS.primary }}>{value}</Text></View>)}</View></SceneRow>)}
 <View style={styles.footer}><SceneText muted>+8 more players</SceneText><View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Camera size={11} color={COLORS.textDim} /><SceneText muted>or scan a card</SceneText></View></View>
 </SceneFrame>;
}
