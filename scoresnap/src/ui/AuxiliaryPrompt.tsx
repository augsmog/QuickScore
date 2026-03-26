/**
 * AuxiliaryPrompt — Contextual per-hole prompts for Tier 2 games.
 *
 * Appears as a bottom sheet overlay after a score is entered on a hole
 * where a Tier 2 game needs additional input. Only shows when relevant:
 *   - Wolf:     Every hole (who does the wolf pick?)
 *   - Hammer:   Every hole (was a hammer dropped?)
 *   - Snake:    Only when a player scores bogey+ (did anyone 3-putt?)
 *   - Greenies: Only on par 3s (who won the greenie?)
 *
 * Design: "Skip = $0, not wrong" — skipping never produces inaccurate results,
 * it just means that game isn't scored for that hole.
 */

import { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import * as Haptics from "expo-haptics";
import { X, Check, ChevronRight } from "lucide-react-native";
import { COLORS, FONTS, RADII, TYPOGRAPHY } from "./theme";
import { AnimatedPressable } from "./AnimatedPressable";
import { GameType, Player, HoleInfo } from "../engine/types";

// ─── Types ────────────────────────────────────────────────────

export interface AuxPromptResult {
  wolf?: { partnerId: string | null; isLoneWolf: boolean };
  hammer?: { hammered: boolean; hammerBy: string; accepted: boolean };
  snake?: string[]; // player IDs who 3-putted
  greenies?: string | null; // player ID who won greenie, null = no one
}

interface AuxiliaryPromptProps {
  visible: boolean;
  holeNumber: number;
  holeInfo: HoleInfo;
  players: Player[];
  activeGames: GameType[];
  currentPlayerScores: Map<string, number>; // playerId → score for this hole
  wolfOrder?: string[]; // rotating wolf order (player IDs)
  onComplete: (results: AuxPromptResult) => void;
  onSkip: () => void;
}

// ─── Determine which prompts are needed ───────────────────────

function getNeededPrompts(
  activeGames: GameType[],
  holeInfo: HoleInfo,
  currentPlayerScores: Map<string, number>
): GameType[] {
  const needed: GameType[] = [];

  if (activeGames.includes("wolf")) {
    needed.push("wolf");
  }

  if (activeGames.includes("hammer")) {
    needed.push("hammer");
  }

  // Snake: only prompt if ANY player scored bogey or worse (likely 3-putt candidate)
  if (activeGames.includes("snake")) {
    const hasBogeyPlus = Array.from(currentPlayerScores.values()).some(
      (score) => score > 0 && score > holeInfo.par
    );
    if (hasBogeyPlus) {
      needed.push("snake");
    }
  }

  // Greenies: only on par 3s
  if (activeGames.includes("greenies") && holeInfo.par === 3) {
    needed.push("greenies");
  }

  return needed;
}

// ─── Individual prompt screens ────────────────────────────────

function WolfPrompt({
  holeNumber,
  players,
  wolfPlayerId,
  onSelect,
}: {
  holeNumber: number;
  players: Player[];
  wolfPlayerId: string;
  onSelect: (partnerId: string | null, isLoneWolf: boolean) => void;
}) {
  const wolfPlayer = players.find((p) => p.id === wolfPlayerId);
  const otherPlayers = players.filter((p) => p.id !== wolfPlayerId);

  return (
    <View>
      <Text style={styles.promptTitle}>Wolf — Hole {holeNumber}</Text>
      <Text style={styles.promptSubtitle}>
        {wolfPlayer?.name || "Wolf"} is the Wolf. Who did they pick?
      </Text>

      {otherPlayers.map((p) => (
        <AnimatedPressable
          key={p.id}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect(p.id, false);
          }}
          style={styles.optionButton}
        >
          <Text style={styles.optionText}>{p.name}</Text>
          <ChevronRight size={16} color={COLORS.textDim} />
        </AnimatedPressable>
      ))}

      <AnimatedPressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSelect(null, true);
        }}
        style={[styles.optionButton, { borderColor: COLORS.gold + "44", borderWidth: 1 }]}
      >
        <Text style={[styles.optionText, { color: COLORS.gold }]}>
          Lone Wolf (no partner)
        </Text>
        <Text style={{ fontSize: 18 }}>🐺</Text>
      </AnimatedPressable>
    </View>
  );
}

function HammerPrompt({
  holeNumber,
  players,
  onSelect,
}: {
  holeNumber: number;
  players: Player[];
  onSelect: (hammered: boolean, hammerBy: string, accepted: boolean) => void;
}) {
  const [hammered, setHammered] = useState<boolean | null>(null);
  const [hammerBy, setHammerBy] = useState<string | null>(null);

  if (hammered === null) {
    return (
      <View>
        <Text style={styles.promptTitle}>Hammer — Hole {holeNumber}</Text>
        <Text style={styles.promptSubtitle}>Was a hammer dropped this hole?</Text>

        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          <AnimatedPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setHammered(true);
            }}
            style={[styles.choiceButton, { backgroundColor: COLORS.primary + "22" }]}
          >
            <Text style={[styles.choiceText, { color: COLORS.primary }]}>Yes 🔨</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(false, "", true);
            }}
            style={[styles.choiceButton, { backgroundColor: COLORS.surfaceHigh }]}
          >
            <Text style={[styles.choiceText, { color: COLORS.textDim }]}>No</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  if (hammerBy === null) {
    return (
      <View>
        <Text style={styles.promptTitle}>Hammer — Hole {holeNumber}</Text>
        <Text style={styles.promptSubtitle}>Who dropped the hammer?</Text>

        {players.map((p) => (
          <AnimatedPressable
            key={p.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setHammerBy(p.id);
              // For simplicity, assume accepted (opponent didn't fold)
              onSelect(true, p.id, true);
            }}
            style={styles.optionButton}
          >
            <Text style={styles.optionText}>{p.name}</Text>
            <ChevronRight size={16} color={COLORS.textDim} />
          </AnimatedPressable>
        ))}
      </View>
    );
  }

  return null;
}

function SnakePrompt({
  holeNumber,
  players,
  currentPlayerScores,
  holeInfo,
  onSelect,
}: {
  holeNumber: number;
  players: Player[];
  currentPlayerScores: Map<string, number>;
  holeInfo: HoleInfo;
  onSelect: (threePuttPlayerIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Only show players who scored bogey+ (likely 3-putt candidates)
  const candidates = players.filter((p) => {
    const score = currentPlayerScores.get(p.id) || 0;
    return score > holeInfo.par;
  });

  const togglePlayer = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <View>
      <Text style={styles.promptTitle}>Snake — Hole {holeNumber}</Text>
      <Text style={styles.promptSubtitle}>
        Did anyone 3-putt? Tap to select.
      </Text>

      {candidates.map((p) => {
        const isSelected = selected.has(p.id);
        return (
          <AnimatedPressable
            key={p.id}
            onPress={() => togglePlayer(p.id)}
            style={[
              styles.optionButton,
              isSelected && {
                backgroundColor: COLORS.error + "22",
                borderColor: COLORS.error + "44",
                borderWidth: 1,
              },
            ]}
          >
            <Text style={[styles.optionText, isSelected && { color: COLORS.error }]}>
              {p.name}
            </Text>
            {isSelected && <Text style={{ fontSize: 16 }}>🐍</Text>}
          </AnimatedPressable>
        );
      })}

      <AnimatedPressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSelect(Array.from(selected));
        }}
        style={[styles.confirmButton, { marginTop: 12 }]}
      >
        <Check size={18} color={COLORS.onPrimary} />
        <Text style={styles.confirmText}>
          {selected.size === 0 ? "No 3-Putts" : `Confirm ${selected.size} 3-putt${selected.size > 1 ? "s" : ""}`}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

function GreeniePrompt({
  holeNumber,
  players,
  onSelect,
}: {
  holeNumber: number;
  players: Player[];
  onSelect: (winnerId: string | null) => void;
}) {
  return (
    <View>
      <Text style={styles.promptTitle}>Greenie — Hole {holeNumber}</Text>
      <Text style={styles.promptSubtitle}>
        Who won the greenie? (Closest to pin and made par or better)
      </Text>

      {players.map((p) => (
        <AnimatedPressable
          key={p.id}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect(p.id);
          }}
          style={styles.optionButton}
        >
          <Text style={styles.optionText}>{p.name}</Text>
          <ChevronRight size={16} color={COLORS.textDim} />
        </AnimatedPressable>
      ))}

      <AnimatedPressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSelect(null);
        }}
        style={[styles.optionButton, { borderColor: COLORS.textDim + "33", borderWidth: 1 }]}
      >
        <Text style={[styles.optionText, { color: COLORS.textDim }]}>
          No one (missed par or no qualifying player)
        </Text>
      </AnimatedPressable>
    </View>
  );
}

// ─── Main AuxiliaryPrompt component ──────────────────────────

export default function AuxiliaryPrompt({
  visible,
  holeNumber,
  holeInfo,
  players,
  activeGames,
  currentPlayerScores,
  wolfOrder,
  onComplete,
  onSkip,
}: AuxiliaryPromptProps) {
  const neededPrompts = getNeededPrompts(activeGames, holeInfo, currentPlayerScores);
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<AuxPromptResult>({});

  if (!visible || neededPrompts.length === 0) return null;

  const currentPrompt = neededPrompts[currentStep];
  const isLast = currentStep === neededPrompts.length - 1;

  const advance = (partialResult: Partial<AuxPromptResult>) => {
    const updated = { ...results, ...partialResult };
    setResults(updated);

    if (isLast) {
      setCurrentStep(0);
      setResults({});
      onComplete(updated);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  // Determine wolf for this hole from rotation
  const wolfPlayerId = wolfOrder
    ? wolfOrder[(holeNumber - 1) % wolfOrder.length]
    : players[0]?.id || "";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: COLORS.surfaceLow,
            borderTopLeftRadius: RADII.xl,
            borderTopRightRadius: RADII.xl,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 40,
            maxHeight: "70%",
          }}
        >
          {/* Header with step indicator and skip */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: "row", gap: 6 }}>
              {neededPrompts.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === currentStep ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: i === currentStep ? COLORS.primary : COLORS.surfaceHigh,
                  }}
                />
              ))}
            </View>
            <AnimatedPressable
              onPress={() => {
                setCurrentStep(0);
                setResults({});
                onSkip();
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: RADII.md,
                backgroundColor: COLORS.surfaceHigh,
              }}
            >
              <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textDim }}>
                Skip All
              </Text>
            </AnimatedPressable>
          </View>

          {/* Render current prompt */}
          {currentPrompt === "wolf" && (
            <WolfPrompt
              holeNumber={holeNumber}
              players={players}
              wolfPlayerId={wolfPlayerId}
              onSelect={(partnerId, isLoneWolf) =>
                advance({ wolf: { partnerId, isLoneWolf } })
              }
            />
          )}

          {currentPrompt === "hammer" && (
            <HammerPrompt
              holeNumber={holeNumber}
              players={players}
              onSelect={(hammered, hammerBy, accepted) =>
                advance({ hammer: { hammered, hammerBy, accepted } })
              }
            />
          )}

          {currentPrompt === "snake" && (
            <SnakePrompt
              holeNumber={holeNumber}
              players={players}
              currentPlayerScores={currentPlayerScores}
              holeInfo={holeInfo}
              onSelect={(ids) => advance({ snake: ids })}
            />
          )}

          {currentPrompt === "greenies" && (
            <GreeniePrompt
              holeNumber={holeNumber}
              players={players}
              onSelect={(winnerId) => advance({ greenies: winnerId })}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Helper: Check if any Tier 2 prompts are needed ───────────

export function needsAuxiliaryPrompt(
  activeGames: GameType[],
  holeInfo: HoleInfo,
  currentPlayerScores: Map<string, number>
): boolean {
  return getNeededPrompts(activeGames, holeInfo, currentPlayerScores).length > 0;
}

// ─── Styles ───────────────────────────────────────────────────

const styles = {
  promptTitle: {
    fontFamily: FONTS.headline,
    fontSize: 22,
    color: COLORS.text,
    marginBottom: 4,
  } as const,
  promptSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.textDim,
    marginBottom: 16,
    lineHeight: 20,
  } as const,
  optionButton: {
    backgroundColor: COLORS.surfaceMid,
    borderRadius: RADII.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  optionText: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.text,
  } as const,
  choiceButton: {
    flex: 1,
    borderRadius: RADII.lg,
    paddingVertical: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  choiceText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
  } as const,
  confirmButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.lg,
    paddingVertical: 14,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  confirmText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.onPrimary,
  } as const,
};
