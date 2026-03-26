# SnapScore Golf — Asset & Animation Polish Guide

Where to get assets, what to install, and where each one goes in the app.

---

## 1. LOTTIE ANIMATIONS (highest impact for lowest effort)

**Install:** `npx expo install lottie-react-native`

You already have Reanimated — Lottie wraps it for pre-built animations. Download the `.json` file, drop it in `assets/animations/`, and play it with `<LottieView>`.

### Where to get them

| Animation | Source | URL | Use In App |
|-----------|--------|-----|------------|
| Success checkmark (green) | LottieFiles (free) | https://lottiefiles.com/free-animations/check-mark | Score confirmed, round finalized |
| Confetti burst | LottieFiles (free) | https://lottiefiles.com/free-animations/confetti | Eagle, hole-in-one, settlement win |
| Golf flag waving | LottieFiles (free) | https://lottiefiles.com/free-animations/golf | Empty state on Contests tab |
| Golf ball rolling | LottieFiles (free) | https://lottiefiles.com/free-animations/golf-ball | Loading spinner replacement |
| Trophy / celebration | LottieFiles (free) | https://lottiefiles.com/free-animations/trophy | Settlement screen — big winner |
| Scanning / camera pulse | LottieFiles (free) | https://lottiefiles.com/free-animations/scan | OCR scanning in-progress |
| Coin / money flip | LottieFiles (free) | https://lottiefiles.com/free-animations/coin | Settlement reveal per game |
| Number counter | LottieFiles (free) | https://lottiefiles.com/free-animations/counter | Animated score total |
| Golf flag icons (278) | IconScout (free tier) | https://iconscout.com/lottie-animations/golf-flag | Game mode picker, hole markers |

**Usage pattern:**
```tsx
import LottieView from "lottie-react-native";

<LottieView
  source={require("../assets/animations/confetti.json")}
  autoPlay
  loop={false}
  style={{ width: 200, height: 200 }}
/>
```

---

## 2. CONFETTI & CELEBRATION EFFECTS

**Best option:** `react-native-fast-confetti` (Skia-powered, 60fps)

**Install:**
```bash
npx expo install @shopify/react-native-skia
npm install react-native-fast-confetti
```

**Use for:** Eagle/albatross/hole-in-one on scorecard, big settlement win reveal, round finalized celebration.

```tsx
import { Confetti } from "react-native-fast-confetti";

{showConfetti && (
  <Confetti
    isInfinite={false}
    colors={["#5bf393", "#4ade80", "#22c55e", "#ffffff", "#a7f3d0"]}
  />
)}
```

**Alternative (lighter, no Skia dependency):**
`react-native-confetti-cannon` — simpler, JS-driven confetti. Less performant but zero native deps.

```bash
npm install react-native-confetti-cannon
```

---

## 3. MICRO-INTERACTION LIBRARY (Moti)

**Install:** `npm install moti`

Moti wraps Reanimated with a simpler API for mount/unmount animations, loops, sequences. You already have Reanimated 4.x installed so it works immediately.

**Where to use:**

| Pattern | Code | Screen |
|---------|------|--------|
| Card entrance | `<MotiView from={{ opacity: 0, translateY: 20 }} animate={{ opacity: 1, translateY: 0 }}>` | Player cards on scorecard |
| Settlement reveal | `<MotiView delay={index * 150}>` staggered | Settlement transaction list |
| Pulse glow on active player | `<MotiView animate={{ scale: [1, 1.02, 1] }} transition={{ loop: true }}>` | Selected player indicator |
| Tab content swap | `<AnimatePresence>` with exit animations | Statistics tabs |
| Score number pop | `<MotiText from={{ scale: 0.5 }} animate={{ scale: 1 }}>` | Score entry feedback |

**Site:** https://moti.fyi/

---

## 4. SOUND EFFECTS (subtle UI audio)

### Sources (all free, royalty-free, no attribution required)

| Source | URL | Best For |
|--------|-----|----------|
| **Mixkit** | https://mixkit.co/free-sound-effects/interface/ | Clean, modern UI taps and confirms |
| **Mixkit Notifications** | https://mixkit.co/free-sound-effects/notification/ | Score confirmed, round finalized |
| **Dev_Tones** | https://rcptones.com/dev_tones/ | Professional app UI sound pack |
| **Uppbeat SFX** | https://uppbeat.io/sfx/category/digital-and-ui/ui | Whooshes, pops, positive chimes |
| **Freesound** | https://freesound.org | Raw sounds for custom design |

### Specific sounds to grab

| Sound | Source | Use In App |
|-------|--------|------------|
| Soft tap / click | Mixkit "Interface" | Numpad press |
| Positive chime | Mixkit "Notification" | Score confirmed |
| Cash register / coin | Mixkit "Alerts" | Settlement reveal |
| Whoosh (short) | Uppbeat | Hole transition |
| Success fanfare (2s) | Mixkit "Success" | Round finalized |
| Subtle error | Dev_Tones | Invalid input |

### Implementation with expo-av

```bash
npx expo install expo-av
```

```tsx
import { Audio } from "expo-av";

const playSound = async (file: any) => {
  const { sound } = await Audio.Sound.createAsync(file);
  await sound.playAsync();
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
  });
};

// Usage
playSound(require("../assets/sounds/confirm.wav"));
```

**Tip:** Keep sounds under 100KB each, WAV format, under 2 seconds. Gate them behind the settings toggle (hapticFeedback in settings-store could become audioFeedback).

---

## 5. ADVANCED GRAPHICS (React Native Skia)

**Install:** `npx expo install @shopify/react-native-skia`

Skia gives you a GPU-accelerated 2D canvas. Overkill for most screens, but transforms a few key moments:

| Effect | Where | Complexity |
|--------|-------|------------|
| Gradient mesh background | Paywall screen | Medium |
| Animated score ring | Statistics hero circle (replace static View) | Medium |
| Glow/blur behind settlement totals | Settlement screen | Low |
| Animated progress arc | Round progress bar | Medium |
| Particle effects | Hole-in-one celebration | High |

```tsx
import { Canvas, Circle, RadialGradient, vec } from "@shopify/react-native-skia";

<Canvas style={{ width: 200, height: 200 }}>
  <Circle cx={100} cy={100} r={90}>
    <RadialGradient
      c={vec(100, 100)}
      r={90}
      colors={["#5bf393", "#0c1322"]}
    />
  </Circle>
</Canvas>
```

---

## 6. ICON ASSETS

You already have `lucide-react-native` which covers general UI icons. For golf-specific icons:

| Source | URL | Format | Cost |
|--------|-----|--------|------|
| **Flaticon Golf Pack** | https://www.flaticon.com/search?word=golf | SVG/PNG | Free (with attribution) or $9/mo |
| **IconScout Golf** | https://iconscout.com/icons/golf | SVG | Free tier available |
| **The Noun Project** | https://thenounproject.com/search/?q=golf | SVG | Free (with attribution) or $40/yr |
| **Phosphor Icons** | https://phosphoricons.com | SVG/RN | Free, MIT license |

**For the game mode picker specifically:** Consider custom SVG icons for each game mode (skins, nassau, wolf, etc.). These could be simple geometric icons rendered via `react-native-svg` which you already have installed.

---

## 7. HAPTIC PATTERNS

You already have `expo-haptics`. Upgrade the patterns:

```tsx
// Current: single tap for everything
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// Better: differentiated by action
const HapticPatterns = {
  numpadTap:   () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  confirm:     () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  holeChange:  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  finalize:    () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error:       () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  warning:     () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  eagle:       async () => {
    // Double-pulse for exceptional scores
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await new Promise(r => setTimeout(r, 100));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },
};
```

---

## Priority order (what to add first)

1. **Lottie** — install + 3 animations (confetti, checkmark, scanning). Biggest visual upgrade per hour spent.
2. **Moti** — staggered settlement reveals and card entrances. Makes the app feel alive.
3. **Haptic patterns** — zero install, 30 minutes of code. Differentiated feedback per action.
4. **Confetti** — react-native-fast-confetti for eagles and settlement wins.
5. **Sound effects** — grab 5 sounds from Mixkit, wire through expo-av. Gate behind settings.
6. **Skia effects** — animated score ring on stats, gradient mesh on paywall. Save for v1.1.
7. **Golf icons** — custom SVGs for game mode picker. Polish item.
