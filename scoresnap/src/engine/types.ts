import { FREE_GAMES } from "../services/entitlements";
// ═══════════════════════════════════════════════════════════════════
// SCORING ENGINE TYPES
// ═══════════════════════════════════════════════════════════════════

export interface HoleInfo {
  num: number;
  par: number;
  hcp: number;  // hole handicap index (1 = hardest)
  yards: number;
}

export interface Course {
  name: string;
  holes: HoleInfo[];
}

export interface Player {
  id: string;
  name: string;
  handicap: number;
  courseHandicaps?: Record<string, number>; // Per-course handicaps, keyed by course name or ID
  status?: "active" | "WD" | "NS"; // WD = withdrew, NS = no-show
  team?: string | null; // team ID/name, null = no team
  scores: number[]; // 18 holes, 0 = not yet played
  putts?: number[]; // 18 holes, 0 = not entered (for Snake)
}

// Auxiliary data for games that need per-hole input beyond scores
export interface AuxiliaryData {
  jokerDeclarations?: { [hole:number]: Record<string, number[]> };
  bisque?: { [hole:number]: {beforePlay:true; strokes:Record<string,number>} };
  junk?: { [hole:number]: {sandies:string[];barkies:string[];greenie:string|null} };
  teamCards?: { [hole: number]: Record<string, number> };
  wolf?: { [hole: number]: { partnerId: string | null; isLoneWolf: boolean; blind?:boolean; refused?:boolean; beforePlay?:boolean } };
  hammer?: { [hole: number]: { hammered: boolean; hammerBy: string; accepted: boolean } };
  snake?: { [hole: number]: string[] }; // player IDs who 3-putted
  greenies?: { [hole: number]: string | null }; // player ID of greenie winner
  bbb?: { [hole: number]: { bingo: string | null; bango: string | null; bongo: string | null } };
}

export interface GamePlayer {
  id: string;
  name: string;
  handicap: number;
  team?: string | null;
}

// All supported game types
export type GameType =
  | "stroke_play"
  | "match_play"
  | "stableford"
  | "mod_stableford"
  | "skins"
  | "skins_carry"
  | "nassau"
  | "nassau_press"
  | "wolf"
  | "banker"
  | "hammer"
  | "snake"
  | "bingo_bango_bongo"
  | "dots"
  | "rabbit"
  | "defender"
  | "nines"
  | "vegas"
  | "sixes"
  | "closeout"
  | "quota"
  | "chicago"
  | "greenies"
  | "aces_deuces"
  | "best_ball"
  | "scramble"
  | "shamble"
  | "alternate_shot"
  | "chapman"
  | "fourball";

export interface GameTypeInfo {
  id: GameType;
  name: string;
  desc: string;
  icon: string;
  category: string;
  isPremium: boolean;
  minPlayers: number;
  maxPlayers: number;
  rules: string; // short instructional text
}

// Game configuration options — variation support from research
export interface GameConfig {
  inputRulesVersion?: 1; // Explicit adoption of round-two event/declaration variants.
  rulesVersion?: 1; // Absent means legacy: stored variation toggles remain ignored.
  // Skins
  carryover?: boolean;
  skinsScope?: "field" | "group"; // per-contest; missing means whole field
  skinsMode?: "net" | "gross"; // per-contest; missing means net
  skinsTier?: "flat" | "tiered" | "progressive"; // flat=all equal, tiered=1/2/3 by six, progressive=hole#
  birdieMultiplier?: boolean; // birdie=2x skin, eagle=3x
  validationRule?: boolean; // must par next hole to keep carryover skin
  teamSkins?: boolean; // best ball per team

  // Nassau
  pressAt?: number; // auto-press when N down (0 = manual only)
  pressThePress?: boolean; // presses can themselves be pressed
  nassauWeights?: [number, number, number]; // [front, back, overall] e.g. [1,1,2] for 5-5-10
  alohaPressOn18?: boolean; // mandatory half-value press on hole 18
  noPressLast?: boolean; // no new press on holes 9 and 18
  junkNassau?: boolean; // dots/junk bets run alongside Nassau

  // Wolf
  blindWolf?: boolean; // declare solo before anyone tees off (3-4x)
  pigVariation?: boolean; // chosen partner can refuse, forcing Lone Wolf
  wolfCarryover?: boolean; // tied holes carry point value forward

  // Snake
  progressiveSnake?: boolean; // value doubles each time snake changes hands

  // Stableford
  jokerEnabled?: boolean;
  jokerHoles?: number[]; // pre-declared joker holes (points doubled)
  modifiedStableford?: boolean; // Barracuda scoring: par=0, birdie=+2, eagle=+5, bogey=-1, dbl=-3

  // Vegas
  birdieFlip?: boolean; // "Flip the Bird" — birdie flips opponent score
  eagleDoubles?: boolean; // eagle flips AND doubles
  birdieBlocksBirdie?: boolean; // both teams birdie = no flip

  // BBB
  bbbBirdieDouble?: boolean; // double points for birdie on any BBB point
  bbbChipInTriple?: boolean; // chip-in earns all three points

  // Sixes
  escalatingSegments?: boolean; // 1x/2x/4x segment values
  sixesPresses?: boolean; // press rules apply within each 6-hole segment

  // Rabbit
  doubleRabbit?: boolean; // third bet for full-18 holder

  // Match Play
  bisqueHandicap?: boolean; // handicap strokes used at player's discretion

  // General
  netHandicap?: boolean; // apply handicap strokes
  [key: string]: unknown;
}

// Calculator results

export interface StrokePlayResult {
  name: string;
  playerId: string;
  front: number;
  back: number;
  total: number;
  toPar: number;
}

export interface MatchPlayHole {
  hole: number;
  p1Score: number;
  p2Score: number;
  status: number; // positive = p1 up, negative = p2 up
}

export interface MatchPlayResult {
  p1: string;
  p2: string;
  results: MatchPlayHole[];
  finalStatus: number;
}

export interface StablefordResult {
  name: string;
  playerId: string;
  points: number;
  holePoints: number[];
}

export interface SkinResult {
  hole: number;
  winner: string; // player name, "Push", or "Carry"
  value: number;
}

export interface SkinsResult {
  skins: SkinResult[];
  totals: Record<string, number>;
  remaining: number;
}

export interface NassauResult {
  p1: string;
  p2: string;
  front: number;  // positive = p1 winning
  back: number;
  overall: number;
}

export interface NinesHoleResult {
  hole: number;
  allocation: Record<string, number>;
}

export interface NinesResult {
  points: Record<string, number>;
  holeResults: NinesHoleResult[];
}

export interface VegasHole {
  hole: number;
  t1: number; // 2-digit team number
  t2: number;
  diff: number;
}

export interface VegasResult {
  team1Won: number;
  team2Won: number;
  holes: VegasHole[];
}

// Settlement

export interface Transaction {
  from: string;
  to: string;
  amount: number;
  gameType: GameType;
}

export interface SettlementSummary {
  transactions: Transaction[];
  pending?: boolean;
  netByPlayer: Record<string, number>; // positive = winning
}

// Game registry

export const GAME_TYPES: { individual: GameTypeInfo[]; team: GameTypeInfo[] } = {
  individual: [
    { id: "stroke_play", name: "Stroke Play", desc: "Lowest total strokes wins", icon: "🏌️", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 40, rules: "Each player counts every stroke. The player with the fewest total strokes across 18 holes wins. Front 9, Back 9, and Overall totals are tracked." },
    { id: "match_play", name: "Match Play", desc: "Win individual holes head-to-head", icon: "⚔️", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 2, rules: "Two players compete hole by hole. Win a hole by having the lower score. The player who wins the most holes wins the match. Reported as '2 & 1' (2 up with 1 to play)." },
    { id: "stableford", name: "Stableford", desc: "Points per hole based on score vs par", icon: "⭐", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 40, rules: "Points awarded per hole: Eagle or better = 4, Birdie = 3, Par = 2, Bogey = 1, Double+ = 0. Highest total points wins. Great for handicap play." },
    { id: "mod_stableford", name: "Modified Stableford (SnapScore)", desc: "Rewards birdies/eagles, penalizes bogeys+", icon: "💫", category: "Classic", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Aggressive scoring: Eagle+ = +8, Birdie = +5, Par = +2, Bogey = -1, Double = -3, Triple+ = -5. Rewards attacking play and penalizes blowup holes." },
    { id: "skins", name: "Skins", desc: "Win the hole outright to take the skin", icon: "💰", category: "Money Games", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Each hole is worth 1 skin (bet unit). The player with the lowest score on a hole wins that skin outright. If two or more players tie for low score, the hole is a push." },
    { id: "skins_carry", name: "Skins (Carryover)", desc: "Tied skins carry to next hole", icon: "💰", category: "Money Games", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Same as Skins, but when a hole is tied, the skin carries over to the next hole. This creates big-value skins that build up over multiple tied holes." },
    { id: "nassau", name: "Nassau", desc: "3 bets: front 9, back 9, overall", icon: "🎰", category: "Money Games", isPremium: true, minPlayers: 2, maxPlayers: 4, rules: "Three separate match play bets: Front 9, Back 9, and Overall 18. Each bet is worth 1 unit. With 2 players, head-to-head. With 4 players, play as 2v2 teams using best ball per hole." },
    { id: "nassau_press", name: "Nassau w/ Presses", desc: "Nassau with auto-press when 2 down", icon: "🎰", category: "Money Games", isPremium: true, minPlayers: 2, maxPlayers: 4, rules: "Standard Nassau with automatic presses. When a side falls 2-down in any bet, a new side bet (press) starts on the next hole. Works 1v1 or 2v2 teams." },
    { id: "wolf", name: "Wolf", desc: "Choose partner or go lone wolf each hole", icon: "🐺", category: "Strategy", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "The Wolf rotates each hole. After seeing tee shots, the Wolf picks a partner or goes Lone Wolf. Wolf+partner vs the other 2. Ordinary solo pays 2 units per opponent; partnered Wolf pays 1 per opposing-player pair. Confirm actual partner choices." },
    { id: "banker", name: "Banker", desc: "Rotating banker takes all bets on hole", icon: "🏦", category: "Strategy", isPremium: true, minPlayers: 3, maxPlayers: 40, rules: "The Banker rotates each hole. If the Banker has the lowest score, they collect 1 unit from each player. If anyone beats the Banker, the Banker pays that player 1 unit." },
    { id: "hammer", name: "Hammer", desc: "Double the bet mid-hole for pressure", icon: "🔨", category: "Pressure", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Each hole starts at 1 unit. Either player can 'hammer' (double the bet) during the hole. Opponent must accept the doubled bet or concede the hole. Creates intense pressure moments." },
    { id: "snake", name: "Snake", desc: "Last to 3-putt holds the snake", icon: "🐍", category: "Putting", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "The last player to 3-putt 'holds the snake.' At the end of the round, the snake holder pays each other player 1 unit. Keeps everyone focused on putting." },
    { id: "bingo_bango_bongo", name: "Bingo Bango Bongo", desc: "Points for first on, closest, first in", icon: "🎯", category: "Points", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Three points per hole: Bingo (first on the green), Bango (closest to pin once all on green), Bongo (first to hole out). Each point = 1 unit." },
    { id: "dots", name: "Dots / Trash", desc: "Score points for birdies, pars and bogeys", icon: "🎲", category: "Points", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Earn dots (points) for achievements: Birdie or better = +2, Par = +1, Bogey = 0, Double+ = -1." },
    { id: "rabbit", name: "Rabbit", desc: "Catch the rabbit with low score, keep it", icon: "🐰", category: "Chase", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "The lowest scorer on a hole 'catches the rabbit.' Hold it until someone else posts a lower score. Whoever holds the rabbit at hole 9 and 18 wins the pot from all other players." },
    { id: "defender", name: "Defender", desc: "Rotating defender vs field best ball", icon: "🛡️", category: "Strategy", isPremium: true, minPlayers: 3, maxPlayers: 40, rules: "One player defends each hole (rotates). If the Defender beats the field's best score, they collect from everyone. If the field wins, the best scorer collects from the Defender." },
    { id: "nines", name: "Nines", desc: "9 points split among foursome each hole", icon: "9️⃣", category: "Points", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "9 points are distributed each hole: Best = 5, 2nd = 3, 3rd = 1, Worst = 0. Ties split points equally. After 18 holes, total points determine winners (max 162 total)." },
    { id: "vegas", name: "Vegas", desc: "Team scores combined as 2-digit number", icon: "🎲", category: "Team Money", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "Two teams of 2. Each team combines their scores into a 2-digit number (lower score first). E.g., scores of 4 and 5 = 45. The difference between team numbers is the points won/lost." },
    { id: "sixes", name: "Sixes", desc: "Partners rotate every 6 holes", icon: "🔄", category: "Rotating", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "With 4 players, partners rotate every 6 holes: A+B vs C+D (1-6), A+C vs B+D (7-12), A+D vs B+C (13-18). Best ball within each team. Everyone plays with and against everyone." },
    { id: "closeout", name: "Closeout", desc: "New match starts when one closes out", icon: "🔒", category: "Match", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Head-to-head match play. When one player clinches (leads by more holes than remain), that match is won and a new match begins on the next hole. Multiple matches = multiple bets." },
    { id: "quota", name: "Quota", desc: "Beat your point quota based on handicap", icon: "📊", category: "Handicap", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Your quota = 36 minus your handicap. Earn Stableford points each hole. If you exceed your quota, you win. The player who exceeds their quota by the most wins. Levels the playing field." },
    { id: "chicago", name: "Chicago", desc: "Stableford points minus quota target", icon: "🌆", category: "Handicap", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Similar to Quota. Earn Stableford points (Eagle=4, Birdie=3, Par=2, Bogey=1). Your target = 36 - handicap. Score = points earned - target. Highest net score wins." },
    { id: "greenies", name: "Greenies", desc: "Closest to pin on par 3s, must make par", icon: "🟢", category: "Par 3s", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "On par 3s, the player closest to the pin wins a greenie — but only if they make par or better. If you're closest but bogey, no greenie. Each greenie = 1 unit from each player." },
    { id: "aces_deuces", name: "Aces & Deuces", desc: "Bonus for aces, penalty for double+", icon: "🃏", category: "Bonus", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Aces (birdie or better): collect 1 unit from each other player. Deuces (double bogey or worse): pay 1 unit to each other player. Rewards great holes and punishes blowups." },
  ],
  team: [
    { id: "best_ball", name: "Best Ball", desc: "Best score on team counts each hole", icon: "🏆", category: "Team", isPremium: false, minPlayers: 4, maxPlayers: 40, rules: "Teams of 2+. Each hole, the team's best individual score counts. The team with the lower best-ball total wins. Also called Four-Ball in stroke play format." },
    { id: "scramble", name: "Scramble", desc: "All play from best shot each time", icon: "🤝", category: "Team", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "All team members hit, then everyone plays their next shot from the spot of the best shot. Repeat until holed out. Produces very low scores. Most popular team format." },
    { id: "shamble", name: "Shamble", desc: "Best drive, then play own ball", icon: "🔀", category: "Team", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "All team members tee off. The team selects the best drive. From that spot, each player plays their own ball into the hole. Best individual score from the team counts." },
    { id: "alternate_shot", name: "Alternate Shot", desc: "Partners alternate shots on each hole", icon: "🔁", category: "Team", isPremium: true, minPlayers: 4, maxPlayers: 40, rules: "Partners take turns hitting shots. Player A tees off on odd holes, Player B on even holes. One ball per team, alternating every shot. Very strategic. Lowest gross team total wins. Each losing player pays one bet unit total, shared equally by the winning pair. Tied lowest teams push." },
    { id: "chapman", name: "Chapman", desc: "Drive, swap, pick best, then alternate", icon: "🌲", category: "Team", isPremium: true, minPlayers: 4, maxPlayers: 40, rules: "Both partners drive. Then they swap balls and hit the second shot. After second shots, the team picks the better ball and alternates shots from there until holed. Lowest gross team total wins. Each losing player pays one bet unit total, shared equally by the winning pair. Tied lowest teams push." },
    { id: "fourball", name: "Four-Ball", desc: "Best ball of partner in match play", icon: "4️⃣", category: "Team", isPremium: true, minPlayers: 4, maxPlayers: 40, rules: "Teams of 2 in match play. Each player plays their own ball. The better score from each team is compared hole by hole. Win the hole with the lower best-ball score." },
  ],
};

export const ALL_GAMES: GameTypeInfo[] = [...GAME_TYPES.individual, ...GAME_TYPES.team];

export const FREE_GAME_IDS: GameType[] = [
  ...FREE_GAMES,
];

/** Games with fully working calculators AND settlement integration */
export const IMPLEMENTED_GAME_IDS: GameType[] = [
  // Tier 1 — no auxiliary data needed
  "stroke_play", "match_play", "stableford", "mod_stableford",
  "skins", "skins_carry", "nassau", "best_ball",
  "nassau_press", "nines", "vegas", "sixes", "closeout",
  "quota", "chicago", "aces_deuces", "dots", "rabbit",
  "defender", "fourball", "scramble", "shamble", "banker",
  "wolf", "hammer", "snake", "greenies", "bingo_bango_bongo", "alternate_shot", "chapman",
  // Tier 2 — require auxiliary per-hole input
];

/** Check if a game is fully implemented (not coming soon) */
export function isGameImplemented(id: GameType): boolean {
  return IMPLEMENTED_GAME_IDS.includes(id);
}

// ═══════════════════════════════════════════════════════════════════
// GAME VARIATION PRESETS
// Sourced from Golf Betting Games research — easy toggles per game
// ═══════════════════════════════════════════════════════════════════

export interface GameVariation {
  id: string;
  label: string;
  desc: string;
  configKey: keyof GameConfig;
  configValue: unknown;
  appliesTo: GameType[];
  tag: "standard" | "spicy" | "wild";
}

export const LEGACY_GAME_VARIATIONS: GameVariation[] = [
  // ── Skins variations ──
  {
    id: "skins_tiered",
    label: "Tiered Values",
    desc: "Skin units: holes 1–6 = 1, 7–12 = 2, 13–18 = 3. Tied units carry only in Carryover Skins.",
    configKey: "skinsTier",
    configValue: "tiered",
    appliesTo: ["skins", "skins_carry"],
    tag: "standard",
  },
  {
    id: "skins_progressive",
    label: "Progressive Values",
    desc: "Hole N is worth N skin units; tied units retain their original values.",
    configKey: "skinsTier",
    configValue: "progressive",
    appliesTo: ["skins", "skins_carry"],
    tag: "wild",
  },
  {
    id: "skins_birdie_mult",
    label: "Birdie/Eagle Multiplier",
    desc: "An outright gross birdie doubles that hole's units; eagle or better triples them. Carried units are not multiplied.",
    configKey: "birdieMultiplier",
    configValue: true,
    appliesTo: ["skins", "skins_carry"],
    tag: "spicy",
  },
  {
    id: "skins_validation",
    label: "Validation Rule",
    desc: "A win containing carried units is pending until the winner makes gross par or better on the next hole. Failure returns the original units to the pot. A win on 18 is exempt.",
    configKey: "validationRule",
    configValue: true,
    appliesTo: ["skins_carry"],
    tag: "spicy",
  },
  {
    id: "skins_team",
    label: "Team Skins (Best Ball)",
    desc: "Two-player teams compete with best ball. Each team's skin entitlement is split equally between its partners.",
    configKey: "teamSkins",
    configValue: true,
    appliesTo: ["skins", "skins_carry"],
    tag: "standard",
  },

  // ── Nassau variations ──
  {
    id: "nassau_weighted",
    label: "Weighted (5-5-10)",
    desc: "Front nine 1 bet unit, back nine 1, overall 2. With a $5 unit: $5/$5/$10. Presses inherit their parent bet's stake.",
    configKey: "nassauWeights",
    configValue: [1, 1, 2],
    appliesTo: ["nassau", "nassau_press"],
    tag: "standard",
  },
  {
    id: "nassau_auto_press",
    label: "Auto-Press at 2 Down",
    desc: "Whenever any player/team falls 2 holes behind in any segment, a new press is automatically triggered. Most common house rule at clubs. Keeps all players invested.",
    configKey: "pressAt",
    configValue: 2,
    appliesTo: ["nassau", "nassau_press"],
    tag: "standard",
  },
  {
    id: "nassau_press_press",
    label: "Press the Press",
    desc: "A press that reaches 2 down starts one further press on the next hole, at the same stake and end hole.",
    configKey: "pressThePress",
    configValue: true,
    appliesTo: ["nassau_press"],
    tag: "spicy",
  },
  {
    id: "nassau_aloha",
    label: "Aloha Press",
    desc: "Mandatory separate bet on 18 worth HALF the original base unit, regardless of weights or earlier results. A tie pushes.",
    configKey: "alohaPressOn18",
    configValue: true,
    appliesTo: ["nassau", "nassau_press"],
    tag: "spicy",
  },
  {
    id: "nassau_no_press_last",
    label: "No Press on 9 and 18",
    desc: "No new press may start on holes 9 or 18. Existing bets continue through their end hole.",
    configKey: "noPressLast",
    configValue: true,
    appliesTo: ["nassau_press"],
    tag: "standard",
  },
  {
    id: "nassau_junk",
    label: "Junk Nassau",
    desc: "Each gross birdie or better, confirmed sandy, barkie, and qualifying par-3 greenie earns 1 unit from each other player. Feats stack once per player per hole, separate from Nassau weights and presses.",
    configKey: "junkNassau",
    configValue: true,
    appliesTo: ["nassau", "nassau_press"],
    tag: "wild",
  },

  // ── Wolf variations ──
  {
    id: "wolf_blind",
    label: "Blind Wolf",
    desc: "Record Blind Wolf before anyone tees off. The Wolf plays alone for 3 units against EACH opponent, win or lose. Ordinary solo is 2 per opponent.",
    configKey: "blindWolf",
    configValue: true,
    appliesTo: ["wolf"],
    tag: "wild",
  },
  {
    id: "wolf_pig",
    label: "The Pig",
    desc: "A selected partner may refuse before play continues, forcing the Wolf solo at 4 units per opponent, win or lose. Cannot combine with Blind Wolf on the same hole.",
    configKey: "pigVariation",
    configValue: true,
    appliesTo: ["wolf"],
    tag: "spicy",
  },
  {
    id: "wolf_carryover",
    label: "Carryover on Ties",
    desc: "Each tied hole carries one base stake. The next decided hole multiplies its normal payout by the number of stacked holes. No exponential doubling; unresolved final ties pay nothing.",
    configKey: "wolfCarryover",
    configValue: true,
    appliesTo: ["wolf"],
    tag: "standard",
  },

  // ── Snake variations ──
  {
    id: "snake_progressive",
    label: "Progressive Snake",
    desc: "First ownership is 1 unit per opponent. Each chronological change of holder doubles the final stake; repeat three-putts by the same holder do not double it. Confirm ordered events every hole. Unsafe totals cannot settle.",
    configKey: "progressiveSnake",
    configValue: true,
    appliesTo: ["snake"],
    tag: "spicy",
  },

  // ── Stableford variations ──
  {
    id: "stableford_modified",
    label: "Modified (Barracuda)",
    desc: "Barracuda points: albatross or better +8, eagle +5, birdie +2, par 0, bogey −1, double or worse −3.",
    configKey: "modifiedStableford",
    configValue: true,
    appliesTo: ["stableford"],
    tag: "spicy",
  },
  {
    id: "stableford_joker",
    label: "Joker Holes",
    desc: "Each player publicly records TWO distinct Joker holes before the round. All points on those holes double, including negative points.",
    configKey: "jokerEnabled",
    configValue: true,
    appliesTo: ["stableford"],
    tag: "wild",
  },

  // ── Vegas variations ──
  {
    id: "vegas_birdie_flip",
    label: "Flip the Bird",
    desc: "A gross birdie reverses the opposing team's number. Both teams may reverse; no automatic win or extra doubling. Vegas digit cap: 9.",
    configKey: "birdieFlip",
    configValue: true,
    appliesTo: ["vegas"],
    tag: "spicy",
  },
  {
    id: "vegas_eagle_doubles",
    label: "Eagle Rule",
    desc: "One team's gross eagle or better flips the opposing number and doubles the difference once, overriding birdie rules. Both teams eagle: no flip or double. Vegas digit cap: 9.",
    configKey: "eagleDoubles",
    configValue: true,
    appliesTo: ["vegas"],
    tag: "wild",
  },
  {
    id: "vegas_birdie_block",
    label: "Birdie Blocks Birdie",
    desc: "Requires Flip the Bird. If both teams make gross birdie, neither number reverses. Eagle Rule takes precedence. Vegas digit cap: 9.",
    configKey: "birdieBlocksBirdie",
    configValue: true,
    appliesTo: ["vegas"],
    tag: "standard",
  },

  // ── BBB variations ──
  {
    id: "bbb_birdie_double",
    label: "Double Points for Birdie",
    desc: "SnapScore house rule: each confirmed BBB category earned by a player making a gross birdie or better is worth 2 points. Other categories stay at 1. No automatic sweep or chip-in bonus.",
    configKey: "bbbBirdieDouble",
    configValue: true,
    appliesTo: ["bingo_bango_bongo"],
    tag: "standard",
  },
  {
    id: "bbb_chip_in_triple",
    label: "Chip-In Triple",
    desc: "A chip-in from off the green earns all three points simultaneously — it's first on the green (Bingo), first in the hole (Bongo), and closest (Bango) all at once. Often worth 3x value.",
    configKey: "bbbChipInTriple",
    configValue: true,
    appliesTo: ["bingo_bango_bongo"],
    tag: "wild",
  },

  // ── Sixes variations ──
  {
    id: "sixes_escalating",
    label: "Escalating Segments",
    desc: "Segments 1–6, 7–12, 13–18 pay winning-hole margin at 1, 2, 4 bet units per player.",
    configKey: "escalatingSegments",
    configValue: true,
    appliesTo: ["sixes"],
    tag: "standard",
  },
  {
    id: "sixes_presses",
    label: "Presses Within Sixes",
    desc: "Each segment starts one press after its base first reaches 2 down, starting next hole through segment end. Base and press margins settle at the segment stake. No recursive presses.",
    configKey: "sixesPresses",
    configValue: true,
    appliesTo: ["sixes"],
    tag: "spicy",
  },

  // ── Rabbit variations ──
  {
    id: "rabbit_double",
    label: "Double Rabbit",
    desc: "Add a third, full-round Rabbit wager paid by the holder at 18, in addition to front and back nine wagers. This can pay the back-nine holder twice.",
    configKey: "doubleRabbit",
    configValue: true,
    appliesTo: ["rabbit"],
    tag: "spicy",
  },

  // ── Match Play variations ──
  {
    id: "match_bisque",
    label: "Bisque Handicap",
    desc: "Handicap strokes converted into 'bisques' — strokes used at your discretion on any hole, declared before playing that hole. Save bisques for your worst hole type or the most important holes.",
    configKey: "bisqueHandicap",
    configValue: true,
    appliesTo: ["match_play"],
    tag: "spicy",
  },

  // ── Universal ──
  {
    id: "net_handicap",
    label: "Net (Handicap)",
    desc: "Net uses course-handicap strokes; match/Nassau play relative to the lowest player, Stableford/Skins use full course handicaps. Natural-score bonuses still use gross scores.",
    configKey: "netHandicap",
    configValue: true,
    appliesTo: ["nassau", "nassau_press", "match_play", "stableford"],
    tag: "standard",
  },
];

/** Only delivered capabilities feed the setup panel and advertised count. */
export const INPUT_VARIATION_IDS = ["nassau_junk","wolf_blind","wolf_pig","wolf_carryover","snake_progressive","stableford_joker","bbb_birdie_double","match_bisque"];
const WIRED_VARIATION_IDS = ["skins_tiered", "skins_progressive", "skins_birdie_mult", "skins_validation", "skins_team", "nassau_weighted", "nassau_press_press", "nassau_aloha", "nassau_no_press_last", "stableford_modified", "vegas_birdie_flip", "vegas_eagle_doubles", "vegas_birdie_block", "sixes_escalating", "sixes_presses", "rabbit_double", "net_handicap", "wolf_carryover", "snake_progressive", "bbb_birdie_double", "wolf_blind", "wolf_pig", "stableford_joker", "match_bisque", "nassau_junk"] as const;
export const GAME_VARIATIONS = LEGACY_GAME_VARIATIONS.filter(v => (WIRED_VARIATION_IDS as readonly string[]).includes(v.id));
export const HIDDEN_VARIATIONS = LEGACY_GAME_VARIATIONS.filter(v => !GAME_VARIATIONS.includes(v));
export const PLAYABLE_BASE_GAME_IDS = IMPLEMENTED_GAME_IDS;
export const PLAYABLE_OPTION_IDS = ["gross_net", "skins_group", ...GAME_VARIATIONS.filter(v => v.id !== "net_handicap").map(v => v.id)];
export const PLAYABLE_FORMAT_IDS = ["multi_round_multi_group_tournament"];
export const PLAYABLE_GAME_COUNT = PLAYABLE_BASE_GAME_IDS.length + PLAYABLE_OPTION_IDS.length + PLAYABLE_FORMAT_IDS.length;
export const GAME_LIBRARY_CAPTION = `${PLAYABLE_GAME_COUNT} ways to play across SnapScore. Pro includes games and variants. Multi-round or multi-group hosting requires Tournament Director.`;


/** New contest checks; legacy contests remain readable without adopting changed rules. */
export function validateVariationSetup(groups: {players: Player[]}[], games: GameType[], config: GameConfig, betUnit: number): string | undefined {
  if (!Number.isFinite(betUnit) || betUnit < 0 || !Number.isSafeInteger(Math.round(betUnit * 100)) || Math.abs(betUnit * 100 - Math.round(betUnit * 100)) > 1e-7) return "Bet unit must be a nonnegative amount with at most two decimal places.";
  for(const v of GAME_VARIATIONS) {const value=config[v.configKey];if(value===undefined || value===false && v.configValue===true)continue;if(v.configKey==="nassauWeights" && JSON.stringify(value)==="[1,1,1]")continue;if(v.configKey==="skinsTier" && ["flat","tiered","progressive"].includes(String(value)))continue;if(JSON.stringify(value)!==JSON.stringify(v.configValue) && !GAME_VARIATIONS.some(other=>other.configKey===v.configKey && JSON.stringify(other.configValue)===JSON.stringify(value)))return `Invalid value for ${v.label}`;}
  if(config.skinsMode!==undefined && !["net","gross"].includes(config.skinsMode) || config.skinsScope!==undefined && !["field","group"].includes(config.skinsScope))return "Invalid Skins mode or scope";
  if (games.some(g => !isGameImplemented(g))) return "This game is unavailable until scoring and settlement are complete.";
  const players = groups.flatMap(g => g.players);
  if (new Set(games).size !== games.length) return "Select each game only once.";
  if (games.some(g=>g==="alternate_shot" || g==="chapman")) {
    if(games.length!==1) return "Shared-ball formats require a separate contest with one team card.";
    for(const group of groups){const teams=[...new Set(group.players.map(p=>p.team))];if(teams.length<2 || teams.some(t=>!t || group.players.filter(p=>p.team===t).length!==2)) return "Shared-ball formats require two or more complete pairs.";}
  }
  if(games.includes("wolf") && groups.some(g=>g.players.length!==4)) return "Wolf requires four players per group.";
  if(games.includes("hammer") && groups.some(g=>g.players.length!==2)) return "Hammer requires two players per group.";
  if (new Set(players.map(p => p.name)).size !== players.length || new Set(players.map(p => p.id)).size !== players.length) return "Use a unique name and ID for each player.";
  if (games.includes("skins") && games.includes("skins_carry") || games.includes("nassau") && games.includes("nassau_press")) return "Choose one preset for each game.";
  if(config.junkNassau && games.some(g=>g==="dots" || g==="greenies")) return "Junk Nassau cannot also pay standalone Dots or Greenies.";
  if(config.bisqueHandicap && players.some(p=>Math.round(p.courseHandicaps?.[""]??p.handicap)<0)) return "Bisque requires nonnegative course handicaps; use indexed net for plus handicaps.";
  if (config.alohaPressOn18 && config.noPressLast) return "Aloha conflicts with No Press on 9 and 18.";
  if (config.birdieBlocksBirdie && !config.birdieFlip) return "Birdie Blocks Birdie requires Flip the Bird.";
  if (config.validationRule && !games.includes("skins_carry")) return "Validation requires Carryover Skins.";
  if ((config.pressThePress || config.noPressLast) && !games.includes("nassau_press")) return "Select Nassau with Presses.";
  const scopes = config.skinsScope === "group" ? groups : [{players}];
  if (config.teamSkins) for (const scope of scopes) {
    const teams = [...new Set(scope.players.map(p => p.team))];
    if (teams.length < 2 || teams.some(t => !t || scope.players.filter(p => p.team === t).length !== 2)) return "Team Skins requires complete two-player teams in each competition scope.";
  }
  if (games.includes("match_play") && groups.some(g => g.players.length !== 2)) return "Match Play requires two players per group.";
  if (games.includes("sixes") && groups.some(g => g.players.length !== 4)) return "Sixes requires four players per group.";
  if (games.some(g => g === "nassau" || g === "nassau_press")) for (const group of groups) {
    if (group.players.length !== 2 && group.players.length !== 4) return "Nassau requires two individuals or four players in two pairs per group.";
    if (group.players.length === 4) {
      const teams = [...new Set(group.players.map(p => p.team))];
      if (teams.length !== 2 || teams.some(t => !t || group.players.filter(p => p.team === t).length !== 2)) return "Assign two complete Nassau pairs.";
    }
  }
  if (games.includes("vegas")) for (const group of groups) {
    const teams = [...new Set(group.players.map(p => p.team))];
    if (teams.length !== 2 || teams.some(t => !t || group.players.filter(p => p.team === t).length !== 2)) return "Vegas requires two assigned pairs per group.";
  }
}

/** Execute only the selected game's supported rules; unknown saved keys remain stored for audit. */
export function configForGame(config: GameConfig, game: GameType): GameConfig {
  const result: GameConfig = {rulesVersion:config.rulesVersion,inputRulesVersion:config.inputRulesVersion};
  if (game === "skins" || game === "skins_carry") { result.skinsMode = config.skinsMode; result.skinsScope = config.skinsScope; }
  for (const v of GAME_VARIATIONS) if ((!INPUT_VARIATION_IDS.includes(v.id) || config.inputRulesVersion===1) && v.appliesTo.includes(game) && config[v.configKey] !== undefined) result[v.configKey] = config[v.configKey];
  return result;
}

/** Shared execution normalization leaves the persisted audit record intact. */
export function executionGameConfig(games:GameType[],stored:GameConfig={}):GameConfig {
 return stored.rulesVersion===1?Object.assign({rulesVersion:1,inputRulesVersion:stored.inputRulesVersion},...games.map(game=>configForGame(stored,game))):stored;
}
