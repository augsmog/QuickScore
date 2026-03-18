import { GameType } from "./types";
import { calcStrokePlay } from "./calculators/stroke-play";
import { calcMatchPlay } from "./calculators/match-play";
import { calcStableford } from "./calculators/stableford";
import { calcSkins } from "./calculators/skins";
import { calcNassau } from "./calculators/nassau";
import { calcNines } from "./calculators/nines";
import { calcVegas } from "./calculators/vegas";
import { calcBestBall } from "./calculators/best-ball";

export {
  calcStrokePlay,
  calcMatchPlay,
  calcStableford,
  calcSkins,
  calcNassau,
  calcNines,
  calcVegas,
  calcBestBall,
};

/** Games that require exactly 2 players (head-to-head) */
export const HEAD_TO_HEAD_GAMES: GameType[] = ["match_play", "nassau", "nassau_press"];

/** Games that require teams */
export const TEAM_GAMES: GameType[] = [
  "vegas", "best_ball", "scramble", "shamble", "alternate_shot", "chapman", "fourball",
];

/** Games that require exactly 4 players */
export const FOURSOME_GAMES: GameType[] = ["nines", "wolf"];
