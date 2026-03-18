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

// Game configuration options
export interface GameConfig {
  carryover?: boolean;
  pressAt?: number; // for Nassau, auto-press when N down
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
    { id: "stroke_play", name: "Stroke Play", desc: "Lowest total strokes wins", icon: "🏌️", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 8, rules: "Each player counts every stroke. The player with the fewest total strokes across 18 holes wins. Front 9, Back 9, and Overall totals are tracked." },
    { id: "match_play", name: "Match Play", desc: "Win individual holes head-to-head", icon: "⚔️", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 2, rules: "Two players compete hole by hole. Win a hole by having the lower score. The player who wins the most holes wins the match. Reported as '2 & 1' (2 up with 1 to play)." },
    { id: "stableford", name: "Stableford", desc: "Points per hole based on score vs par", icon: "⭐", category: "Classic", isPremium: false, minPlayers: 2, maxPlayers: 8, rules: "Points awarded per hole: Eagle or better = 4, Birdie = 3, Par = 2, Bogey = 1, Double+ = 0. Highest total points wins. Great for handicap play." },
    { id: "mod_stableford", name: "Modified Stableford", desc: "Rewards birdies/eagles, penalizes bogeys+", icon: "💫", category: "Classic", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "Aggressive scoring: Eagle+ = +8, Birdie = +5, Par = +2, Bogey = -1, Double = -3, Triple+ = -5. Rewards attacking play and penalizes blowup holes." },
    { id: "skins", name: "Skins", desc: "Win the hole outright to take the skin", icon: "💰", category: "Money Games", isPremium: false, minPlayers: 2, maxPlayers: 8, rules: "Each hole is worth 1 skin (bet unit). The player with the lowest score on a hole wins that skin outright. If two or more players tie for low score, the hole is a push." },
    { id: "skins_carry", name: "Skins (Carryover)", desc: "Tied skins carry to next hole", icon: "💰", category: "Money Games", isPremium: false, minPlayers: 2, maxPlayers: 8, rules: "Same as Skins, but when a hole is tied, the skin carries over to the next hole. This creates big-value skins that build up over multiple tied holes." },
    { id: "nassau", name: "Nassau", desc: "3 bets: front 9, back 9, overall", icon: "🎰", category: "Money Games", isPremium: false, minPlayers: 2, maxPlayers: 2, rules: "Three separate match play bets in one: Front 9, Back 9, and Overall 18. Each bet is worth 1 unit. Win a hole to go 1-up in that bet." },
    { id: "nassau_press", name: "Nassau w/ Presses", desc: "Nassau with auto-press when 2 down", icon: "🎰", category: "Money Games", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Standard Nassau with automatic presses. When a player falls 2-down in any bet, a new side bet (press) automatically starts from that hole. Presses can create multiple overlapping bets." },
    { id: "wolf", name: "Wolf", desc: "Choose partner or go lone wolf each hole", icon: "🐺", category: "Strategy", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "The Wolf rotates each hole. After seeing tee shots, the Wolf picks a partner or goes Lone Wolf. Wolf+partner vs the other 2. Lone Wolf wins/loses 4x; team wins/loses 2x each." },
    { id: "banker", name: "Banker", desc: "Rotating banker takes all bets on hole", icon: "🏦", category: "Strategy", isPremium: true, minPlayers: 3, maxPlayers: 8, rules: "The Banker rotates each hole. If the Banker has the lowest score, they collect 1 unit from each player. If anyone beats the Banker, the Banker pays that player 1 unit." },
    { id: "hammer", name: "Hammer", desc: "Double the bet mid-hole for pressure", icon: "🔨", category: "Pressure", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Each hole starts at 1 unit. Either player can 'hammer' (double the bet) during the hole. Opponent must accept the doubled bet or concede the hole. Creates intense pressure moments." },
    { id: "snake", name: "Snake", desc: "Last to 3-putt holds the snake", icon: "🐍", category: "Putting", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "The last player to 3-putt 'holds the snake.' At the end of the round, the snake holder pays each other player 1 unit. Keeps everyone focused on putting." },
    { id: "bingo_bango_bongo", name: "Bingo Bango Bongo", desc: "Points for first on, closest, first in", icon: "🎯", category: "Points", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "Three points per hole: Bingo (first on the green), Bango (closest to pin once all on green), Bongo (first to hole out). Each point = 1 unit." },
    { id: "dots", name: "Dots / Trash", desc: "Points for birdies, greenies, sandies, etc.", icon: "🎲", category: "Points", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "Earn dots (points) for achievements: Birdie or better = +2, Par = +1, Bogey = 0, Double+ = -1. Additional dots for greenies, sandies, and other feats." },
    { id: "rabbit", name: "Rabbit", desc: "Catch the rabbit with low score, keep it", icon: "🐰", category: "Chase", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "The lowest scorer on a hole 'catches the rabbit.' Hold it until someone else posts a lower score. Whoever holds the rabbit at hole 9 and 18 wins the pot from all other players." },
    { id: "defender", name: "Defender", desc: "Rotating defender vs field best ball", icon: "🛡️", category: "Strategy", isPremium: true, minPlayers: 3, maxPlayers: 8, rules: "One player defends each hole (rotates). If the Defender beats the field's best score, they collect from everyone. If the field wins, the best scorer collects from the Defender." },
    { id: "nines", name: "Nines", desc: "9 points split among foursome each hole", icon: "9️⃣", category: "Points", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "9 points are distributed each hole: Best = 5, 2nd = 3, 3rd = 1, Worst = 0. Ties split points equally. After 18 holes, total points determine winners (max 162 total)." },
    { id: "vegas", name: "Vegas", desc: "Team scores combined as 2-digit number", icon: "🎲", category: "Team Money", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "Two teams of 2. Each team combines their scores into a 2-digit number (lower score first). E.g., scores of 4 and 5 = 45. The difference between team numbers is the points won/lost." },
    { id: "sixes", name: "Sixes", desc: "Partners rotate every 6 holes", icon: "🔄", category: "Rotating", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "With 4 players, partners rotate every 6 holes: A+B vs C+D (1-6), A+C vs B+D (7-12), A+D vs B+C (13-18). Best ball within each team. Everyone plays with and against everyone." },
    { id: "closeout", name: "Closeout", desc: "New match starts when one closes out", icon: "🔒", category: "Match", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Head-to-head match play. When one player clinches (leads by more holes than remain), that match is won and a new match begins on the next hole. Multiple matches = multiple bets." },
    { id: "quota", name: "Quota", desc: "Beat your point quota based on handicap", icon: "📊", category: "Handicap", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "Your quota = 36 minus your handicap. Earn Stableford points each hole. If you exceed your quota, you win. The player who exceeds their quota by the most wins. Levels the playing field." },
    { id: "chicago", name: "Chicago", desc: "Stableford points minus quota target", icon: "🌆", category: "Handicap", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "Similar to Quota. Earn Stableford points (Eagle=4, Birdie=3, Par=2, Bogey=1). Your target = 36 - handicap. Score = points earned - target. Highest net score wins." },
    { id: "greenies", name: "Greenies", desc: "Closest to pin on par 3s, must make par", icon: "🟢", category: "Par 3s", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "On par 3s, the player closest to the pin wins a greenie — but only if they make par or better. If you're closest but bogey, no greenie. Each greenie = 1 unit from each player." },
    { id: "aces_deuces", name: "Aces & Deuces", desc: "Bonus for aces, penalty for double+", icon: "🃏", category: "Bonus", isPremium: true, minPlayers: 2, maxPlayers: 8, rules: "Aces (birdie or better): collect 1 unit from each other player. Deuces (double bogey or worse): pay 1 unit to each other player. Rewards great holes and punishes blowups." },
  ],
  team: [
    { id: "best_ball", name: "Best Ball", desc: "Best score on team counts each hole", icon: "🏆", category: "Team", isPremium: false, minPlayers: 4, maxPlayers: 8, rules: "Teams of 2+. Each hole, the team's best individual score counts. The team with the lower best-ball total wins. Also called Four-Ball in stroke play format." },
    { id: "scramble", name: "Scramble", desc: "All play from best shot each time", icon: "🤝", category: "Team", isPremium: true, minPlayers: 2, maxPlayers: 4, rules: "All team members hit, then everyone plays their next shot from the spot of the best shot. Repeat until holed out. Produces very low scores. Most popular team format." },
    { id: "shamble", name: "Shamble", desc: "Best drive, then play own ball", icon: "🔀", category: "Team", isPremium: true, minPlayers: 2, maxPlayers: 4, rules: "All team members tee off. The team selects the best drive. From that spot, each player plays their own ball into the hole. Best individual score from the team counts." },
    { id: "alternate_shot", name: "Alternate Shot", desc: "Partners alternate shots on each hole", icon: "🔁", category: "Team", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Partners take turns hitting shots. Player A tees off on odd holes, Player B on even holes. One ball per team, alternating every shot. Very strategic." },
    { id: "chapman", name: "Chapman", desc: "Drive, swap, pick best, then alternate", icon: "🌲", category: "Team", isPremium: true, minPlayers: 2, maxPlayers: 2, rules: "Both partners drive. Then they swap balls and hit the second shot. After second shots, the team picks the better ball and alternates shots from there until holed." },
    { id: "fourball", name: "Four-Ball", desc: "Best ball of partner in match play", icon: "4️⃣", category: "Team", isPremium: true, minPlayers: 4, maxPlayers: 4, rules: "Two teams of 2 in match play. Each player plays their own ball. The better score from each team is compared hole by hole. Win the hole with the lower best-ball score." },
  ],
};

export const ALL_GAMES: GameTypeInfo[] = [...GAME_TYPES.individual, ...GAME_TYPES.team];

export const FREE_GAME_IDS: GameType[] = [
  "stroke_play", "match_play", "stableford", "skins", "skins_carry", "nassau", "best_ball",
];
