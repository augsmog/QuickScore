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
  team?: "A" | "B" | null;
  scores: number[]; // 18 holes, 0 = not yet played
  putts?: number[]; // 18 holes, 0 = not entered (for Snake)
}

// Auxiliary data for games that need per-hole input beyond scores
export interface AuxiliaryData {
  wolf?: { [hole: number]: { partnerId: string | null; isLoneWolf: boolean } };
  hammer?: { [hole: number]: { hammered: boolean; hammerBy: string; accepted: boolean } };
  snake?: { [hole: number]: string[] }; // player IDs who 3-putted
  greenies?: { [hole: number]: string | null }; // player ID of greenie winner
  bbb?: { [hole: number]: { bingo: string; bango: string; bongo: string } };
}

export interface GamePlayer {
  id: string;
  name: string;
  handicap: number;
  team?: "A" | "B" | null;
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
  // Skins
  carryover?: boolean;
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
  netByPlayer: Record<string, number>; // positive = winning
}

// Game registry

export const GAME_TYPES: { individual: GameTypeInfo[]; team: GameTypeInfo[] } = {
  individual: [
    { id: "stroke_play", name: "Stroke Play", desc: "Lowest total strokes wins", icon: "🏌️", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 40, rules: "Each player counts every stroke. The player with the fewest total strokes across 18 holes wins. Front 9, Back 9, and Overall totals are tracked." },
    { id: "match_play", name: "Match Play", desc: "Win individual holes head-to-head", icon: "⚔️", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 2, rules: "Two players compete hole by hole. Win a hole by having the lower score. The player who wins the most holes wins the match. Reported as '2 & 1' (2 up with 1 to play)." },
    { id: "stableford", name: "Stableford", desc: "Points per hole based on score vs par", icon: "⭐", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 40, rules: "Points awarded per hole: Eagle or better = 4, Birdie = 3, Par = 2, Bogey = 1, Double+ = 0. Highest total points wins. Great for handicap play." },
    { id: "mod_stableford", name: "Modified Stableford", desc: "Rewards birdies/eagles, penalizes bogeys+", icon: "💫", category: "Classic", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Aggressive scoring: Eagle+ = +8, Birdie = +5, Par = +2, Bogey = -1, Double = -3, Triple+ = -5. Rewards attacking play and penalizes blowup holes." },
    { id: "skins", name: "Skins", desc: "Win the hole outright to take the skin", icon: "💰", category: "Money Games", isPremium: false, minPlayers: 2, maxPlayers: 40, rules: "Each hole is worth 1 skin (bet unit). The player with the lowest score on a hole wins that skin outright. If two or more players tie for low score, the hole is a push." },
    { id: "skins_carry", name: "Skins (Carryover)", desc: "Tied skins carry to next hole", icon: "💰", category: "Money Games", isPremium: false, minPlayers: 2, maxPlayers: 40, rules: "Same as Skins, but when a hole is tied, the skin carries over to the next hole. This creates big-value skins that build up over multiple tied holes." },
    { id: "nassau", name: "Nassau", desc: "3 bets: front 9, back 9, overall", icon: "🎰", category: "Money Games", isPremium: false, minPlayers: 2, maxPlayers: 4, rules: "Three separate match play bets: Front 9, Back 9, and Overall 18. Each bet is worth 1 unit. With 2 players, head-to-head. With 4 players, play as 2v2 teams using best ball per hole." },
    { id: "nassau_press", name: "Nassau w/ Presses", desc: "Nassau with auto-press when 2 down", icon: "🎰", category: "Money Games", isPremium: true, minPlayers: 2, maxPlayers: 4, rules: "Standard Nassau with automatic presses. When a side falls 2-down in any bet, a new side bet (press) automatically starts from that hole. Works 1v1 or 2v2 teams." },
    { id: "wolf", name: "Wolf", desc: "Choose partner or go lone wolf each hole", icon: "🐺", category: "Strategy", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "The Wolf rotates each hole. After seeing tee shots, the Wolf picks a partner or goes Lone Wolf. Wolf+partner vs the other 2. Lone Wolf wins/loses 4x; team wins/loses 2x each." },
    { id: "banker", name: "Banker", desc: "Rotating banker takes all bets on hole", icon: "🏦", category: "Strategy", isPremium: true, minPlayers: 3, maxPlayers: 40, rules: "The Banker rotates each hole. If the Banker has the lowest score, they collect 1 unit from each player. If anyone beats the Banker, the Banker pays that player 1 unit." },
    { id: "hammer", name: "Hammer", desc: "Double the bet mid-hole for pressure", icon: "🔨", category: "Pressure", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Each hole starts at 1 unit. Either player can 'hammer' (double the bet) during the hole. Opponent must accept the doubled bet or concede the hole. Creates intense pressure moments." },
    { id: "snake", name: "Snake", desc: "Last to 3-putt holds the snake", icon: "🐍", category: "Putting", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "The last player to 3-putt 'holds the snake.' At the end of the round, the snake holder pays each other player 1 unit. Keeps everyone focused on putting." },
    { id: "bingo_bango_bongo", name: "Bingo Bango Bongo", desc: "Points for first on, closest, first in", icon: "🎯", category: "Points", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Three points per hole: Bingo (first on the green), Bango (closest to pin once all on green), Bongo (first to hole out). Each point = 1 unit." },
    { id: "dots", name: "Dots / Trash", desc: "Points for birdies, greenies, sandies, etc.", icon: "🎲", category: "Points", isPremium: true, minPlayers: 2, maxPlayers: 40, rules: "Earn dots (points) for achievements: Birdie or better = +2, Par = +1, Bogey = 0, Double+ = -1. Additional dots for greenies, sandies, and other feats." },
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
    { id: "alternate_shot", name: "Alternate Shot", desc: "Partners alternate shots on each hole", icon: "🔁", category: "Team", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Partners take turns hitting shots. Player A tees off on odd holes, Player B on even holes. One ball per team, alternating every shot. Very strategic." },
    { id: "chapman", name: "Chapman", desc: "Drive, swap, pick best, then alternate", icon: "🌲", category: "Team", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Both partners drive. Then they swap balls and hit the second shot. After second shots, the team picks the better ball and alternates shots from there until holed." },
    { id: "fourball", name: "Four-Ball", desc: "Best ball of partner in match play", icon: "4️⃣", category: "Team", isPremium: true, minPlayers: 4, maxPlayers: 40, rules: "Teams of 2 in match play. Each player plays their own ball. The better score from each team is compared hole by hole. Win the hole with the lower best-ball score." },
  ],
};

export const ALL_GAMES: GameTypeInfo[] = [...GAME_TYPES.individual, ...GAME_TYPES.team];

export const FREE_GAME_IDS: GameType[] = [
  "stroke_play", "match_play", "stableford", "skins", "skins_carry", "nassau", "best_ball",
];

/** Games with fully working calculators AND settlement integration */
export const IMPLEMENTED_GAME_IDS: GameType[] = [
  // Tier 1 — no auxiliary data needed
  "stroke_play", "match_play", "stableford", "mod_stableford",
  "skins", "skins_carry", "nassau", "best_ball",
  "nassau_press", "nines", "vegas", "sixes", "closeout",
  "quota", "chicago", "aces_deuces", "dots", "rabbit",
  "defender", "fourball", "scramble", "shamble", "banker",
  // Tier 2 — require auxiliary per-hole input
  "wolf", "hammer", "snake", "bingo_bango_bongo", "greenies",
  // Team formats
  "alternate_shot", "chapman",
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

export const GAME_VARIATIONS: GameVariation[] = [
  // ── Skins variations ──
  {
    id: "skins_tiered",
    label: "Tiered Values",
    desc: "Holes 1-6: 1x, 7-12: 2x, 13-18: 3x. Back nine always financially meaningful. Many groups simply double the entire back nine.",
    configKey: "skinsTier",
    configValue: "tiered",
    appliesTo: ["skins", "skins_carry"],
    tag: "standard",
  },
  {
    id: "skins_progressive",
    label: "Progressive Values",
    desc: "Skin value increases per hole: hole 1 = 1x, hole 2 = 2x, etc. Holes 16-18 worth 16-18x each. The final three holes are worth more than the first ten combined.",
    configKey: "skinsTier",
    configValue: "progressive",
    appliesTo: ["skins", "skins_carry"],
    tag: "wild",
  },
  {
    id: "skins_birdie_mult",
    label: "Birdie/Eagle Multiplier",
    desc: "A birdie wins 2x the skin value; an eagle wins 3x — only when also the outright low score. Massive incentive to attack pins on carryover holes.",
    configKey: "birdieMultiplier",
    configValue: true,
    appliesTo: ["skins", "skins_carry"],
    tag: "spicy",
  },
  {
    id: "skins_validation",
    label: "Validation Rule",
    desc: "Win a skin from a carryover? You must make par or better on the very next hole to keep it. Fail and the skin carries over again. Prevents lucky wins from collecting accumulated skins.",
    configKey: "validationRule",
    configValue: true,
    appliesTo: ["skins_carry"],
    tag: "spicy",
  },
  {
    id: "skins_team",
    label: "Team Skins (Best Ball)",
    desc: "Teams of 2 compete using best ball per hole. Winning team splits the skin equally. Common in pro-ams and corporate outings.",
    configKey: "teamSkins",
    configValue: true,
    appliesTo: ["skins", "skins_carry"],
    tag: "standard",
  },

  // ── Nassau variations ──
  {
    id: "nassau_weighted",
    label: "Weighted (5-5-10)",
    desc: "Overall match worth double the individual nines. Emphasizes full-round consistency — you can win both nines but still lose if your margins were thin.",
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
    desc: "A press bet can itself be pressed if the pressing team falls 2-down in that press. Creates cascading parallel bets — a $5 Nassau can have 4+ simultaneous matches running by hole 17.",
    configKey: "pressThePress",
    configValue: true,
    appliesTo: ["nassau_press"],
    tag: "spicy",
  },
  {
    id: "nassau_aloha",
    label: "Aloha Press",
    desc: "A mandatory press on the 18th hole only, worth half the original bet. Creates one last dramatic swing regardless of match status. Popular in Hawaiian golf culture.",
    configKey: "alohaPressOn18",
    configValue: true,
    appliesTo: ["nassau", "nassau_press"],
    tag: "spicy",
  },
  {
    id: "nassau_no_press_last",
    label: "No Press on 9 and 18",
    desc: "No new press allowed on the final hole of each nine. A one-hole press is essentially a coin flip — widely considered poor form. Some groups also exclude holes 8 and 17.",
    configKey: "noPressLast",
    configValue: true,
    appliesTo: ["nassau_press"],
    tag: "standard",
  },
  {
    id: "nassau_junk",
    label: "Junk Nassau",
    desc: "Sandies, Barkies, Greenies, and other dots run alongside the Nassau simultaneously. Tracked separately, settled independently. You might play a $5 Nassau but settle $40 in junk.",
    configKey: "junkNassau",
    configValue: true,
    appliesTo: ["nassau", "nassau_press"],
    tag: "wild",
  },

  // ── Wolf variations ──
  {
    id: "wolf_blind",
    label: "Blind Wolf",
    desc: "Wolf declares solo before ANYONE hits — including themselves. Points triple or quadruple. Maximum risk, maximum reward. Psychologically rattles opponents.",
    configKey: "blindWolf",
    configValue: true,
    appliesTo: ["wolf"],
    tag: "wild",
  },
  {
    id: "wolf_pig",
    label: "The Pig",
    desc: "After Wolf picks a partner, that partner can REFUSE — forcing the Wolf into Lone Wolf automatically. All bets double for that hole. Classic power move.",
    configKey: "pigVariation",
    configValue: true,
    appliesTo: ["wolf"],
    tag: "spicy",
  },
  {
    id: "wolf_carryover",
    label: "Carryover on Ties",
    desc: "Tied holes stack the point value to the next hole, often with a doubling multiplier. Massive pressure on the hole after a push.",
    configKey: "wolfCarryover",
    configValue: true,
    appliesTo: ["wolf"],
    tag: "standard",
  },

  // ── Snake variations ──
  {
    id: "snake_progressive",
    label: "Progressive Snake",
    desc: "Every time the Snake changes hands, the bet doubles. 1st 3-putt = 1x, 2nd = 2x, 3rd = 4x. By hole 18, the Snake could be worth 16x+. One late 3-putt can ruin a round financially.",
    configKey: "progressiveSnake",
    configValue: true,
    appliesTo: ["snake"],
    tag: "spicy",
  },

  // ── Stableford variations ──
  {
    id: "stableford_modified",
    label: "Modified (Barracuda)",
    desc: "Double bogey+ = -3, Bogey = -1, Par = 0, Birdie = +2, Eagle = +5, Albatross = +8. The PGA Tour variant. Drastically penalizes bad holes while massively rewarding eagles.",
    configKey: "modifiedStableford",
    configValue: true,
    appliesTo: ["stableford"],
    tag: "spicy",
  },
  {
    id: "stableford_joker",
    label: "Joker Holes",
    desc: "Before the round, each player secretly selects 1-3 'joker' holes where all points are doubled. Reveal at the end. Creates pre-round strategy and post-round second-guessing.",
    configKey: "jokerHoles",
    configValue: [5, 12, 16],
    appliesTo: ["stableford"],
    tag: "wild",
  },

  // ── Vegas variations ──
  {
    id: "vegas_birdie_flip",
    label: "Flip the Bird",
    desc: "Natural birdie by any team member and that team wins the hole — opposing team's score reverses (56 becomes 65). Both team members birdie = flip AND point difference doubles. The wildest single-rule mechanic in golf betting.",
    configKey: "birdieFlip",
    configValue: true,
    appliesTo: ["vegas"],
    tag: "spicy",
  },
  {
    id: "vegas_eagle_doubles",
    label: "Eagle Rule",
    desc: "An eagle flips the opposing score AND doubles the resulting point difference. Both teams eagle = no flip, no double (they cancel). An eagle when already winning by 20+ points becomes 40+ after the double.",
    configKey: "eagleDoubles",
    configValue: true,
    appliesTo: ["vegas"],
    tag: "wild",
  },
  {
    id: "vegas_birdie_block",
    label: "Birdie Blocks Birdie",
    desc: "If BOTH teams have at least one birdie, the flip is blocked — scores stay low-first. Prevents one birdie from flipping when the other team also birdied. Important fairness mechanism.",
    configKey: "birdieBlocksBirdie",
    configValue: true,
    appliesTo: ["vegas"],
    tag: "standard",
  },

  // ── BBB variations ──
  {
    id: "bbb_birdie_double",
    label: "Double Points for Birdie",
    desc: "Any of the three points earned on a hole where the player makes birdie is worth 2 instead of 1. Creates incentive to attack rather than just park the ball. Very common house rule.",
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
    desc: "Front six = 1x, middle = 2x, final = 4x bet. The final six — where you're paired with your least-frequent partner — is the deciding stretch. Keeps everyone invested in the final holes.",
    configKey: "escalatingSegments",
    configValue: true,
    appliesTo: ["sixes"],
    tag: "standard",
  },
  {
    id: "sixes_presses",
    label: "Presses Within Sixes",
    desc: "Standard press rules apply within each six-hole segment. Fall 2 holes down within your six = automatic press on remaining holes. Multiple presses within a single six can multiply the bet.",
    configKey: "sixesPresses",
    configValue: true,
    appliesTo: ["sixes"],
    tag: "spicy",
  },

  // ── Rabbit variations ──
  {
    id: "rabbit_double",
    label: "Double Rabbit",
    desc: "Three Rabbit bets: front 9, back 9, AND full 18. Holder at 18 wins the overall pot, independent of who won the nine-pots. Adds a third financial dimension.",
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
    desc: "Apply handicap strokes hole-by-hole based on stroke index for fair play across skill levels. Lower handicapper plays scratch; others receive strokes on rated holes.",
    configKey: "netHandicap",
    configValue: true,
    appliesTo: ["skins", "skins_carry", "nassau", "nassau_press", "match_play", "stableford"],
    tag: "standard",
  },
];
