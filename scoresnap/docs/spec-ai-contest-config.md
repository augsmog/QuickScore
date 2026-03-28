# PRD: AI Contest Configuration ("QuickSetup")

## Overview

A natural-language interface that lets players describe what they want to play and produces a fully configured contest — course, players, pairings, teams, games, wagers, and all game-specific settings. Think of it as a Golf Genius setup experience powered by conversational AI.

The key differentiator: it isn't limited to games QuickScore already has calculators for. The AI can understand and configure ANY golf game format, storing custom rules and scoring logic alongside built-in engine games.

---

## Problem Statement

Setting up a multi-game contest today requires navigating a 3-step form (Players & Course → Game Modes → Wager Settings) and understanding the nuances of 30+ game types and their variations. This is intimidating for casual players and tedious for experienced ones who "just want to play a $5 nassau with presses, skins, and a greenies side pot."

---

## User Stories

1. **Casual player**: "Set up a round for 4 guys at Pebble Beach, blue tees, $2 nassau and skins"
2. **Tournament organizer**: "12 players, 3 foursomes, scramble format, $50 per team entry, closest to pin on par 3s"
3. **Experienced bettor**: "Me and Dave vs Mike and John, best ball match play, $10 nassau with auto-press at 2 down, press the press, skins with carryover on the side, snake for $1"
4. **Custom game**: "We play a game called Hammer Time — it's like Hammer but the value triples instead of doubles and you can re-hammer on the same hole"
5. **Quick repeat**: "Same game as last Saturday but at a different course"

---

## Core Capabilities

### 1. Natural Language Parsing

The AI extracts structured contest parameters from free-form text:

**Player information**
- Names and count
- Handicaps (if mentioned)
- Team assignments
- Pairing preferences

**Course information**
- Course name (triggers CourseSearch API)
- Tee box preference
- Number of holes (9 or 18)

**Game configuration**
- Game type(s) — matched against the 30 built-in types first
- Wager amounts per game
- Game-specific variations and settings (all GameConfig fields)
- Custom/unknown games — captured as structured rules

**Competition structure**
- Individual vs team
- Pairing-level vs contest-level games
- Points systems vs money games

### 2. Clarifying Questions

When the prompt is ambiguous, the AI asks targeted follow-ups. It should NEVER guess on things that affect money. Examples:

| Ambiguity | Question |
|-----------|----------|
| "nassau" but no amount | "What's the nassau unit — $2, $5, $10?" |
| "skins" but unclear on carryover | "Carryover skins (uncollected skins roll to next hole) or clean skins (each hole standalone)?" |
| 4 players, no teams mentioned | "Individual games only, or do you want 2v2 team games too?" |
| "press" but unclear rules | "Auto-press when 2 down, or manual press only?" |
| Unknown game name | "I'm not familiar with 'Hammer Time' — can you describe how scoring works? I'll set it up as a custom game." |
| No course specified | "Which course are you playing?" (show course search) |
| No tees specified | "Which tees?" (show tee options after course selected) |

### 3. Custom Game Support

For games not in the built-in engine, the AI captures:

```typescript
interface CustomGame {
  name: string;
  description: string;           // plain-english rules
  scoringType: "per_hole" | "per_round" | "points" | "money";
  requiresAuxInput: boolean;     // needs extra per-hole data beyond score
  auxInputDescription?: string;  // what to collect (e.g., "who got hammered")
  teamGame: boolean;
  minPlayers: number;
  maxPlayers: number;
  wagerUnit?: number;
  baseGame?: GameType;           // if it's a variation of a known game
  customRules: string[];         // structured rule list for scoring
}
```

Custom games are stored with the contest and scored manually (player-entered results) or via AI-assisted scoring if the rules are deterministic enough.

### 4. Preview & Edit

Before creating the contest, the AI presents a structured preview:

```
━━━ Saturday Round ━━━
📍 Cumberland Lake Golf Club — Blue Tees (6,599 yds)
👥 4 Players: Augie (12), Mike (8), Dave (15), John (10)

Games:
  1. Nassau — $5 unit, auto-press at 2 down, press the press
     → Front 9 / Back 9 / Overall match
  2. Skins (carryover) — $2/hole
     → Individual, net handicap
  3. Greenies — $1/par 3
     → Closest to pin on par 3s

Estimated max exposure: $45/player

[Create Contest]  [Edit]  [Start Over]
```

The user can tap "Edit" to modify any section, or just verbally say "make skins $5 instead" and the AI adjusts.

### 5. Repeat & Template

After a contest is played, the configuration is saved as a template. Users can:
- "Same as last time" — loads last contest config, prompts for course/date only
- "Same as Saturday but add wolf" — modifies from template
- Save named templates: "Saturday regulars", "Company outing format"

---

## Information the AI Must Collect

The AI cannot create a contest without ALL of the following resolved:

### Required (must ask if not provided)
- [ ] Player names and count
- [ ] Course (name or search)
- [ ] At least one game type
- [ ] Wager amount(s) for money games (or explicit "no money")

### Required with smart defaults
- [ ] Tee box (default: first available, but should ask for multi-player groups)
- [ ] Number of holes (default: 18)
- [ ] Net vs gross scoring (default: gross unless handicaps provided)
- [ ] Pairings (default: all in one group if ≤4 players)

### Optional (ask only if relevant)
- [ ] Team assignments (only if team game selected)
- [ ] Game-specific variations (only for games that have them)
- [ ] Handicaps (only if net scoring or handicap-adjusted games)
- [ ] Pairing-level vs contest-level game scope

### Game-Specific Details (ask when that game is selected)

**Nassau**: unit amount, press rules (auto/manual, trigger), press the press, junk/dots alongside, aloha press on 18
**Skins**: carryover vs clean, birdie multiplier, validation rule, team skins
**Wolf**: blind wolf, pig variation, carryover
**Stableford**: standard vs modified (Barracuda), joker holes
**Vegas**: birdie flip, eagle doubles, birdie-blocks-birdie
**Snake**: progressive (doubles) vs flat
**Best Ball**: net/gross, handicap percentage (e.g., 80% of difference)
**Scramble/Shamble**: handicap formula, tee shot requirements (e.g., "must use 3 of each player's drives")
**Match Play**: bisque handicap, concession rules
**Dots/Junk**: which "trash" bets to include (greenies, sandies, barkies, etc.)

---

## Architecture

### AI Layer

```
User prompt
    ↓
AI (Claude API) — system prompt includes:
  - All 30 game types with descriptions and config options
  - Custom game schema
  - Contest creation schema
  - Clarification question templates
  - Course search tool (function calling)
    ↓
Structured ContestConfig JSON
    ↓
Preview UI → User confirms/edits
    ↓
contestStore.createContest(config)
```

### System Prompt Design

The AI system prompt should include:
1. Complete game type registry with all variations
2. The GameConfig interface with field descriptions
3. Examples of natural language → structured config mappings
4. Rules for when to ask vs when to default
5. Custom game capture schema
6. Course search as a tool/function call

### API Integration

Uses Claude API (already have `EXPO_PUBLIC_ANTHROPIC_API_KEY` in env) with:
- **Streaming** for responsive feel during multi-turn setup
- **Tool use** for course search, player lookup (future), template recall
- **Structured output** for the final contest config JSON

### Data Model Extension

```typescript
interface ContestTemplate {
  id: string;
  name: string;
  createdAt: string;
  config: {
    games: Array<{
      type: GameType | "custom";
      name: string;
      wagerUnit: number;
      gameConfig: GameConfig;
      customGame?: CustomGame;
      scope: "contest" | "pairing";
    }>;
    teamStructure?: {
      count: number;
      names: string[];
    };
    playerCount: number;
    playerNames: string[];
    handicaps: Record<string, number>;
    holes: 9 | 18;
    teePreference?: string;
  };
}
```

---

## UX Flow

### Entry Points

1. **New Contest screen** — "Set up with AI" button alongside manual setup
2. **Home screen** — "Quick start" card with text input
3. **Voice input** — microphone icon for spoken descriptions (future)

### Conversation UI

A chat-like interface within the contest creation flow:

```
┌──────────────────────────────────┐
│ AI Setup                      X  │
│──────────────────────────────────│
│                                  │
│  🤖 What are you playing today? │
│                                  │
│  You: 4 of us playing nassau    │
│  and skins at Cumberland Lake   │
│                                  │
│  🤖 Got it! A few questions:    │
│  • What's the nassau unit?      │
│  • Carryover skins or clean?    │
│  • Which tees?                  │
│                                  │
│  [$2] [$5] [$10] [Custom]       │  ← Quick-tap chips
│                                  │
│ ┌──────────────────────────┐    │
│ │ Type or tap to answer... │ 🎤 │
│ └──────────────────────────┘    │
└──────────────────────────────────┘
```

Quick-tap chips appear for common answers (dollar amounts, yes/no, game variations) so users don't have to type everything.

### Preview Screen

After all required info is collected, show the structured preview with:
- Course and tee info (from API)
- Player list with handicaps
- Each game with its configuration spelled out in plain English
- Estimated financial exposure per player
- "Create Contest" primary CTA
- "Edit" and "Start Over" secondary actions

---

## Phases

### Phase 1: Core AI Setup (MVP)
- Natural language → built-in game configuration
- Clarifying questions for ambiguous inputs
- Course search integration
- Preview and confirm flow
- Template save/recall ("same as last time")

### Phase 2: Custom Games
- Custom game schema capture
- AI-assisted scoring for custom games
- Community game library (shared custom games)

### Phase 3: Smart Suggestions
- "Based on your group size and skill levels, you might enjoy..."
- Post-round analysis: "Your group played skins 12 times — you might like Wolf for more strategy"
- Exposure warnings: "Heads up — with press-the-press enabled, max exposure could reach $200"

### Phase 4: Voice & Social
- Voice input for hands-free setup on the course
- "Set up the same game [friend] played last week"
- Tournament templates shared via link

---

## Success Metrics

- **Setup time**: Contest creation in < 60 seconds (vs 2-3 minutes manual)
- **Completion rate**: >80% of AI-started setups result in created contests
- **Accuracy**: <5% of users need to edit AI-generated config after preview
- **Adoption**: >50% of contests created via AI after 30 days of launch

---

## Open Questions

1. **Pricing**: Is AI setup a Pro feature, or free to drive adoption?
2. **Token costs**: Claude API calls per setup (estimate 2-4 turns × ~1K tokens). At scale, consider caching common patterns.
3. **Offline**: AI setup requires network. Keep manual flow as fallback.
4. **Player profiles**: Should AI remember player preferences across sessions? ("Augie always plays from blue tees, 12 handicap")
5. **Game validation**: For custom games, how much should the AI validate scoring rules vs. trust the user?
