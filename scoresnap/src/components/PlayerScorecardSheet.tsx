import React from "react";
import { Modal, View, Text, ScrollView, Pressable } from "react-native";
import { COLORS, FONTS, RADII } from "../ui/theme";
import { formatToPar } from "../utils/formatters";
import { buildPlayerScorecard } from "../engine/calculators/player-scorecard";
import type { Player, Course } from "../engine/types";

// AUG-707 (AUG-705b): tap a leaderboard row -> that player's full-round
// scorecard. UI over the AUG-705a pure data layer (buildPlayerScorecard).
type Props = {
  player: Player | null;
  course: Course;
  onClose: () => void;
};

const cell = (w: number, extra: object = {}) => ({
  width: w, textAlign: "center" as const, fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text, ...extra,
});

export function PlayerScorecardSheet({ player, course, onClose }: Props) {
  if (!player) return null;
  const card = buildPlayerScorecard(player, course);
  const showNet = card.netAvailable;
  const toParText = (n: number | null) => (n === null ? "" : formatToPar(n).replace("-", "−"));
  const header = (
    <View style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.outline }}>
      <Text style={cell(44, { color: COLORS.textDim, fontSize: 11 })}>HOLE</Text>
      <Text style={cell(44, { color: COLORS.textDim, fontSize: 11 })}>PAR</Text>
      <Text style={cell(56, { color: COLORS.textDim, fontSize: 11 })}>SCORE</Text>
      <Text style={cell(56, { color: COLORS.textDim, fontSize: 11 })}>TO PAR</Text>
      {showNet && <Text style={cell(56, { color: COLORS.textDim, fontSize: 11 })}>NET</Text>}
    </View>
  );
  const summary = (label: string, n: typeof card.total, testID: string) => (
    <View testID={testID} style={{ flexDirection: "row", paddingVertical: 8, backgroundColor: COLORS.surfaceHigh }}>
      <Text style={cell(44, { fontFamily: FONTS.semibold })}>{label}</Text>
      <Text style={cell(44, { color: COLORS.textDim })}>{n.par || ""}</Text>
      <Text style={cell(56, { fontFamily: FONTS.semibold })}>{n.strokes || ""}</Text>
      <Text style={cell(56, { fontFamily: FONTS.semibold })}>{n.strokes ? toParText(n.toPar) : ""}</Text>
      {showNet && <Text style={cell(56, { fontFamily: FONTS.semibold })}>{n.net ? n.net : ""}</Text>}
    </View>
  );
  const rows: React.ReactElement[] = [];
  card.holes.forEach((h, i) => {
    rows.push(
      <View key={h.num} testID={`player-scorecard-hole-${h.num}`}
        style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.outline }}>
        <Text style={cell(44, { color: COLORS.textDim })}>{h.num}</Text>
        <Text style={cell(44, { color: COLORS.textDim })}>{h.par}</Text>
        <Text style={cell(56, { fontFamily: FONTS.semibold })}>{h.strokes ?? ""}</Text>
        <Text style={cell(56, {
          color: h.toPar !== null && h.toPar < 0 ? COLORS.primary : h.toPar !== null && h.toPar > 0 ? COLORS.error : COLORS.text,
        })}>{toParText(h.toPar)}</Text>
        {showNet && <Text style={cell(56)}>{h.net ?? ""}</Text>}
      </View>,
    );
    if (card.holes.length > 9 && h.num === 9) rows.push(<View key="out">{summary("OUT", card.front, "player-scorecard-front")}</View>);
    if (i === card.holes.length - 1 && card.holes.length > 9) rows.push(<View key="in">{summary("IN", card.back, "player-scorecard-back")}</View>);
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View testID="player-scorecard-sheet"
          style={{ maxHeight: "88%", backgroundColor: COLORS.bg, borderTopLeftRadius: RADII.lg, borderTopRightRadius: RADII.lg, padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text testID="player-scorecard-name" style={{ fontFamily: FONTS.bold, fontSize: 20, color: COLORS.text }}>{card.name}</Text>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim }}>
                {course.name} · {card.holesPlayed} of {card.holes.length} holes
              </Text>
            </View>
            <Pressable testID="player-scorecard-close" accessibilityRole="button" accessibilityLabel="Close scorecard"
              onPress={onClose} style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.primary }}>Done</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {header}
            {rows}
            {summary("TOT", card.total, "player-scorecard-total")}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
