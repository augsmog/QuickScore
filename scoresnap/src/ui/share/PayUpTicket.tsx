import { forwardRef } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../theme';
import type { TicketModel } from './pay-up-ticket-model';

/** Drawn at 360×450 points and captured at 3x: a 1080×1350 share image. */
export const TICKET_SIZE = { width: 360, height: 450 } as const;
export const TICKET_CAPTURE = { width: 1080, height: 1350 } as const;
const FELT = COLORS.primary, PAPER = '#FFFDF7', CREAM = '#FAF4E8';

/**
 * The Pay-up ticket share image. Every size is fixed (no Dynamic Type): it is a picture,
 * and must come out the same on every phone.
 */
export const PayUpTicket = forwardRef<View, { model: TicketModel }>(function PayUpTicket({ model }, ref) {
  const many = model.payments.length > 3;
  const long = model.payments.some(p => p.from.length + p.to.length > 20);
  const nameSize = long ? 13 : many ? 15 : 17;
  const amountSize = long ? 18 : many ? 20 : 24;
  return <View ref={ref} collapsable={false} testID="pay-up-ticket" style={styles.frame}>
    <View style={styles.ticket}>
      <Text allowFontScaling={false} numberOfLines={1} ellipsizeMode="tail" style={styles.heading}>{model.heading}</Text>
      {model.allSquare
        ? <View style={styles.square}>
            <Text allowFontScaling={false} style={styles.squareTitle}>Nobody owes{'\n'}a thing.</Text>
            <Text allowFontScaling={false} style={styles.squareSub}>Dead even.</Text>
          </View>
        : <View style={{ marginTop: 4 }}>
            {model.payments.map(p => <View key={`${p.from}>${p.to}`} style={[styles.pay, many && { paddingVertical: model.payments.length >= 5 ? 1 : 3 }]}>
              <Text allowFontScaling={false} numberOfLines={1} style={[styles.payNames, { fontSize: nameSize }]}>
                {p.from}<Text style={styles.pays}>  pays  </Text>{p.to}
              </Text>
              <Text allowFontScaling={false} style={[styles.payAmount, { fontSize: amountSize }]}>{p.amount}</Text>
            </View>)}
            {model.more > 0 && <Text allowFontScaling={false} style={styles.more}>+ {model.more} more in the app</Text>}
          </View>}
      <Text allowFontScaling={false} style={styles.section}>HOW IT FINISHED</Text>
      {model.finish.map(f => <View key={f.name} style={styles.row}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.rowLabel}>{f.name}</Text>
        <Text allowFontScaling={false} style={[styles.rowValue, { color: f.tone === 'up' ? COLORS.primary : f.tone === 'down' ? COLORS.error : COLORS.text }]}>{f.amount}</Text>
      </View>)}
      {model.moreFinish > 0 && <Text allowFontScaling={false} style={styles.more}>+ {model.moreFinish} more {model.moreFinish === 1 ? 'player' : 'players'}</Text>}
      <Text allowFontScaling={false} style={styles.section}>THE ROUND</Text>
      {([['Course', model.course], ['Played', model.played], ['Game', model.game]] as const).filter(([, value]) => !!value).map(([label, value]) => <View key={label} style={styles.row}>
        <Text allowFontScaling={false} style={styles.detailLabel}>{label}</Text>
        <Text allowFontScaling={false} numberOfLines={1} ellipsizeMode="tail" style={styles.detailValue}>{value}</Text>
      </View>)}
      <Text allowFontScaling={false} style={styles.note}>{model.note}</Text>
    </View>
    <View style={styles.footer}>
      <Image source={require('../../../assets/icon.png')} style={styles.icon} />
      <View style={{ flex: 1 }}>
        <Text allowFontScaling={false} style={styles.brand}>SNAPSCORE</Text>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.tagline}>Score the round. See who owes what.</Text>
      </View>
      <Text allowFontScaling={false} style={styles.download}>{model.download}</Text>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  frame: { width: TICKET_SIZE.width, height: TICKET_SIZE.height, backgroundColor: FELT, paddingHorizontal: 30, paddingTop: 16, paddingBottom: 18, justifyContent: 'space-between' },
  ticket: { backgroundColor: PAPER, borderRadius: 12, paddingHorizontal: 20, paddingTop: 11, paddingBottom: 9, transform: [{ rotate: '-1.5deg' }] },
  heading: { fontFamily: FONTS.displaySC, fontSize: 10.5, letterSpacing: 2.2, color: COLORS.textDim, textAlign: 'center' },
  pay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(23,37,30,0.25)' },
  payNames: { flex: 1, fontFamily: FONTS.display, color: COLORS.text },
  pays: { fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textDim },
  payAmount: { fontFamily: FONTS.extrabold, color: COLORS.primary, fontVariant: ['tabular-nums'] },
  more: { fontFamily: FONTS.regular, fontSize: 10.5, color: COLORS.textDim, marginTop: 3 },
  square: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(23,37,30,0.25)' },
  squareTitle: { fontFamily: FONTS.display, fontSize: 34, lineHeight: 36, color: COLORS.text, textAlign: 'center' },
  squareSub: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim, marginTop: 5 },
  section: { fontFamily: FONTS.displaySC, fontSize: 9, letterSpacing: 2, color: COLORS.textDim, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingVertical: 0.5 },
  rowLabel: { flex: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textDim },
  rowValue: { fontFamily: FONTS.semibold, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  detailLabel: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textDim },
  detailValue: { flex: 1, textAlign: 'right', fontFamily: FONTS.semibold, fontSize: 11.5, color: COLORS.text },
  note: { fontFamily: FONTS.regular, fontStyle: 'italic', fontSize: 11, color: COLORS.textDim, textAlign: 'center', marginTop: 5 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 28, height: 28, borderRadius: 7 },
  brand: { fontFamily: FONTS.displaySC, fontSize: 14.5, letterSpacing: 2, color: CREAM },
  tagline: { fontFamily: FONTS.regular, fontSize: 9.5, color: CREAM, opacity: 0.8 },
  download: { fontFamily: FONTS.semibold, fontSize: 9.5, color: CREAM, opacity: 0.85 },
});

/**
 * Mounts the ticket off-screen so it can be captured as the share image. Nothing is mounted
 * on web (no image share there) or when there is no settled result to show.
 */
export const TicketShareSource = forwardRef<View, { model: TicketModel | null }>(function TicketShareSource({ model }, ref) {
  if (Platform.OS === 'web' || !model) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -10000, top: 0 }}>
    <PayUpTicket ref={ref} model={model} />
  </View>;
});
