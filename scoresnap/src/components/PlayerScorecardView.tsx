import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { COLORS, FONTS, RADII } from "../ui/theme";
import { formatToPar } from "../utils/formatters";
import type { PlayerScorecard, ScorecardHole, ScorecardNine } from "../engine/calculators/player-scorecard";

// AUG-705: full-round scorecard for one leaderboard player (Round > Leaderboard,
// tap a row). Pure presentation over buildPlayerScorecard (AUG-706, PR #149):
// hole / par / strokes with score shapes / to-par, front-back-total, and a Net
// row only when the course is net-rankable. Unplayed holes render blank.

type Props = {
  card: PlayerScorecard;
  onClose: () => void;
};

const CELL_W = 30;
const LABEL_W = 52;

function toParText(n: number): string {
  return formatToPar(n).replace("-", "−");
}

function toParColor(n: number | null): string {
  if (n === null) return COLORS.text;
  return n < 0 ? COLORS.primary : n > 0 ? COLORS.error : COLORS.text;
}

/**
 * Score shape for a played hole, matching the leaderboard hole strip language:
 * circle for under par (double circle feel via fill for eagle or better), square
 * for over par (filled for double bogey or worse), plain for par.
 */
export function scoreShape(toPar: number | null): { shape: "circle" | "square" | "none"; filled: boolean } {
  if (toPar === null || toPar === 0) return { shape: "none", filled: false };
  if (toPar < 0) return { shape: "circle", filled: toPar <= -2 };
  return { shape: "square", filled: toPar >= 2 };
}

function HoleCell({ hole, playerId }: { hole: ScorecardHole; playerId: string }) {
  const { shape, filled } = scoreShape(hole.toPar);
  const color = hole.toPar !== null && hole.toPar < 0 ? COLORS.primary : COLORS.error;
  return (
    <View style={{ width: CELL_W, height: 28, alignItems: "center", justifyContent: "center" }}>
      <View
        testID={`scorecard-strokes-${playerId}-${hole.num}`}
        accessibilityLabel={hole.strokes === null ? `Hole ${hole.num}: not played` : `Hole ${hole.num}: ${hole.strokes} strokes`}
        style={{
          width: 24, height: 24,
          borderRadius: shape === "circle" ? 12 : 0,
          borderWidth: shape === "none" ? 0 : 1,
          borderColor: color,
          backgroundColor: filled ? color : "transparent",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: FONTS.score, fontSize: 13, color: filled ? COLORS.onPrimary : COLORS.text }}>
          {hole.strokes === null ? "" : hole.strokes}
        </Text>
      </View>
    </View>
  );
}

function NineTable({ title, holes, nine, card }: {
  title: "Front" | "Back";
  holes: ScorecardHole[];
  nine: ScorecardNine;
  card: PlayerScorecard;
}) {
  if (holes.length === 0) return null;
  const segPlayed = holes.some((h) => h.strokes !== null);
  const rowLabel = (text: string) => (
    <Text style={{ width: LABEL_W, fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>{text}</Text>
  );
  const sumCell = (text: string, testID: string, color: string = COLORS.text) => (
    <Text testID={testID} style={{ width: 40, textAlign: "center", fontFamily: FONTS.semibold, fontSize: 13, color }}>{text}</Text>
  );
  const segKey = title.toLowerCase();
  return (
    <View testID={`scorecard-${segKey}`} style={{ backgroundColor: COLORS.surfaceMid, borderRadius: RADII.lg, padding: 10, marginBottom: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", height: 24 }}>
            {rowLabel("Hole")}
            {holes.map((h) => (
              <Text key={h.num} style={{ width: CELL_W, textAlign: "center", fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.text }}>{h.num}</Text>
            ))}
            <Text style={{ width: 40, textAlign: "center", fontFamily: FONTS.semibold, fontSize: 11, color: COLORS.textDim }}>{title === "Front" ? "OUT" : "IN"}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", height: 24 }}>
            {rowLabel("Par")}
            {holes.map((h) => (
              <Text key={h.num} style={{ width: CELL_W, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim }}>{h.par}</Text>
            ))}
            {sumCell(String(holes.reduce((s, h) => s + h.par, 0)), `scorecard-${segKey}-par`, COLORS.textDim)}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", height: 30 }}>
            {rowLabel("Score")}
            {holes.map((h) => <HoleCell key={h.num} hole={h} playerId={card.playerId} />)}
            {sumCell(segPlayed ? String(nine.strokes) : "", `scorecard-${segKey}-strokes`)}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", height: 24 }}>
            {rowLabel("To par")}
            {holes.map((h) => (
              <Text key={h.num} testID={`scorecard-topar-${card.playerId}-${h.num}`} style={{ width: CELL_W, textAlign: "center", fontFamily: FONTS.regular, fontSize: 11, color: toParColor(h.toPar) }}>
                {h.toPar === null ? "" : toParText(h.toPar)}
              </Text>
            ))}
            {sumCell(segPlayed ? toParText(nine.toPar) : "", `scorecard-${segKey}-topar`, segPlayed ? toParColor(nine.toPar) : COLORS.text)}
          </View>
          {card.netAvailable && (
            <View style={{ flexDirection: "row", alignItems: "center", height: 24 }}>
              {rowLabel("Net")}
              {holes.map((h) => (
                <Text key={h.num} testID={`scorecard-net-${card.playerId}-${h.num}`} style={{ width: CELL_W, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12, color: COLORS.text }}>
                  {h.net === null ? "" : h.net}
                </Text>
              ))}
              {sumCell(segPlayed && nine.net !== null ? String(nine.net) : "", `scorecard-${segKey}-net`)}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export function PlayerScorecardView({ card, onClose }: Props) {
  const front = card.holes.slice(0, 9);
  const back = card.holes.slice(9);
  const played = card.holesPlayed > 0;
  return (
    <View testID={`player-scorecard-${card.playerId}`} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 }}>
        <Pressable
          testID="player-scorecard-back"
          accessibilityRole="button"
          accessibilityLabel="Back to leaderboard"
          onPress={onClose}
          hitSlop={12}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.primary }}>‹ Leaderboard</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text testID="player-scorecard-name" style={{ fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text }}>{card.name}</Text>
        <Text testID="player-scorecard-thru" style={{ fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim, marginTop: 2, marginBottom: 12 }}>
          {played ? (card.holesPlayed === card.holes.length ? "Finished" : `Thru ${card.holesPlayed}`) : "Not started"}
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <View style={{ flex: 1, backgroundColor: COLORS.surfaceHigh, borderRadius: RADII.lg, padding: 12 }}>
            <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>Gross</Text>
            <Text testID="player-scorecard-gross" style={{ fontFamily: FONTS.score, fontSize: 24, color: COLORS.text }}>
              {played ? card.total.strokes : "—"}
            </Text>
            <Text testID="player-scorecard-gross-topar" style={{ fontFamily: FONTS.semibold, fontSize: 13, color: played ? toParColor(card.total.toPar) : COLORS.textDim }}>
              {played ? toParText(card.total.toPar) : ""}
            </Text>
          </View>
          {card.netAvailable && (
            <View style={{ flex: 1, backgroundColor: COLORS.surfaceHigh, borderRadius: RADII.lg, padding: 12 }}>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim }}>Net</Text>
              <Text testID="player-scorecard-net" style={{ fontFamily: FONTS.score, fontSize: 24, color: COLORS.text }}>
                {played && card.total.net !== null ? card.total.net : "—"}
              </Text>
              <Text testID="player-scorecard-net-topar" style={{ fontFamily: FONTS.semibold, fontSize: 13, color: played && card.total.net !== null ? toParColor(card.total.net - card.total.par) : COLORS.textDim }}>
                {played && card.total.net !== null ? toParText(card.total.net - card.total.par) : ""}
              </Text>
            </View>
          )}
        </View>

        <NineTable title="Front" holes={front} nine={card.front} card={card} />
        <NineTable title="Back" holes={back} nine={card.back} card={card} />
      </ScrollView>
    </View>
  );
}
