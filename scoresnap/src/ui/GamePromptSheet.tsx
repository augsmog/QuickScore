import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
} from "react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, TYPOGRAPHY, RADII, GLOW } from "./theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupportedGameType =
  | "wolf"
  | "hammer"
  | "snake"
  | "greenies"
  | "bingo_bango_bongo";

interface PlayerInfo {
  id: string;
  name: string;
  score: number;
}

export interface GamePromptSheetProps {
  visible: boolean;
  onClose: () => void;
  gameType: SupportedGameType;
  hole: number;
  par: number;
  players: PlayerInfo[];
  onSubmit: (data: any) => void;
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function GrabHandle() {
  return (
    <View
      style={{
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.surfaceHighest,
        alignSelf: "center",
        marginBottom: 16,
      }}
    />
  );
}

function PlayerButton({
  player,
  selected,
  disabled,
  badge,
  onPress,
}: {
  player: PlayerInfo;
  selected: boolean;
  disabled?: boolean;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: selected
          ? COLORS.primary + "1A"
          : COLORS.surfaceHigh,
        borderRadius: RADII.md,
        borderWidth: selected ? 1.5 : 0,
        borderColor: selected ? COLORS.primary : "transparent",
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: FONTS.semibold,
          fontSize: 15,
          color: disabled ? COLORS.textDim : COLORS.text,
        }}
      >
        {player.name}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {badge && (
          <Text
            style={{
              fontFamily: FONTS.bold,
              fontSize: 11,
              color: COLORS.error,
            }}
          >
            {badge}
          </Text>
        )}
        <Text
          style={{
            fontFamily: FONTS.headline,
            fontSize: 16,
            color: disabled ? COLORS.textDim : COLORS.text,
          }}
        >
          {player.score}
        </Text>
      </View>
    </Pressable>
  );
}

function ConfirmButton({
  disabled,
  onPress,
}: {
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onPress();
        }
      }}
      style={{
        backgroundColor: disabled ? COLORS.surfaceHighest : COLORS.primary,
        borderRadius: RADII.lg,
        paddingVertical: 14,
        alignItems: "center",
        marginTop: 8,
        ...(disabled ? {} : GLOW.primary),
      }}
    >
      <Text
        style={{
          fontFamily: FONTS.bold,
          fontSize: 15,
          color: disabled ? COLORS.textDim : COLORS.onPrimary,
        }}
      >
        Confirm
      </Text>
    </Pressable>
  );
}

function SkipLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{ alignItems: "center", paddingVertical: 12, marginTop: 4 }}
    >
      <Text
        style={{
          fontFamily: FONTS.regular,
          fontSize: 13,
          color: COLORS.textDim,
        }}
      >
        Skip — Decide Later
      </Text>
    </Pressable>
  );
}

function SheetTitle({ emoji, label, hole }: { emoji: string; label: string; hole: number }) {
  return (
    <Text
      style={{
        ...TYPOGRAPHY.headline,
        color: COLORS.text,
        marginBottom: 16,
      }}
    >
      {emoji} {label} {"\u00B7"} Hole {hole}
    </Text>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        ...TYPOGRAPHY.label,
        color: COLORS.textDim,
        marginBottom: 10,
      }}
    >
      {text}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Wolf variant
// ---------------------------------------------------------------------------

function WolfPrompt({
  hole,
  players,
  onSubmit,
  onSkip,
}: {
  hole: number;
  players: PlayerInfo[];
  onSubmit: (data: any) => void;
  onSkip: () => void;
}) {
  const wolfIndex = (hole - 1) % players.length;
  const wolf = players[wolfIndex];
  const others = players.filter((_, i) => i !== wolfIndex);

  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [isLoneWolf, setIsLoneWolf] = useState(false);

  const handleSelect = (id: string) => {
    setIsLoneWolf(false);
    setSelectedPartnerId(id === selectedPartnerId ? null : id);
  };

  const handleLone = () => {
    setSelectedPartnerId(null);
    setIsLoneWolf(!isLoneWolf);
  };

  const canConfirm = selectedPartnerId !== null || isLoneWolf;

  return (
    <>
      <SheetTitle emoji="\uD83D\uDC3A" label="WOLF" hole={hole} />

      <View
        style={{
          backgroundColor: COLORS.surfaceHigh,
          borderRadius: RADII.md,
          padding: 12,
          marginBottom: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text style={{ fontFamily: FONTS.bold, fontSize: 13, color: COLORS.primary }}>
          Wolf:
        </Text>
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text }}>
          {wolf?.name}
        </Text>
      </View>

      <SectionLabel text="PICK A PARTNER" />
      {others.map((p) => (
        <PlayerButton
          key={p.id}
          player={p}
          selected={selectedPartnerId === p.id}
          onPress={() => handleSelect(p.id)}
        />
      ))}

      {/* Lone Wolf option */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          handleLone();
        }}
        style={{
          backgroundColor: isLoneWolf ? COLORS.warn + "22" : COLORS.surfaceHigh,
          borderRadius: RADII.md,
          borderWidth: isLoneWolf ? 1.5 : 0,
          borderColor: isLoneWolf ? COLORS.warn : "transparent",
          paddingVertical: 12,
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <Text
          style={{
            fontFamily: FONTS.bold,
            fontSize: 14,
            color: isLoneWolf ? COLORS.warn : COLORS.textDim,
          }}
        >
          LONE WOLF
        </Text>
      </Pressable>

      <ConfirmButton
        disabled={!canConfirm}
        onPress={() =>
          onSubmit({ partnerId: selectedPartnerId, isLoneWolf })
        }
      />
      <SkipLink onPress={onSkip} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Hammer variant
// ---------------------------------------------------------------------------

function HammerPrompt({
  hole,
  players,
  onSubmit,
  onSkip,
}: {
  hole: number;
  players: PlayerInfo[];
  onSubmit: (data: any) => void;
  onSkip: () => void;
}) {
  const [hammerBy, setHammerBy] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<boolean | null>(null);

  const handleNoHammer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit({ hammered: false, hammerBy: "", accepted: false });
  };

  const canConfirm = hammerBy !== null && accepted !== null;

  return (
    <>
      <SheetTitle emoji="\uD83D\uDD28" label="HAMMER" hole={hole} />

      <SectionLabel text="WAS A HAMMER DROPPED?" />

      <Pressable
        onPress={handleNoHammer}
        style={{
          backgroundColor: COLORS.surfaceHigh,
          borderRadius: RADII.md,
          paddingVertical: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textDim }}>
          No Hammer
        </Text>
      </Pressable>

      {players.map((p) => (
        <PlayerButton
          key={p.id}
          player={p}
          selected={hammerBy === p.id}
          onPress={() => {
            setHammerBy(p.id === hammerBy ? null : p.id);
            setAccepted(null);
          }}
        />
      ))}

      {hammerBy !== null && (
        <>
          <SectionLabel text="DID THEY ACCEPT?" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAccepted(true);
              }}
              style={{
                flex: 1,
                backgroundColor: accepted === true ? COLORS.primary + "1A" : COLORS.surfaceHigh,
                borderRadius: RADII.md,
                borderWidth: accepted === true ? 1.5 : 0,
                borderColor: accepted === true ? COLORS.primary : "transparent",
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: FONTS.bold,
                  fontSize: 14,
                  color: accepted === true ? COLORS.primary : COLORS.text,
                }}
              >
                Accepted
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAccepted(false);
              }}
              style={{
                flex: 1,
                backgroundColor: accepted === false ? COLORS.error + "1A" : COLORS.surfaceHigh,
                borderRadius: RADII.md,
                borderWidth: accepted === false ? 1.5 : 0,
                borderColor: accepted === false ? COLORS.error : "transparent",
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: FONTS.bold,
                  fontSize: 14,
                  color: accepted === false ? COLORS.error : COLORS.text,
                }}
              >
                Conceded
              </Text>
            </Pressable>
          </View>
        </>
      )}

      <ConfirmButton
        disabled={!canConfirm}
        onPress={() =>
          onSubmit({ hammered: true, hammerBy, accepted })
        }
      />
      <SkipLink onPress={onSkip} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Snake variant
// ---------------------------------------------------------------------------

function SnakePrompt({
  hole,
  par,
  players,
  onSubmit,
  onSkip,
}: {
  hole: number;
  par: number;
  players: PlayerInfo[];
  onSubmit: (data: any) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNoOne = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit([]);
  };

  return (
    <>
      <SheetTitle emoji="\uD83D\uDC0D" label="SNAKE" hole={hole} />

      <SectionLabel text="DID ANYONE 3-PUTT?" />

      <Pressable
        onPress={handleNoOne}
        style={{
          backgroundColor: COLORS.surfaceHigh,
          borderRadius: RADII.md,
          paddingVertical: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textDim }}>
          No one
        </Text>
      </Pressable>

      {players.map((p) => {
        const scoredParOrBetter = p.score <= par;
        return (
          <PlayerButton
            key={p.id}
            player={p}
            selected={selected.has(p.id)}
            disabled={scoredParOrBetter}
            onPress={() => toggle(p.id)}
          />
        );
      })}

      <ConfirmButton
        disabled={selected.size === 0}
        onPress={() => onSubmit(Array.from(selected))}
      />
      <SkipLink onPress={onSkip} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Greenies variant
// ---------------------------------------------------------------------------

function GreeniesPrompt({
  hole,
  par,
  players,
  onSubmit,
  onSkip,
}: {
  hole: number;
  par: number;
  players: PlayerInfo[];
  onSubmit: (data: any) => void;
  onSkip: () => void;
}) {
  const [winnerId, setWinnerId] = useState<string | null>(null);

  const handleNoGreenie = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit(null);
  };

  return (
    <>
      <Text
        style={{
          ...TYPOGRAPHY.headline,
          color: COLORS.text,
          marginBottom: 16,
        }}
      >
        {"\uD83D\uDFE2"} GREENIE {"\u00B7"} Hole {hole} (Par 3)
      </Text>

      <SectionLabel text="WHO WAS CLOSEST TO THE PIN?" />

      {players.map((p) => {
        const madePar = p.score <= par;
        return (
          <PlayerButton
            key={p.id}
            player={p}
            selected={winnerId === p.id}
            disabled={!madePar}
            badge={!madePar ? "\u2717" : undefined}
            onPress={() => setWinnerId(p.id === winnerId ? null : p.id)}
          />
        );
      })}

      <Pressable
        onPress={handleNoGreenie}
        style={{
          backgroundColor: COLORS.surfaceHigh,
          borderRadius: RADII.md,
          paddingVertical: 12,
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textDim }}>
          No one / No greenie
        </Text>
      </Pressable>

      <ConfirmButton
        disabled={winnerId === null}
        onPress={() => onSubmit(winnerId)}
      />
      <SkipLink onPress={onSkip} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bingo Bango Bongo variant
// ---------------------------------------------------------------------------

function BBBPrompt({
  hole,
  players,
  onSubmit,
  onSkip,
}: {
  hole: number;
  players: PlayerInfo[];
  onSubmit: (data: any) => void;
  onSkip: () => void;
}) {
  const [bingo, setBingo] = useState<string | null>(null);
  const [bango, setBango] = useState<string | null>(null);
  const [bongo, setBongo] = useState<string | null>(null);

  const labels = [
    { key: "bingo", label: "BINGO \u2014 First on green", value: bingo, setter: setBingo },
    { key: "bango", label: "BANGO \u2014 Closest to pin", value: bango, setter: setBango },
    { key: "bongo", label: "BONGO \u2014 First to hole out", value: bongo, setter: setBongo },
  ] as const;

  const canConfirm = bingo !== null && bango !== null && bongo !== null;

  return (
    <>
      <SheetTitle emoji="\uD83C\uDFAF" label="BBB" hole={hole} />

      {labels.map(({ key, label, value, setter }) => (
        <View key={key} style={{ marginBottom: 14 }}>
          <SectionLabel text={label} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {players.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setter(p.id === value ? null : p.id);
                }}
                style={{
                  flex: 1,
                  minWidth: "45%",
                  backgroundColor: value === p.id ? COLORS.primary + "1A" : COLORS.surfaceHigh,
                  borderRadius: RADII.md,
                  borderWidth: value === p.id ? 1.5 : 0,
                  borderColor: value === p.id ? COLORS.primary : "transparent",
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.semibold,
                    fontSize: 13,
                    color: value === p.id ? COLORS.primary : COLORS.text,
                  }}
                >
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <ConfirmButton
        disabled={!canConfirm}
        onPress={() => onSubmit({ bingo, bango, bongo })}
      />
      <SkipLink onPress={onSkip} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main sheet component
// ---------------------------------------------------------------------------

export function GamePromptSheet({
  visible,
  onClose,
  gameType,
  hole,
  par,
  players,
  onSubmit,
}: GamePromptSheetProps) {
  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const renderContent = () => {
    switch (gameType) {
      case "wolf":
        return (
          <WolfPrompt
            hole={hole}
            players={players}
            onSubmit={(d) => { onSubmit(d); onClose(); }}
            onSkip={handleSkip}
          />
        );
      case "hammer":
        return (
          <HammerPrompt
            hole={hole}
            players={players}
            onSubmit={(d) => { onSubmit(d); onClose(); }}
            onSkip={handleSkip}
          />
        );
      case "snake":
        return (
          <SnakePrompt
            hole={hole}
            par={par}
            players={players}
            onSubmit={(d) => { onSubmit(d); onClose(); }}
            onSkip={handleSkip}
          />
        );
      case "greenies":
        return (
          <GreeniesPrompt
            hole={hole}
            par={par}
            players={players}
            onSubmit={(d) => { onSubmit(d); onClose(); }}
            onSkip={handleSkip}
          />
        );
      case "bingo_bango_bongo":
        return (
          <BBBPrompt
            hole={hole}
            players={players}
            onSubmit={(d) => { onSubmit(d); onClose(); }}
            onSkip={handleSkip}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Backdrop */}
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
          onPress={onClose}
        />
        {/* Sheet */}
        <View
          style={{
            backgroundColor: COLORS.surfaceMid,
            borderTopLeftRadius: RADII.xl,
            borderTopRightRadius: RADII.xl,
            paddingHorizontal: 24,
            paddingTop: 14,
            paddingBottom: 40,
            maxHeight: Dimensions.get("window").height * 0.85,
          }}
        >
          <GrabHandle />
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {renderContent()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default GamePromptSheet;
