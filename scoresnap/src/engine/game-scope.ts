import type { GameConfig, GameType } from './types';

export type GameScope = 'event' | 'group';

// Explicitly mirror the current contest-results/skins competition boundaries.
// Record makes a newly added GameType require a deliberate default here.
const DEFAULT_GAME_SCOPES: Record<GameType, GameScope> = {
  stroke_play: 'event',
  match_play: 'group',
  stableford: 'event',
  mod_stableford: 'event',
  skins: 'event',
  skins_carry: 'event',
  nassau: 'group',
  nassau_press: 'group',
  wolf: 'group',
  banker: 'event',
  hammer: 'group',
  snake: 'group',
  bingo_bango_bongo: 'group',
  dots: 'event',
  rabbit: 'event',
  defender: 'event',
  nines: 'event',
  vegas: 'event',
  sixes: 'event',
  closeout: 'event',
  quota: 'event',
  chicago: 'event',
  greenies: 'group',
  aces_deuces: 'event',
  best_ball: 'event',
  scramble: 'event',
  shamble: 'event',
  alternate_shot: 'group',
  chapman: 'group',
  fourball: 'event',
};

/** Resolve today's behavior; gameScopes is reserved metadata, not an active override. */
export function resolveGameScope(game: GameType, config?: GameConfig): GameScope {
  if (game === 'skins' || game === 'skins_carry') {
    return config?.skinsScope === 'group' ? 'group' : 'event';
  }
  return DEFAULT_GAME_SCOPES[game];
}
