import { View, Text } from "react-native";
import { CROSS_DEVICE_SHARING_ENABLED } from "../../config/features";
import { COLORS, FONTS } from "../theme";
import { SceneFrame, SceneRow, SceneText, styles, type SceneProps } from "./SceneFrame";
export function SettlementScene(props: SceneProps) {
 return <SceneFrame {...props} accent={COLORS.gold} label={`Settle Up, Saturday Skins, 12 players. Ben owes Amy $24, Sam owes Jo $18, Kai owes Amy $12, Liz owes Max $6. Five more payments.${CROSS_DEVICE_SHARING_ENABLED ? ' Join a group.' : ''}`}>
  <View style={styles.header}><View><Text style={[styles.title, { color: COLORS.gold }]}>Settle Up</Text><SceneText muted>Saturday Skins · 12 players</SceneText></View><View style={{ flexDirection: "row", marginLeft: 4 }}>{['A','B','S','J','+8'].map((name,i) => <View key={name} style={{ width: 22, height: 22, borderRadius: 11, marginLeft: -4, alignItems: "center", justifyContent: "center", backgroundColor: i % 2 ? COLORS.bg : COLORS.secondaryContainer, borderWidth: 1, borderColor: COLORS.surface }}><Text style={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.text }}>{name}</Text></View>)}</View></View>
  {[["Ben","Amy","24"],["Sam","Jo","18"],["Kai","Amy","12"],["Liz","Max","6"]].map(([from,to,amount],i) => <SceneRow key={from} index={i}><SceneText>{from}  →  {to}</SceneText><Text style={{ color: COLORS.gold, fontFamily: FONTS.bold, fontSize: 14 }}>${amount}</Text></SceneRow>)}
  <View style={styles.footer}><SceneText muted>+5 more payments</SceneText>{CROSS_DEVICE_SHARING_ENABLED && <View style={styles.chip}><Text style={{ color: COLORS.primary, fontFamily: FONTS.bold, fontSize: 11 }}>+ Join a group</Text></View>}</View>
 </SceneFrame>;
}
